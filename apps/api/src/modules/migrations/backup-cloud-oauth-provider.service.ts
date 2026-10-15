import type { BackupCloudProvider } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  decryptBackupCredentials,
  encryptBackupCredentials,
} from "./backup-crypto.service.js";

type OAuthProvider = Extract<
  BackupCloudProvider,
  "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE"
>;

type OAuthCredentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  tokenType: string;
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

const REQUEST_TIMEOUT_MS = 120_000;

function assertOAuthProvider(provider: BackupCloudProvider): asserts provider is OAuthProvider {
  if (
    provider !== "GOOGLE_DRIVE" &&
    provider !== "DROPBOX" &&
    provider !== "ONEDRIVE"
  ) {
    throw new AppError("This operation requires an OAuth cloud provider.", 422);
  }
}

function tokenConfiguration(provider: OAuthProvider) {
  const env = process.env;

  if (provider === "GOOGLE_DRIVE") {
    if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET) {
      throw new AppError("Google Drive OAuth is not configured on the server.", 503);
    }
    return {
      url: "https://oauth2.googleapis.com/token",
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    };
  }

  if (provider === "DROPBOX") {
    if (!env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) {
      throw new AppError("Dropbox OAuth is not configured on the server.", 503);
    }
    return {
      url: "https://api.dropboxapi.com/oauth2/token",
      clientId: env.DROPBOX_APP_KEY,
      clientSecret: env.DROPBOX_APP_SECRET,
    };
  }

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new AppError("OneDrive OAuth is not configured on the server.", 503);
  }

  const configuredTenant = env.MICROSOFT_TENANT_ID ?? "common";
  const tenant = /^[a-zA-Z0-9.-]+$/.test(configuredTenant)
    ? configuredTenant
    : "common";

  return {
    url: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
  };
}

function parseCredentials(ciphertext: string, businessId: string): OAuthCredentials {
  let parsed: unknown;

  try {
    parsed = JSON.parse(decryptBackupCredentials(ciphertext, businessId));
  } catch {
    throw new AppError("Unable to decrypt the cloud destination credentials.", 503);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("accessToken" in parsed) ||
    typeof parsed.accessToken !== "string" ||
    !parsed.accessToken
  ) {
    throw new AppError("The cloud destination credentials are incomplete.", 422);
  }

  const value = parsed as Partial<OAuthCredentials>;
  const accessToken = value.accessToken;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new AppError("The cloud destination credentials are incomplete.", 422);
  }

  return {
    accessToken,
    refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : null,
    expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : 0,
    tokenType: typeof value.tokenType === "string" ? value.tokenType : "Bearer",
  };
}

async function providerRequest(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new AppError("Cloud provider request failed or timed out.", 502);
  }
}

async function getValidCredentials(input: {
  businessId: string;
  connectionId: string;
  provider: OAuthProvider;
  credentialsCiphertext: string;
}): Promise<OAuthCredentials> {
  const credentials = parseCredentials(
    input.credentialsCiphertext,
    input.businessId,
  );

  if (credentials.expiresAt > Date.now() + 60_000) {
    return credentials;
  }

  if (!credentials.refreshToken) {
    throw new AppError("Cloud authorization has expired. Reconnect this destination.", 422);
  }

  const oauth = tokenConfiguration(input.provider);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
  });

  const response = await providerRequest(oauth.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new AppError("Cloud authorization has expired or was revoked. Reconnect this destination.", 422);
  }

  let tokens: TokenResponse;
  try {
    tokens = await response.json() as TokenResponse;
  } catch {
    throw new AppError("Cloud provider returned an invalid token response.", 502);
  }

  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new AppError("Cloud provider did not return a usable access token.", 502);
  }

  const expiresIn = typeof tokens.expires_in === "number" &&
    Number.isFinite(tokens.expires_in) &&
    tokens.expires_in > 0
    ? Math.min(tokens.expires_in, 31_536_000)
    : 3600;

  const refreshed: OAuthCredentials = {
    accessToken: tokens.access_token,
    // Some providers omit refresh_token during refresh. Preserve the existing one.
    refreshToken: typeof tokens.refresh_token === "string" && tokens.refresh_token
      ? tokens.refresh_token
      : credentials.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    tokenType: typeof tokens.token_type === "string" ? tokens.token_type : "Bearer",
  };

  const credentialsCiphertext = encryptBackupCredentials(
    JSON.stringify(refreshed),
    input.businessId,
  );

  await prisma.backupCloudConnection.update({
    where: {
      businessId_id: {
        businessId: input.businessId,
        id: input.connectionId,
      },
    },
    data: { credentialsCiphertext },
  });

  return refreshed;
}

