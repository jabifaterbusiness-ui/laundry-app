import { createHash, randomBytes } from "node:crypto";
import type { BackupCloudProvider } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { encryptBackupCredentials, decryptBackupCredentials } from "./backup-crypto.service.js";

type OAuthProvider = "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE";

const CALLBACK_PATH = "/api/v1/migrations/backup/cloud/oauth/callback";
const STATE_TTL_MS = 10 * 60 * 1000;

function providerConfig(provider: OAuthProvider) {
  const env = process.env;
  if (provider === "GOOGLE_DRIVE") {
    if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET) {
      throw new AppError("Google Drive OAuth is not configured on the server.", 503);
    }
    return {
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/drive.file",
    };
  }
  if (provider === "DROPBOX") {
    if (!env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) {
      throw new AppError("Dropbox OAuth is not configured on the server.", 503);
    }
    return {
      clientId: env.DROPBOX_APP_KEY,
      clientSecret: env.DROPBOX_APP_SECRET,
      authorize: "https://www.dropbox.com/oauth2/authorize",
      token: "https://api.dropboxapi.com/oauth2/token",
      scope: "account_info.read files.content.write",
    };
  }
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new AppError("OneDrive OAuth is not configured on the server.", 503);
  }
  const tenant = /^[a-zA-Z0-9.-]+$/.test(env.MICROSOFT_TENANT_ID ?? "common")
    ? env.MICROSOFT_TENANT_ID ?? "common"
    : "common";
  return {
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scope: "Files.ReadWrite offline_access User.Read",
  };
}

function callbackUrl() {
  const base = new URL(config.appUrl);
  return new URL(CALLBACK_PATH, base).toString();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function beginCloudOAuth(input: {
  businessId: string;
  userId: string;
  provider: OAuthProvider;
  displayName: string;
}) {
  const provider = providerConfig(input.provider);
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 100) {
    throw new AppError("Connection name must be between 1 and 100 characters.", 422);
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let verifierCiphertext: string;
  try {
    verifierCiphertext = encryptBackupCredentials(verifier, input.businessId);
  } catch {
    throw new AppError("Cloud credential encryption is unavailable. Check BACKUP_ENCRYPTION_KEY configuration.", 503);
  }

  // Best-effort cleanup of stale OAuth state for this business.
  try {
    await prisma.backupCloudOAuthState.deleteMany({
      where: {
        businessId: input.businessId,
        OR: [
          { expiresAt: { lte: new Date() } },
          { consumedAt: { not: null } },
        ],
      },
    });
  } catch {
    // Cleanup must not prevent a valid OAuth attempt.
  }

  await prisma.backupCloudOAuthState.create({
    data: {
      businessId: input.businessId,
      userId: input.userId,
      provider: input.provider as BackupCloudProvider,
      displayName,
      stateHash: sha256(state),
      verifierCiphertext,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  const url = new URL(provider.authorize);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (input.provider === "GOOGLE_DRIVE") {
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  } else if (input.provider === "DROPBOX") {
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("token_access_type", "offline");
  } else {
    url.searchParams.set("scope", provider.scope);
  }

  return { authorizationUrl: url.toString() };
}

export async function completeCloudOAuth(input: {
  state: string;
  code: string;
}) {
  if (!input.state || input.state.length > 200 || !input.code || input.code.length > 4096) {
    throw new AppError("Invalid OAuth callback.", 400);
  }

  const stateHash = sha256(input.state);
  const state = await prisma.backupCloudOAuthState.findUnique({
    where: { stateHash },
  });
  if (!state || state.consumedAt || state.expiresAt.getTime() <= Date.now()) {
    throw new AppError("OAuth state is invalid, expired, or already used. Start the connection again.", 400);
  }

  const consumed = await prisma.backupCloudOAuthState.updateMany({
    where: { id: state.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new AppError("OAuth state has already been used. Start the connection again.", 400);
  }

  const provider = providerConfig(state.provider as OAuthProvider);
  let verifier: string;
  try {
    verifier = decryptBackupCredentials(state.verifierCiphertext, state.businessId);
  } catch {
    throw new AppError("OAuth verification could not be completed securely.", 503);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: callbackUrl(),
    code_verifier: verifier,
  });

  let response: Response;
  try {
    response = await fetch(provider.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new AppError("Cloud provider token exchange failed. Please reconnect.", 502);
  }

  if (!response.ok) {
    throw new AppError("Cloud provider authorization failed. Please reconnect.", 502);
  }

  type TokenExchangeResponse = {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
  };

  let tokens: TokenExchangeResponse;
  try {
    tokens = await response.json() as TokenExchangeResponse;
  } catch {
    throw new AppError("Cloud provider returned an invalid token response.", 502);
  }

  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new AppError("Cloud provider did not return a usable access token.", 502);
  }

  const expiresIn =
    typeof tokens.expires_in === "number" &&
    Number.isFinite(tokens.expires_in) &&
    tokens.expires_in > 0
      ? Math.min(tokens.expires_in, 31_536_000)
      : 3600;

  const credentials = {
    accessToken: tokens.access_token,
    refreshToken:
      typeof tokens.refresh_token === "string" && tokens.refresh_token
        ? tokens.refresh_token
        : null,
    expiresAt: Date.now() + expiresIn * 1000,
    tokenType:
      typeof tokens.token_type === "string" && tokens.token_type
        ? tokens.token_type
        : "Bearer",
  };
  const credentialsCiphertext = encryptBackupCredentials(
    JSON.stringify(credentials),
    state.businessId,
  );

  const connection = await prisma.backupCloudConnection.create({
    data: {
      businessId: state.businessId,
      provider: state.provider,
      displayName: state.displayName,
      credentialsCiphertext,
      config: { oauth: true },
      status: "PENDING",
    },
    select: {
      id: true,
      provider: true,
      displayName: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    connection,
    businessId: state.businessId,
    userId: state.userId,
  };
}
