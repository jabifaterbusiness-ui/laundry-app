import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { backfillBusinessPaymentIdentities } from "./modules/payments/business-payment-identity.service.js";
import { registerConfiguredSubscriptionPaymentProviders } from "./modules/subscriptions/providers/payment-provider.bootstrap.js";
import { startFinancialStatementScheduler } from "./modules/reports/financial-statement-scheduler.service.js";
import { startBackupCloudScheduler } from "./modules/migrations/backup-cloud-scheduler.service.js";

async function startServer() {
  const identityBackfill = await backfillBusinessPaymentIdentities();

  logger.info(
    `Business payment identity backfill complete: scanned=${identityBackfill.scanned}, created=${identityBackfill.created}`,
  );

  registerConfiguredSubscriptionPaymentProviders();
  if (config.enableBackgroundSchedulers) {
    startFinancialStatementScheduler();
    startBackupCloudScheduler();
  } else {
    logger.info("Background schedulers disabled by ENABLE_BACKGROUND_SCHEDULERS=false.");
  }

  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`API listening on http://localhost:${config.port} (${config.env})`);
  });
}

startServer().catch((error) => {
  logger.error(
    error instanceof Error
      ? `API startup failed: ${error.message}`
      : "API startup failed.",
  );
  process.exit(1);
});
