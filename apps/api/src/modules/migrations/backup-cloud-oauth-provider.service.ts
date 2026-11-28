import type { BackupCloudProvider } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  decryptBackupCredentials,
  encryptBackupCredentials,
} from "./backup-crypto.service.js";

type OAuthProvider = Extract<
  BackupCloudProvider,
  "GOOGLE_DRIVE" | "DROPBOX"
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
const BACKUP_FOLDER_NAME = "Laundry Angels Backup";
const BACKUP_FOLDER_MIME = "application/vnd.google-apps.folder";
const DROPBOX_BACKUP_FOLDER = "/Laundry Angels Backup";
const LEGACY_DROPBOX_BACKUP_PATH = /^\/laundryangel\/backups\/[0-9a-f-]+\.enc$/i;
const DROPBOX_BACKUP_PATH = /^\/laundry angels backup\/laundry angel (?:manual|auto) backup \d{2}-\d{2}-\d{4}_\d{2}:\d{2}(?:am|pm)_[0-9a-f-]+\.enc$/i;

export function formatCloudBackupFilename(
  trigger: "MANUAL" | "SCHEDULED",
  at: Date,
  timezone: string,
  runId: string,
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const day = value("day");
  const month = value("month");
  const year = value("year");
  const hour = value("hour");
  const minute = value("minute");
  const period = value("dayPeriod")?.toLowerCase();
  if (!day || !month || !year || !hour || !minute || !period) {
    throw new AppError("Unable to format the backup timestamp for the business timezone.", 422);
  }
  const prefix = trigger === "MANUAL" ? "Manual" : "Auto";
  return `Laundry Angel ${prefix} Backup ${day}-${month}-${year}_${hour}:${minute}${period}_${runId}.enc`;
}

function validDropboxBackupPath(path: string): boolean {
  return LEGACY_DROPBOX_BACKUP_PATH.test(path) || DROPBOX_BACKUP_PATH.test(path);
}

