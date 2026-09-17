import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { backfillBusinessPaymentIdentities } from "./modules/payments/business-payment-identity.service.js";

async function startServer() {
  const identityBackfill = await backfillBusinessPaymentIdentities();

  logger.info(
    `Business payment identity backfill complete: scanned=${identityBackfill.scanned}, created=${identityBackfill.created}`,
  );

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