async function authorizedRequest(
  url: string,
  credentials: OAuthCredentials,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${credentials.accessToken}`);

  return providerRequest(url, { ...init, headers });
}

async function assertProviderSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    // Do not expose provider response bodies, tokens, or remote diagnostics to clients.
    throw new AppError("Cloud provider operation failed. Reconnect or verify destination permissions.", 502);
  }
}

export async function verifyOAuthCloudDestination(input: {
  businessId: string;
  connectionId: string;
  provider: BackupCloudProvider;
  credentialsCiphertext: string;
}): Promise<void> {
  assertOAuthProvider(input.provider);

  const credentials = await getValidCredentials({
    ...input,
    provider: input.provider,
  });

  const url = input.provider === "GOOGLE_DRIVE"
    ? "https://www.googleapis.com/drive/v3/about?fields=user"
    : input.provider === "DROPBOX"
      ? "https://api.dropboxapi.com/2/users/get_current_account"
      : "https://graph.microsoft.com/v1.0/me/drive";

  const response = await authorizedRequest(
    url,
    credentials,
    input.provider === "DROPBOX" ? { method: "POST" } : {},
  );
  await assertProviderSuccess(response);
}

export async function uploadOAuthCloudArtifact(input: {
  businessId: string;
  connectionId: string;
  provider: BackupCloudProvider;
  credentialsCiphertext: string;
  runId: string;
  encryptedArtifact: Buffer;
}): Promise<string> {
  assertOAuthProvider(input.provider);

  const credentials = await getValidCredentials({
    ...input,
    provider: input.provider,
  });

  let response: Response;

  if (input.provider === "GOOGLE_DRIVE") {
    const boundary = `laundryangel_${input.runId.replace(/-/g, "")}`;
    const metadata = JSON.stringify({
      name: `laundryangel-backup-${input.runId}.enc`,
      mimeType: "application/octet-stream",
    });
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const suffix = Buffer.from(`\r\n--${boundary}--`);

    response = await authorizedRequest(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      credentials,
      {
        method: "POST",
        headers: { "content-type": `multipart/related; boundary=${boundary}` },
        body: Buffer.concat([prefix, input.encryptedArtifact, suffix]),
      },
    );

    await assertProviderSuccess(response);

    let result: { id?: unknown };
    try {
      result = await response.json() as { id?: unknown };
    } catch {
      throw new AppError("Google Drive returned an invalid upload response.", 502);
    }

    if (typeof result.id !== "string" || !result.id) {
      throw new AppError("Google Drive did not return a backup file identifier.", 502);
    }

    return `google:${result.id}`;
  }

  if (input.provider === "DROPBOX") {
    const path = `/LaundryAngel/backups/${input.runId}.enc`;

    response = await authorizedRequest(
      "https://content.dropboxapi.com/2/files/upload",
      credentials,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "dropbox-api-arg": JSON.stringify({
            path,
            mode: "add",
            autorename: false,
            mute: true,
            strict_conflict: true,
          }),
        },
        body: input.encryptedArtifact,
      },
    );

    await assertProviderSuccess(response);

    let result: { path_lower?: unknown };
    try {
      result = await response.json() as { path_lower?: unknown };
    } catch {
      throw new AppError("Dropbox returned an invalid upload response.", 502);
    }

    if (typeof result.path_lower !== "string" ||
        !/^\/laundryangel\/backups\/[0-9a-f-]+\.enc$/i.test(result.path_lower)) {
      throw new AppError("Dropbox did not return a valid backup reference.", 502);
    }

    return `dropbox:${result.path_lower}`;
  }

  const path = `/LaundryAngel/backups/${input.runId}.enc`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  response = await authorizedRequest(
    `https://graph.microsoft.com/v1.0/me/drive/root:${encodedPath}:/content`,
    credentials,
    {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: input.encryptedArtifact,
    },
  );

  await assertProviderSuccess(response);

  let result: { id?: unknown };
  try {
    result = await response.json() as { id?: unknown };
  } catch {
    throw new AppError("OneDrive returned an invalid upload response.", 502);
  }

  if (typeof result.id !== "string" || !/^[A-Za-z0-9!_-]+$/.test(result.id)) {
    throw new AppError("OneDrive did not return a valid backup file identifier.", 502);
  }

  return `onedrive:${result.id}`;
}

export async function deleteOAuthCloudArtifact(input: {
  businessId: string;
  connectionId: string;
  provider: BackupCloudProvider;
  credentialsCiphertext: string;
  storageKey: string;
}): Promise<void> {
  assertOAuthProvider(input.provider);

  const credentials = await getValidCredentials({
    ...input,
    provider: input.provider,
  });

  let url: string;
  let method = "DELETE";
  let headers: Record<string, string> | undefined;

  if (input.provider === "GOOGLE_DRIVE") {
    const match = /^google:([A-Za-z0-9_-]+)$/.exec(input.storageKey);
    const fileId = match?.[1];
    if (!fileId) throw new AppError("Stored Google Drive backup reference is invalid.", 422);
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  } else if (input.provider === "DROPBOX") {
    const match = /^dropbox:(\/laundryangel\/backups\/[0-9a-f-]+\.enc)$/i.exec(input.storageKey);
    if (!match) throw new AppError("Stored Dropbox backup reference is invalid.", 422);
    url = "https://api.dropboxapi.com/2/files/delete_v2";
    method = "POST";
    headers = { "content-type": "application/json" };
  } else {
    const match = /^onedrive:([A-Za-z0-9!_-]+)$/.exec(input.storageKey);
    const itemId = match?.[1];
    if (!itemId) throw new AppError("Stored OneDrive backup reference is invalid.", 422);
    url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`;
  }

  const init: RequestInit = { method, ...(headers ? { headers } : {}) };
  if (input.provider === "DROPBOX") {
    const match = /^dropbox:(\/laundryangel\/backups\/[0-9a-f-]+\.enc)$/i.exec(input.storageKey);
    if (!match) throw new AppError("Stored Dropbox backup reference is invalid.", 422);
    init.body = JSON.stringify({ path: match[1] });
  }

  const response = await authorizedRequest(url, credentials, init);
  await assertProviderSuccess(response);
}
