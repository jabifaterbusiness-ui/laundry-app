import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionUpdate: vi.fn(),
  encrypt: vi.fn((_plaintext: string, _businessId: string) => "encrypted-refreshed"),
  decrypt: vi.fn((_ciphertext: string, _businessId: string) => ""),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    backupCloudConnection: {
      update: mocks.connectionUpdate,
    },
  },
}));

vi.mock("../../src/modules/migrations/backup-crypto.service.js", () => ({
  encryptBackupCredentials: mocks.encrypt,
  decryptBackupCredentials: mocks.decrypt,
}));

vi.mock("../../src/middleware/error-handler.js", () => ({
  AppError: class AppError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AppError";
      this.statusCode = statusCode;
    }
  },
}));

import {
  deleteOAuthCloudArtifact,
  uploadOAuthCloudArtifact,
  verifyOAuthCloudDestination,
} from "../../src/modules/migrations/backup-cloud-oauth-provider.service.js";

const businessId = "business-1";
const connectionId = "connection-1";
const runId = "11111111-1111-4111-8111-111111111111";

const freshCredentials = () => ({
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: Date.now() + 60 * 60 * 1000,
  tokenType: "Bearer",
});

const inputBase = {
  businessId,
  connectionId,
  credentialsCiphertext: "encrypted-test",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("OAuth cloud provider adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.decrypt.mockReturnValue(JSON.stringify(freshCredentials()));
    mocks.connectionUpdate.mockResolvedValue({});

    process.env.GOOGLE_DRIVE_CLIENT_ID = "google-client";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "google-secret";
    process.env.DROPBOX_APP_KEY = "dropbox-client";
    process.env.DROPBOX_APP_SECRET = "dropbox-secret";
    process.env.MICROSOFT_CLIENT_ID = "microsoft-client";
    process.env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
    process.env.MICROSOFT_TENANT_ID = "common";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    delete process.env.DROPBOX_APP_KEY;
    delete process.env.DROPBOX_APP_SECRET;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.MICROSOFT_TENANT_ID;
  });

  it.each([
    {
      provider: "GOOGLE_DRIVE" as const,
      response: { id: "google-file_123" },
      expectedKey: "google:google-file_123",
      url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    },
    {
      provider: "DROPBOX" as const,
      response: { path_lower: `/laundryangel/backups/${runId}.enc` },
      expectedKey: `dropbox:/laundryangel/backups/${runId}.enc`,
      url: "https://content.dropboxapi.com/2/files/upload",
    },
    {
      provider: "ONEDRIVE" as const,
      response: { id: "oneDrive_item-123" },
      expectedKey: "onedrive:oneDrive_item-123",
      url: `https://graph.microsoft.com/v1.0/me/drive/root:/LaundryAngel/backups/${runId}.enc:/content`,
    },
  ])("uploads an artifact to $provider and returns its provider-scoped key", async ({
    provider,
    response,
    expectedKey,
    url,
  }) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadOAuthCloudArtifact({
      ...inputBase,
      provider,
      runId,
      encryptedArtifact: Buffer.from("encrypted-backup-fixture"),
    });

    expect(result).toBe(expectedKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const uploadCall = fetchMock.mock.calls[0];
    expect(uploadCall?.[0]).toBe(url);
    if (!uploadCall) throw new Error("Expected upload fetch call.");

    const request = uploadCall[1] as RequestInit;
    expect(request.redirect).toBe("error");
    expect(new Headers(request.headers).get("authorization"))
      .toBe("Bearer test-access-token");
  });

  it.each([
    {
      provider: "GOOGLE_DRIVE" as const,
      storageKey: "google:file_123",
      url: "https://www.googleapis.com/drive/v3/files/file_123",
      method: "DELETE",
    },
    {
      provider: "DROPBOX" as const,
      storageKey: `dropbox:/laundryangel/backups/${runId}.enc`,
      url: "https://api.dropboxapi.com/2/files/delete_v2",
      method: "POST",
    },
    {
      provider: "ONEDRIVE" as const,
      storageKey: "onedrive:item-123",
      url: "https://graph.microsoft.com/v1.0/me/drive/items/item-123",
      method: "DELETE",
    },
  ])("deletes a valid $provider artifact reference", async ({
    provider,
    storageKey,
    url,
    method,
  }) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteOAuthCloudArtifact({
      ...inputBase,
      provider,
      storageKey,
    })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const deleteCall = fetchMock.mock.calls[0];
    expect(deleteCall?.[0]).toBe(url);
    if (!deleteCall) throw new Error("Expected delete fetch call.");

    const request = deleteCall[1] as RequestInit;
    expect(request.method).toBe(method);
    expect(new Headers(request.headers).get("authorization"))
      .toBe("Bearer test-access-token");

    if (provider === "DROPBOX") {
      expect(JSON.parse(request.body as string)).toEqual({ path: storageKey.slice("dropbox:".length) });
    }
  });

  it("verifies Dropbox destinations using POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ account_id: "test-account" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyOAuthCloudDestination({
      ...inputBase,
      provider: "DROPBOX",
    })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.dropboxapi.com/2/users/get_current_account");
    if (!call) throw new Error("Expected Dropbox verification request.");

    const request = call[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(new Headers(request.headers).get("authorization"))
      .toBe("Bearer test-access-token");
  });

  it("refreshes expired credentials and preserves the refresh token if omitted", async () => {
    mocks.decrypt.mockReturnValue(JSON.stringify({
      accessToken: "expired-access-token",
      refreshToken: "keep-this-refresh-token",
      expiresAt: Date.now() - 1_000,
      tokenType: "Bearer",
    }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: "new-access-token",
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(jsonResponse({ user: {} }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyOAuthCloudDestination({
      ...inputBase,
      provider: "GOOGLE_DRIVE",
    })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const refreshCall = fetchMock.mock.calls[0];
    expect(refreshCall?.[0]).toBe("https://oauth2.googleapis.com/token");
    if (!refreshCall) throw new Error("Expected token refresh fetch call.");

    const refreshRequest = refreshCall[1] as RequestInit;
    expect(String(refreshRequest.body)).toContain("keep-this-refresh-token");

    const encryptedJson = mocks.encrypt.mock.calls[0]?.[0];
    expect(encryptedJson).toBeTruthy();

    const refreshed = JSON.parse(encryptedJson as string);
    expect(refreshed.accessToken).toBe("new-access-token");
    expect(refreshed.refreshToken).toBe("keep-this-refresh-token");
    expect(refreshed.expiresAt).toBeGreaterThan(Date.now());

    expect(mocks.connectionUpdate).toHaveBeenCalledWith({
      where: {
        businessId_id: { businessId, id: connectionId },
      },
      data: { credentialsCiphertext: "encrypted-refreshed" },
    });
  });

  it("rejects malformed Google Drive upload responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ name: "missing-id" })));

    await expect(uploadOAuthCloudArtifact({
      ...inputBase,
      provider: "GOOGLE_DRIVE",
      runId,
      encryptedArtifact: Buffer.from("fixture"),
    })).rejects.toMatchObject({ statusCode: 502 });
  });

  it("rejects invalid stored references without making provider requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteOAuthCloudArtifact({
      ...inputBase,
      provider: "GOOGLE_DRIVE",
      storageKey: "dropbox:/unexpected/path",
    })).rejects.toMatchObject({ statusCode: 422 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizes network and redirect failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new Error("sensitive provider response or redirect detail"),
    ));

    await expect(verifyOAuthCloudDestination({
      ...inputBase,
      provider: "GOOGLE_DRIVE",
    })).rejects.toMatchObject({
      statusCode: 502,
      message: "Cloud provider request failed or timed out.",
    });
  });
});