function assertOAuthProvider(provider: BackupCloudProvider): asserts provider is OAuthProvider {
  if (
    provider !== "GOOGLE_DRIVE" &&
    provider !== "DROPBOX"
  ) {
    throw new AppError("This provider is not supported for business cloud backups.", 403);
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

  throw new AppError("This provider is not supported for business cloud backups.", 403);
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
    : "https://api.dropboxapi.com/2/users/get_current_account";

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
  trigger: "MANUAL" | "SCHEDULED";
  businessTimezone: string;
  executionTime: Date;
  encryptedArtifact: Buffer;
}): Promise<string> {
  assertOAuthProvider(input.provider);

  const credentials = await getValidCredentials({
    ...input,
    provider: input.provider,
  });

  let response: Response;

  if (input.provider === "GOOGLE_DRIVE") {
    // Google Drive does not enforce unique folder names. Serialize lookup and
    // creation by the business connection across API instances using a
    // transaction-scoped advisory lock.
    const folderId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.businessId}), hashtext(${input.connectionId}))`;
      const query = new URLSearchParams({
        q: `'root' in parents and name = '${BACKUP_FOLDER_NAME}' and mimeType = '${BACKUP_FOLDER_MIME}' and trashed = false`,
        fields: "files(id,name,mimeType,createdTime)",
        orderBy: "createdTime asc",
        pageSize: "100",
      });
      const listResponse = await authorizedRequest(
        `https://www.googleapis.com/drive/v3/files?${query.toString()}`,
        credentials,
      );
      await assertProviderSuccess(listResponse);
      let folders: { files?: Array<{ id?: unknown; mimeType?: unknown }> };
      try {
        folders = await listResponse.json() as typeof folders;
      } catch {
        throw new AppError("Google Drive returned an invalid folder search response.", 502);
      }
      let folderId = folders.files?.find((file) =>
        typeof file.id === "string" && file.id && file.mimeType === BACKUP_FOLDER_MIME,
      )?.id as string | undefined;

      if (!folderId) {
        const createResponse = await authorizedRequest(
          "https://www.googleapis.com/drive/v3/files?fields=id",
          credentials,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: BACKUP_FOLDER_MIME, parents: ["root"] }),
          },
        );
        await assertProviderSuccess(createResponse);
        let created: { id?: unknown };
        try {
          created = await createResponse.json() as { id?: unknown };
        } catch {
          throw new AppError("Google Drive returned an invalid folder creation response.", 502);
        }
        if (typeof created.id !== "string" || !created.id) {
          throw new AppError("Google Drive did not return a backup folder identifier.", 502);
        }
        folderId = created.id;
      }
      return folderId;
    }, { maxWait: 15_000, timeout: REQUEST_TIMEOUT_MS + 15_000 });

    const filename = formatCloudBackupFilename(input.trigger, input.executionTime, input.businessTimezone, input.runId);
      const boundary = `laundryangel_${input.runId.replace(/-/g, "")}`;
      const metadata = JSON.stringify({ name: filename, mimeType: "application/octet-stream", parents: [folderId] });
      const prefix = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      );
      const suffix = Buffer.from(`\r\n--${boundary}--`);
      const uploadResponse = await authorizedRequest(
        `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`,
        credentials,
        {
          method: "POST",
          headers: { "content-type": `multipart/related; boundary=${boundary}` },
          body: Buffer.concat([prefix, input.encryptedArtifact, suffix]),
        },
      );
      await assertProviderSuccess(uploadResponse);
      let result: { id?: unknown };
      try {
        result = await uploadResponse.json() as { id?: unknown };
      } catch {
        throw new AppError("Google Drive returned an invalid upload response.", 502);
      }
      if (typeof result.id !== "string" || !result.id) {
        throw new AppError("Google Drive did not return a backup file identifier.", 502);
      }
    return `google:${result.id}`;
  }

  if (input.provider === "DROPBOX") {
    const createFolderResponse = await authorizedRequest(
      "https://api.dropboxapi.com/2/files/create_folder_v2",
      credentials,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: DROPBOX_BACKUP_FOLDER, autorename: false }),
      },
    );
    if (createFolderResponse.ok) {
      let folder: { metadata?: { path_lower?: unknown } };
      try {
        folder = await createFolderResponse.json() as typeof folder;
      } catch {
        throw new AppError("Dropbox returned an invalid folder creation response.", 502);
      }
      if (folder.metadata?.path_lower !== DROPBOX_BACKUP_FOLDER.toLowerCase()) {
        throw new AppError("Dropbox did not confirm the backup folder.", 502);
      }
    } else {
      let conflictIsFolder = false;
      if (createFolderResponse.status === 409) {
        try {
          const body = await createFolderResponse.json() as { error?: { ".tag"?: unknown; path?: { ".tag"?: unknown; conflict?: { ".tag"?: unknown } } }; error_summary?: unknown };
          conflictIsFolder = body.error?.[".tag"] === "path" &&
            body.error.path?.[".tag"] === "conflict" &&
            body.error.path.conflict?.[".tag"] === "folder";
        } catch {
          conflictIsFolder = false;
        }
      }
      if (!conflictIsFolder) {
        throw new AppError("Dropbox could not create or reuse the backup folder.", 502);
      }
    }

    const filename = formatCloudBackupFilename(input.trigger, input.executionTime, input.businessTimezone, input.runId);
    const path = `${DROPBOX_BACKUP_FOLDER}/${filename}`;

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

    if (typeof result.path_lower !== "string" || !DROPBOX_BACKUP_PATH.test(result.path_lower)) {
      throw new AppError("Dropbox did not return a valid backup reference.", 502);
    }

    return `dropbox:${result.path_lower}`;
  }

  throw new AppError("This provider is not supported for business cloud backups.", 403);
}

/**
 * Reconciles an upload whose provider response was confirmed but whose history
 * write failed. The run UUID is part of the remote filename, so this lookup
 * never creates a second artifact. Downloading the artifact lets us persist an
 * exact SHA-256 and byte count instead of trusting provider-specific hashes.
 */
