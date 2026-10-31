import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stateCreate: vi.fn(),
  stateDeleteMany: vi.fn(),
  stateFindUnique: vi.fn(),
  stateUpdateMany: vi.fn(),
  connectionCreate: vi.fn(),
  encrypt: vi.fn((_plaintext: string, _businessId: string) => "encrypted-test-credentials"),
  decrypt: vi.fn((_ciphertext: string, _businessId: string) => "test-pkce-verifier"),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    backupCloudOAuthState: {
      create: mocks.stateCreate,
      deleteMany: mocks.stateDeleteMany,
      findUnique: mocks.stateFindUnique,
      updateMany: mocks.stateUpdateMany,
    },
    backupCloudConnection: {
      create: mocks.connectionCreate,
    },
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    appUrl: "https://api.example.test",
    isProduction: false,
    log: { level: "silent" },
  },
}));

vi.mock("../../src/modules/migrations/backup-crypto.service.js", () => ({
  encryptBackupCredentials: mocks.encrypt,
  decryptBackupCredentials: mocks.decrypt,
}));

import {
  beginCloudOAuth,
  completeCloudOAuth,
} from "../../src/modules/migrations/backup-cloud-oauth.service.js";

const validState = () => ({
  id: "oauth-state-1",
  businessId: "business-1",
  userId: "user-1",
  provider: "GOOGLE_DRIVE",
  displayName: "Production backups",
  stateHash: "stored-state-hash",
  verifierCiphertext: "encrypted-verifier",
  consumedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
});

