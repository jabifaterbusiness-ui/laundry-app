import { env } from "./env.js";

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  appUrl: env.APP_URL,
  webAppUrl: env.WEB_APP_URL,
  cors: {
    origin: env.CORS_ORIGIN,
  },
  auth: {
    accessTokenSecret: env.JWT_ACCESS_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_SECRET,
    accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshTokenExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  log: {
    level: env.LOG_LEVEL,
  },
  migrations: {
    storageDir: env.MIGRATION_STORAGE_DIR,
    storageKey: env.MIGRATION_STORAGE_KEY,
    maxUploadBytes: env.MIGRATION_MAX_UPLOAD_BYTES,
    maxUncompressedBytes: env.MIGRATION_MAX_UNCOMPRESSED_BYTES,
  },
  receiptDelivery: {
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.RECEIPT_EMAIL_FROM,
  },
} as const;
