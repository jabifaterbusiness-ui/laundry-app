import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ENABLE_BACKGROUND_SCHEDULERS: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:4000"),
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be set and non-trivial"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be set and non-trivial"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, "JWT_REFRESH_EXPIRES_IN must be a duration such as 7d, 12h, 30m or 60s").default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MIGRATION_STORAGE_DIR: z.string().default("./data/migrations"),
  MIGRATION_STORAGE_KEY: z.string().min(16).default("dev-only-migration-storage-key-change-me"),
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
  DROPBOX_APP_KEY: z.string().optional(),
  DROPBOX_APP_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default("common"),
  BACKUP_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters").optional(),
  MIGRATION_MIN_UPLOAD_BYTES: z.coerce.number().int().positive().default(1),
  MIGRATION_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(1024 * 1024 * 1024),
  MIGRATION_MAX_ROWS_PER_TABLE: z.coerce.number().int().positive().default(2_000_000),
  MIGRATION_MAX_UNCOMPRESSED_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  BUSINESS_BRANDING_STORAGE_DIR: z.string().default("./data/business-branding"),
  BUSINESS_BRANDING_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  // --- Digital receipt delivery ---
  RESEND_API_KEY: z.string().min(1).optional(),
  RECEIPT_EMAIL_FROM: z.string().min(1).optional(),
  WHATSAPP_API_VERSION: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "WHATSAPP_TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters").optional(),
  WHATSAPP_APP_ID: z.string().min(1).optional(),
  WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: z.string().min(1).optional(),

  // --- Subscription payment providers ---
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  PAYSTACK_BASE_URL: z.string().url().default("https://api.paystack.co"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud - a misconfigured environment must never boot silently.
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. See errors above.");
}

export const env = parsed.data;
export type Env = typeof env;
