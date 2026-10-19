import { env } from "./env.js";

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  enableBackgroundSchedulers: env.ENABLE_BACKGROUND_SCHEDULERS,
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
  backups: {
    encryptionKey: env.BACKUP_ENCRYPTION_KEY,
  },
  migrations: {
    storageDir: env.MIGRATION_STORAGE_DIR,
    storageKey: env.MIGRATION_STORAGE_KEY,
    minUploadBytes: env.MIGRATION_MIN_UPLOAD_BYTES,
    maxUploadBytes: env.MIGRATION_MAX_UPLOAD_BYTES,
    maxUncompressedBytes: env.MIGRATION_MAX_UNCOMPRESSED_BYTES,
    maxRowsPerTable: env.MIGRATION_MAX_ROWS_PER_TABLE,
  },
  businessBranding: {
    storageDir: env.BUSINESS_BRANDING_STORAGE_DIR,
    maxUploadBytes: env.BUSINESS_BRANDING_MAX_UPLOAD_BYTES,
  },
  receiptDelivery: {
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.RECEIPT_EMAIL_FROM,
    whatsappApiVersion: env.WHATSAPP_API_VERSION,
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    whatsappAccessToken: env.WHATSAPP_ACCESS_TOKEN,
    whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN,
  },
  paymentProviders: {
    paystack: {
      secretKey: env.PAYSTACK_SECRET_KEY,
      baseUrl: env.PAYSTACK_BASE_URL,
    },
  },
} as const;