export async function recoverOAuthCloudArtifact(input: {
  businessId: string;
  connectionId: string;
  provider: BackupCloudProvider;
  credentialsCiphertext: string;
  runId: string;
  trigger: "MANUAL" | "SCHEDULED";
  businessTimezone: string;
  executionTime: Date;
}): Promise<{ storageKey: string; checksumSha256: string; sizeBytes: number } | null> {
  assertOAuthProvider(input.provider);
  const credentials = await getValidCredentials({ ...input, provider: input.provider });
  const filename = formatCloudBackupFilename(
    input.trigger, input.executionTime, input.businessTimezone, input.runId,
  );

  if (input.provider === "GOOGLE_DRIVE") {
    const query = new URLSearchParams({
      q: `name = '${filename}' and trashed = false`,
      fields: "files(id,name,mimeType)",
      pageSize: "10",
    });
    const lookup = await authorizedRequest(
      `https://www.googleapis.com/drive/v3/files?${query.toString()}`,
      credentials,
    );
    await assertProviderSuccess(lookup);
    let result: { files?: Array<{ id?: unknown; name?: unknown; mimeType?: unknown }> };
    try {
      result = await lookup.json() as typeof result;
    } catch {
      throw new AppError("Google Drive returned an invalid backup recovery response.", 502);
    }
    const matches = (result.files ?? []).filter((file) =>
      file.name === filename && typeof file.id === "string" && file.id &&
      file.mimeType !== BACKUP_FOLDER_MIME,
    );
    if (matches.length > 1) {
      throw new AppError("Multiple provider artifacts match this backup operation.", 409);
    }
    const fileId = matches[0]?.id;
    if (typeof fileId !== "string") return null;
    const download = await authorizedRequest(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      credentials,
    );
    await assertProviderSuccess(download);
    const bytes = Buffer.from(await download.arrayBuffer());
    return {
      storageKey: `google:${fileId}`,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
    };
  }

  if (input.provider === "DROPBOX") {
    const path = `${DROPBOX_BACKUP_FOLDER}/${filename}`;
    const download = await authorizedRequest(
      "https://content.dropboxapi.com/2/files/download",
      credentials,
      {
        method: "POST",
        headers: { "dropbox-api-arg": JSON.stringify({ path }) },
      },
    );
    if (download.status === 409) {
      let missing = false;
      try {
        const error = await download.json() as {
          error?: { ".tag"?: unknown; path?: { ".tag"?: unknown } };
        };
        missing = error.error?.[".tag"] === "path" && error.error.path?.[".tag"] === "not_found";
      } catch {
        missing = false;
      }
      if (missing) return null;
      throw new AppError("Dropbox could not confirm this backup artifact during recovery.", 502);
    }
    await assertProviderSuccess(download);
    const resultHeader = download.headers.get("dropbox-api-result");
    if (!resultHeader) {
      throw new AppError("Dropbox did not confirm the recovered backup metadata.", 502);
    }
    let metadata: { name?: unknown; path_lower?: unknown };
    try {
      metadata = JSON.parse(resultHeader) as typeof metadata;
    } catch {
      throw new AppError("Dropbox returned invalid backup recovery metadata.", 502);
    }
    const bytes = Buffer.from(await download.arrayBuffer());
    if (
      metadata.name !== filename ||
      metadata.path_lower !== path.toLowerCase() ||
      bytes.byteLength === 0
    ) {
      throw new AppError("Dropbox did not confirm the expected backup artifact.", 502);
    }
    return {
      storageKey: `dropbox:${metadata.path_lower}`,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
    };
  }

  throw new AppError("This provider does not support recoverable OAuth backups.", 403);
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
    const match = /^dropbox:(.+)$/i.exec(input.storageKey);
    if (!match || !validDropboxBackupPath(match[1]!)) throw new AppError("Stored Dropbox backup reference is invalid.", 422);
    url = "https://api.dropboxapi.com/2/files/delete_v2";
    method = "POST";
    headers = { "content-type": "application/json" };
  } else {
    throw new AppError("This provider is not supported for business cloud backups.", 403);
  }

  const init: RequestInit = { method, ...(headers ? { headers } : {}) };
  if (input.provider === "DROPBOX") {
    const match = /^dropbox:(.+)$/i.exec(input.storageKey);
    if (!match || !validDropboxBackupPath(match[1]!)) throw new AppError("Stored Dropbox backup reference is invalid.", 422);
    init.body = JSON.stringify({ path: match[1] });
  }

  const response = await authorizedRequest(url, credentials, init);
  await assertProviderSuccess(response);
}