describe("cloud backup OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-client-secret";

    mocks.stateCreate.mockResolvedValue({});
    mocks.stateDeleteMany.mockResolvedValue({ count: 0 });
    mocks.stateUpdateMany.mockResolvedValue({ count: 1 });
    mocks.connectionCreate.mockResolvedValue({
      id: "connection-1",
      provider: "GOOGLE_DRIVE",
      displayName: "Production backups",
      status: "PENDING",
      createdAt: new Date("2026-10-14T12:00:00.000Z"),
    });
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

  it("requests Dropbox account and file permissions with offline access", async () => {
    process.env.DROPBOX_APP_KEY = "test-dropbox-key";
    process.env.DROPBOX_APP_SECRET = "test-dropbox-secret";

    const result = await beginCloudOAuth({
      businessId: "business-1",
      userId: "user-1",
      provider: "DROPBOX",
      displayName: "Dropbox backups",
    });

    const url = new URL(result.authorizationUrl);

    expect(url.origin).toBe("https://www.dropbox.com");
    expect(url.searchParams.get("client_id")).toBe("test-dropbox-key");
    expect(url.searchParams.get("token_access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(
      "account_info.read files.content.write",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("starts OneDrive OAuth with the configured Microsoft tenant and offline access", async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-microsoft-client";
    process.env.MICROSOFT_CLIENT_SECRET = "test-microsoft-secret";
    process.env.MICROSOFT_TENANT_ID = "organizations";

    const result = await beginCloudOAuth({
      businessId: "business-1",
      userId: "user-1",
      provider: "ONEDRIVE",
      displayName: "OneDrive backups",
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe("/organizations/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-microsoft-client");
    expect(url.searchParams.get("scope")).toBe("Files.ReadWrite offline_access User.Read");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("cleans up only expired or consumed OAuth state for the requesting business", async () => {
    await beginCloudOAuth({
      businessId: "business-1",
      userId: "user-1",
      provider: "GOOGLE_DRIVE",
      displayName: "Production backups",
    });

    expect(mocks.stateDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.stateDeleteMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        OR: [
          { expiresAt: { lte: expect.any(Date) } },
          { consumedAt: { not: null } },
        ],
      },
    });
    expect(mocks.stateCreate).toHaveBeenCalledTimes(1);
  });

  it("continues OAuth when stale-state cleanup fails", async () => {
    mocks.stateDeleteMany.mockRejectedValueOnce(new Error("cleanup unavailable"));

    const result = await beginCloudOAuth({
      businessId: "business-1",
      userId: "user-1",
      provider: "GOOGLE_DRIVE",
      displayName: "Production backups",
    });

    expect(new URL(result.authorizationUrl).origin).toBe("https://accounts.google.com");
    expect(mocks.stateDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.stateCreate).toHaveBeenCalledTimes(1);
  });

  it("creates hashed, expiring state and returns a PKCE authorization URL", async () => {
    const result = await beginCloudOAuth({
      businessId: "business-1",
      userId: "user-1",
      provider: "GOOGLE_DRIVE",
      displayName: "  Production backups  ",
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.example.test/api/v1/migrations/backup/cloud/oauth/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy();

    expect(mocks.stateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "business-1",
        userId: "user-1",
        provider: "GOOGLE_DRIVE",
        displayName: "Production backups",
        stateHash: expect.not.stringMatching(
          url.searchParams.get("state")!,
        ),
        verifierCiphertext: "encrypted-test-credentials",
        expiresAt: expect.any(Date),
      }),
    });

    expect(mocks.encrypt).toHaveBeenCalledWith(
      expect.any(String),
      "business-1",
    );
  });

  it("rejects expired or already-consumed state before exchanging tokens", async () => {
    mocks.stateFindUnique.mockResolvedValue({
      ...validState(),
      expiresAt: new Date(Date.now() - 1_000),
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeCloudOAuth({ state: "expired-state", code: "auth-code" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mocks.stateUpdateMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.connectionCreate).not.toHaveBeenCalled();
  });

  it("rejects state when atomic one-time consumption loses a race", async () => {
    mocks.stateFindUnique.mockResolvedValue(validState());
    mocks.stateUpdateMany.mockResolvedValue({ count: 0 });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeCloudOAuth({ state: "valid-state", code: "auth-code" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mocks.stateUpdateMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.connectionCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed provider token JSON without creating a connection", async () => {
    mocks.stateFindUnique.mockResolvedValue(validState());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      completeCloudOAuth({ state: "valid-state", code: "auth-code" }),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(mocks.connectionCreate).not.toHaveBeenCalled();
  });

  it("stores valid credentials encrypted with a bounded expiry and PENDING status", async () => {
    mocks.stateFindUnique.mockResolvedValue(validState());

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "provider-access-token",
            refresh_token: "provider-refresh-token",
            expires_in: 99_999_999_999,
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      ),
    );

    const before = Date.now();
    const result = await completeCloudOAuth({
      state: "valid-state",
      code: "auth-code",
    });
    const after = Date.now();

    expect(mocks.decrypt).toHaveBeenCalledWith(
      "encrypted-verifier",
      "business-1",
    );
    expect(mocks.encrypt).toHaveBeenCalledWith(
      expect.any(String),
      "business-1",
    );

    const encryptedPayload = mocks.encrypt.mock.calls.at(-1)?.[0];
    expect(typeof encryptedPayload).toBe("string");

    const credentials = JSON.parse(encryptedPayload as string);
    expect(credentials.accessToken).toBe("provider-access-token");
    expect(credentials.refreshToken).toBe("provider-refresh-token");
    expect(credentials.tokenType).toBe("Bearer");
    expect(credentials.expiresAt).toBeGreaterThanOrEqual(
      before + 31_536_000 * 1000,
    );
    expect(credentials.expiresAt).toBeLessThanOrEqual(
      after + 31_536_000 * 1000,
    );

    expect(mocks.connectionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "business-1",
        provider: "GOOGLE_DRIVE",
        displayName: "Production backups",
        credentialsCiphertext: "encrypted-test-credentials",
        config: { oauth: true },
        status: "PENDING",
      }),
      select: expect.any(Object),
    });

    expect(result).toMatchObject({
      businessId: "business-1",
      userId: "user-1",
      connection: {
        id: "connection-1",
        status: "PENDING",
      },
    });
  });
});
