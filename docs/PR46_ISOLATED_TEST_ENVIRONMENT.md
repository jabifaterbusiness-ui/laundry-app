# PR #46 isolated browser-test environment

This environment is deliberately separate from both production and the existing shared staging project.

## Isolation boundaries

- Compose project: `laundryangel-pr46-test`
- PostgreSQL database and named volumes: `laundryangel_pr46_test_*`
- Docker networks: `laundryangel_pr46_test_net` and `laundryangel_pr46_test_ingress`
- Web binding: `127.0.0.1:18081` only
- Background schedulers: disabled
- Database: created empty by this Compose project; do not import production or existing staging dumps
- Secrets: generated on the VPS into `/opt/laundryangel/pr46-test/.env.pr46-test`, mode 0600

Do not run `docker compose down -v`, `docker volume prune`, or broad Docker cleanup commands. They are not part of this workflow.

## Prepare on the VPS

From the LaundryAngel Codespace terminal, package the isolated-test branch (which contains the infrastructure files) and copy it to the VPS:

```bash
git fetch origin ops/pr46-isolated-test-stack
git archive --format=tar.gz --output=/tmp/laundryangel-pr46-isolated-test.tar.gz origin/ops/pr46-isolated-test-stack
scp /tmp/laundryangel-pr46-isolated-test.tar.gz ubuntu@148.113.149.30:/tmp/
```

Then connect to the VPS and extract it into:

```bash
ssh ubuntu@148.113.149.30
sudo install -d -m 700 /opt/laundryangel/pr46-test/source
sudo tar --no-same-owner --no-same-permissions -xzf /tmp/laundryangel-pr46-isolated-test.tar.gz -C /opt/laundryangel/pr46-test/source
```

The package branch is based on the CI-passing application commit and adds only isolated-test infrastructure and documentation. The application code being tested is unchanged from commit `34ea676b263ad62127d892af8643659313149bbd`. The archive contains that application source plus the isolated-test deployment files.

Then run:

```bash
sudo bash /opt/laundryangel/pr46-test/source/deploy/pr46-test/prepare-env.sh
sudo bash /opt/laundryangel/pr46-test/source/deploy/pr46-test/deploy.sh 34ea676b263ad62127d892af8643659313149bbd
sudo bash /opt/laundryangel/pr46-test/source/deploy/pr46-test/seed-permissions.sh
```

The deploy script validates Compose, builds dedicated images, starts only the dedicated database, verifies and saves a pre-deploy database archive, then starts API and web. The API image applies Prisma migrations during startup. The script does not stop or recreate the existing staging or production containers.

For later updates, the script creates a new verified database backup before starting the API. Database migrations are not automatically reversible; retain backups and do not assume an application-image rollback reverses schema changes.

## Bootstrap a dedicated test administrator

After the API and web are healthy:

```bash
sudo bash /opt/laundryangel/pr46-test/source/deploy/pr46-test/bootstrap-platform-owner.sh
```

The script prompts for a test-only email, name and password. The password is hidden while typed and is not written into the environment file. The bootstrap command refuses to create a second Platform Owner.

Sign in at the isolated test site, create a clearly named synthetic business (for example, `PR46 Chat Test Business`), create a test branch, and create at least two test staff users with distinct test-only email addresses. Assign the chat permissions needed for each scenario through the application's normal permission workflow. Use no real customer contact details.

## Access from a workstation

Create an SSH tunnel:

```bash
ssh -L 18081:127.0.0.1:18081 ubuntu@148.113.149.30
```

Then open `http://localhost:18081`. Use two separate browser profiles for the two test users.

## Acceptance checklist

1. Sign in as each dedicated test user in separate browser profiles.
2. Verify direct messages, replies, reactions, unread counts and read indicators.
3. Verify group creation and member management with the required permissions.
4. Upload and open an allowed test attachment.
5. Verify branch changes reset chat state and cross-branch/business conversations remain inaccessible.
6. Verify in-app and browser desktop alerts while the app is running.
7. Confirm that no calling UI falsely claims audio/video calls are available; calls and closed-browser Web Push are outside this PR.

## Operational safety

- Never connect this project to the production database.
- Never reuse the production or shared-staging `.env` file.
- Never restore production/shared-staging database dumps into this project.
- Do not publish port 18081 on a public interface.
- Do not merge PR #46 or deploy production as part of this procedure.
