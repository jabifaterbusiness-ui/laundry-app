# Production Readiness

## Repository checkpoint

- Branch: `main`
- Latest commit: `a105de8`
- Latest commit message: `chore(deploy): add production environment template`
- Remote: `https://github.com/jabifaterbusiness-ui/laundry-app`

## Production assets

- API image definition: `Dockerfile`
- Web image definition: `deploy/web.Dockerfile`
- Nginx configuration: `deploy/nginx/default.conf`
- Production environment template: `deploy/production.env.example`
- Prisma production binary target: `linux-musl-openssl-3.0.x`
- Explicit migration command: `npm run db:migrate:deploy --workspace=apps/api`

## Validation completed

- API tests passed: 65 files / 1,010 tests
- Web tests passed: 21 files / 155 tests
- API typecheck passed
- Web typecheck passed
- API lint passed
- Web lint passed
- Shared, API, and web production builds passed
- Production API container health smoke test passed
- Production Prisma engine and database connection rehearsal passed
- Production image migration rehearsal passed against temporary PostgreSQL
- Production PWA icons generated and included
- No tracked real environment files or secret-like files

## Remaining deployment tasks

1. Provision production PostgreSQL.
2. Configure real production secrets and environment variables.
3. Deploy the API container.
4. Run Prisma migrations against the production database.
5. Deploy the web container.
6. Configure the production domain and HTTPS.
7. Run authenticated staging or production end-to-end smoke tests.
8. Complete final release verification and rollback documentation.

## Security reminders

- Never commit `.env`, `.env.local`, credentials, private keys, or real secrets.
- Use different production access and refresh secrets.
- Restrict `CORS_ORIGIN` to the real web application origin.
- Run migrations explicitly during deployment; do not run them automatically on API startup.
- Keep platform-admin access separate from tenant users.
