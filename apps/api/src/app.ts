import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { migrationsRouter } from "./modules/migrations/migrations.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(express.json({
    limit: "2mb",
    // Large JSON files used by the migration endpoint must remain raw so
    // the migration controller can enforce its own upload-size limit.
type: (req) => !req.url?.endsWith("/migrations/jobs/analyze"),
  }));
  app.use(requestContext);
  app.use(pinoHttp({ logger, autoLogging: !config.isTest }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", env: config.env });
  });

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/customers", customersRouter);
  v1.use("/migrations", migrationsRouter);
  // Future modules mount here, e.g.:
  // v1.use("/orders", ordersRouter);

  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
