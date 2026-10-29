# Production Readiness

## Repository checkpoint

- Deployment branch: `friend-work`
- Production environment template: `deploy/production.env.example`
- Production Compose file: `deploy/compose.production.yml`

## Production configuration checklist

The Compose deployment reads `deploy/.env.production.local`. Keep this file private (mode 600) and never commit or paste its contents.

### Core application and database

- Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
- Set distinct, strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
- Set `APP_URL`, `WEB_APP_URL`, and `CORS_ORIGIN` to the actual production URLs.
- Set a unique `MIGRATION_STORAGE_KEY` (at least 16 characters).

### Cloud backups

- Set `BACKUP_ENCRYPTION_KEY` to exactly 64 hexadecimal characters (32 random bytes).
- Preserve the same key across restarts, rebuilds, and deployments. Do not rotate it without a documented credential/artifact re-encryption plan.
- For Google Drive, configure `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET`.
- For Dropbox, configure `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET`.
- For OneDrive, configure `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`; `MICROSOFT_TENANT_ID` defaults to `common`.
- Register the OAuth callback URL `{APP_URL}/api/v1/migrations/backup/cloud/oauth/callback` with each provider.
- After configuring credentials, reconnect/reauthorize the destination if its authorization is expired, then verify it and run a manual backup.
- Confirm a successful run has status `SUCCEEDED`, a non-empty storage key, checksum, byte size, and completion timestamp. Verify the remote object exists before declaring backup readiness.

### Subscription payments

- Set `PAYSTACK_SECRET_KEY` in the API environment to enable Paystack subscription initialization and verification.
- Keep the secret key server-side only. `PAYSTACK_BASE_URL` defaults to `https://api.paystack.co`.
- Verify a test transaction and webhook/reconciliation path before enabling live subscription payments. Do not mark a subscription paid from an unverified client redirect.

### Other integrations

- Configure Resend and WhatsApp variables only when those receipt-delivery integrations are enabled.
- Keep all provider credentials in the server environment; never expose them through Vite/frontend variables.

## Validation gates before deployment

- GitHub Actions: tests, lint, API/web typechecks, and production builds all pass on the exact release commit.
- Production environment presence/format checks pass without printing secret values.
- Cloud destination verification and a manual encrypted backup succeed; restore rehearsal succeeds.
- Paystack test-mode initialize/verify and subscription reconciliation succeed.
- Database backup and restore rehearsal are verified.
- API and web health checks pass; authenticated end-to-end smoke tests pass.
- Release archive/checksum and rollback procedure are ready.
- Do not deploy while any gate above is failing or unverified.

## Security reminders

- Never commit `.env`, `.env.local`, credentials, private keys, or real secrets.
- Use different production access and refresh secrets.
- Restrict `CORS_ORIGIN` to the real web application origin.
- Run migrations explicitly; do not run them automatically on API startup.
- Keep platform-admin access separate from tenant users.
