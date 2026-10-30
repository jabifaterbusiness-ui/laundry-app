# LaundryAngel OVH Release Readiness

Last reviewed: 2026-10-30

## Repository checkpoint

- Working branch: `friend-work`
- Latest merged change: `a98a69d` — redesign backup management dashboard (PR #8)
- Post-merge GitHub Actions CI: successful
- Current release candidate: `friend-work`
- Production deployment from this checkpoint: not performed

## OVH migration checkpoint

- VPS: active (OVH VPS-1, Ubuntu 26.04, 2 vCPU, 4 GB RAM).
- Server access: SSH access confirmed.
- Runtime: Docker Engine and Docker Compose installed.
- Application: the OVH application stack was previously started; API request handling and background scheduler startup were observed.
- Database preparation: the PostgreSQL production archive passed integrity checks and an isolated restore rehearsal was completed.
- Production cutover: not declared complete. The isolated restore rehearsal is not a substitute for final production database and public-traffic verification.
- Public launch: blocked on the production domain and HTTPS configuration.
- Previously reported migration-readiness estimate: 93%. This is a historical checkpoint, not a newly measured percentage or a claim that public launch is complete.

## Current code and CI validation

- PR #8 is merged into `friend-work`.
- Post-merge CI Run #40 passed on merge commit `a98a69d`.
- The CI workflow covers tests, lint, API/web typechecks, and production builds.
- The production environment template is aligned with the variables consumed by `deploy/compose.production.yml` and the API environment schema.

## Remaining release gates

1. Obtain the production domain when budget allows.
2. Point the domain to the OVH server and configure HTTPS.
3. Set `APP_URL`, `WEB_APP_URL`, and `CORS_ORIGIN` to the final HTTPS origins.
4. Verify the public web app, API health endpoint, authentication, and core customer/staff workflows over HTTPS.
5. Reconcile the live production database state with the validated migration/archive checkpoint before any traffic cutover.
6. Complete and review the release rollback procedure.
7. Obtain explicit owner approval before any production deployment, migration, restart, or traffic cutover.

## Deferred operational checks

- Cloud-backup operations, OAuth changes, backup/restore execution, and production backup diagnostics are paused at the owner's request until the domain is available.
- Do not run these checks or change stored backup connections, schedules, credentials, or records while the pause remains in effect.

## Production configuration and security

- The Compose deployment reads `deploy/.env.production.local`; keep it private with restrictive permissions (for example, mode 600).
- Compose constructs `DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
- Use distinct, strong production JWT access and refresh secrets.
- Keep payment, email, and WhatsApp credentials server-side only.
- Never commit `.env`, `.env.local`, real credentials, private keys, or production database URLs.
- Run Prisma migrations explicitly during an approved release; do not run migrations automatically on API startup.
- Keep platform-admin access separate from tenant users.
