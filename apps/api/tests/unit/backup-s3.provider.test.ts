import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockLookup, mockHttpsRequest } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
  mockHttpsRequest: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mockLookup,
}));

vi.mock("node:https", () => ({
  request: mockHttpsRequest,
}));

import {
  uploadS3CompatibleArtifact,
  verifyS3CompatibleBucket,
} from "../../src/modules/migrations/backup-s3.provider.js";

const storage = {
  endpoint: "https://storage.example.com",
  region: "us-east-1",
  bucket: "laundryangel-backups",
};

const credentials = {
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key-not-real",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockLookup.mockReset();
  mockHttpsRequest.mockReset();
});

function mockSuccessfulRequest(status = 200, etag?: string) {
  mockLookup.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ]);

  mockHttpsRequest.mockImplementation(
    (_options: unknown, callback: (response: object) => void) => {
      const req = new EventEmitter() as EventEmitter & {
        write: (body: Buffer) => boolean;
        end: () => void;
        destroy: (error: Error) => void;
      };

      req.write = vi.fn(() => true);
      req.end = () => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
          resume: () => void;
        };

        response.statusCode = status;
        response.headers = etag ? { etag } : {};
        response.resume = () => {
          queueMicrotask(() => response.emit("end"));
        };

        callback(response);
      };
      req.destroy = (error) => {
        req.emit("error", error);
      };

      return req;
    },
  );
}

describe("S3-compatible backup provider", () => {
  it("signs and sends a bucket verification request over pinned HTTPS", async () => {
    mockSuccessfulRequest();

    await expect(
      verifyS3CompatibleBucket(storage, credentials),
    ).resolves.toBeUndefined();

    expect(mockLookup).toHaveBeenCalledWith(
      "storage.example.com",
      { all: true, family: 4, verbatim: true },
    );
    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);

    const options = mockHttpsRequest.mock.calls[0]![0];
    expect(options.hostname).toBe("storage.example.com");
    expect(options.path).toBe("/laundryangel-backups");
    expect(options.method).toBe("HEAD");
    expect(options.servername).toBe("storage.example.com");
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.lookup).toBeTypeOf("function");
    expect(options.headers).toMatchObject({
      "x-amz-content-sha256": expect.any(String),
      "x-amz-date": expect.any(String),
      Authorization: expect.stringMatching(
        /^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/us-east-1\/s3\/aws4_request/,
      ),
    });
  });

  it("uploads encrypted bytes and returns the object key", async () => {
    const encrypted = Buffer.from("encrypted-test-artifact");
    mockSuccessfulRequest(200, '"test-etag"');

    const result = await uploadS3CompatibleArtifact({
      config: storage,
      credentials,
      storageKey: "business-123/backup-456.enc",
      encryptedArtifact: encrypted,
    });

    expect(result).toEqual({
      storageKey: "business-123/backup-456.enc",
      etag: '"test-etag"',
    });

    const options = mockHttpsRequest.mock.calls[0]![0];
    expect(options.path).toBe(
      "/laundryangel-backups/business-123/backup-456.enc",
    );
    expect(options.method).toBe("PUT");
    expect(options.lookup).toBeTypeOf("function");

    const req = mockHttpsRequest.mock.results[0]!.value;
    expect(req.write).toHaveBeenCalledWith(encrypted);
  });

  it("includes temporary session credentials in signed requests", async () => {
    mockSuccessfulRequest();

    await verifyS3CompatibleBucket(storage, {
      ...credentials,
      sessionToken: "temporary-session-token",
    });

    const options = mockHttpsRequest.mock.calls[0]![0];
    expect(options.headers).toMatchObject({
      "x-amz-security-token": "temporary-session-token",
    });
  });

  it.each([
    "http://storage.example.com",
    "https://localhost",
    "https://storage.example.com/path",
    "https://user:password@storage.example.com",
    "https://storage.example.com/?token=secret",
    "https://127.0.0.1",
    "https://storage.internal",
  ])("rejects unsafe endpoint %s", async (endpoint) => {
    await expect(
      verifyS3CompatibleBucket({ ...storage, endpoint }, credentials),
    ).rejects.toThrow();

    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("rejects a public hostname resolving to a private IPv4 address", async () => {
    mockLookup.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);

    await expect(
      verifyS3CompatibleBucket(storage, credentials),
    ).rejects.toThrow();

    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("rejects a hostname when any resolved IPv4 address is non-public", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    await expect(
      verifyS3CompatibleBucket(storage, credentials),
    ).rejects.toThrow();

    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("sanitizes provider verification failures", async () => {
    mockSuccessfulRequest(403);

    await expect(
      verifyS3CompatibleBucket(storage, credentials),
    ).rejects.toThrow("HTTP 403");
  });

  it("sanitizes provider upload failures", async () => {
    mockSuccessfulRequest(500);

    await expect(
      uploadS3CompatibleArtifact({
        config: storage,
        credentials,
        storageKey: "business-123/backup.enc",
        encryptedArtifact: Buffer.from("encrypted"),
      }),
    ).rejects.toThrow("HTTP 500");
  });

  it("rejects invalid object keys and empty artifacts", async () => {
    await expect(
      uploadS3CompatibleArtifact({
        config: storage,
        credentials,
        storageKey: "../backup.enc",
        encryptedArtifact: Buffer.from("encrypted"),
      }),
    ).rejects.toThrow("object key");

    await expect(
      uploadS3CompatibleArtifact({
        config: storage,
        credentials,
        storageKey: "backup.enc",
        encryptedArtifact: Buffer.alloc(0),
      }),
    ).rejects.toThrow("empty or invalid");

    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("rejects incomplete credentials before making requests", async () => {
    await expect(
      verifyS3CompatibleBucket(storage, {
        accessKeyId: "",
        secretAccessKey: "",
      }),
    ).rejects.toThrow("credentials");

    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });
});
