import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { migrationsRouter } from "./modules/migrations/migrations.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { garmentsRouter } from "./modules/garments/garments.routes.js";
import { invoicesRouter } from "./modules/invoices/invoices.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { branchesRouter } from "./modules/branches/branches.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { servicesRouter } from "./modules/services/services.routes.js";
import iousRouter from "./modules/payroll/ious.routes.js";
import loansRouter from "./modules/payroll/loans.routes.js";
import repaymentsRouter from "./modules/payroll/repayments.routes.js";
import compensationRouter from "./modules/payroll/compensation.routes.js";
import payrollRouter from "./modules/payroll/payroll.routes.js";
import { permissionsRouter } from "./modules/permissions/permissions.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { searchRouter } from "./modules/search/search.routes.js";
import { quickOperationsRouter } from "./modules/quick-operations/quick-operations.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.cors.origin, credentials: true }));
  app.use(
    express.json({
      limit: "2mb",
      // Large JSON files used by the migration endpoint must remain raw so
      // the migration controller can enforce its own upload-size limit.
      type: (req) => !req.url?.endsWith("/migrations/jobs/analyze"),
    }),
  );
  app.use(requestContext);
  app.use(pinoHttp({ logger, autoLogging: !config.isTest }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", env: config.env });
  });

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/businesses", businessesRouter);
  v1.use("/branches", branchesRouter);
  v1.use("/customers", customersRouter);
  v1.use("/migrations", migrationsRouter);
  v1.use("/services", servicesRouter);
  v1.use("/orders", ordersRouter);
  v1.use("/garments", garmentsRouter);
  v1.use("/invoices", invoicesRouter);
  v1.use("/inventory", inventoryRouter);
  v1.use("/payments", paymentsRouter);
  v1.use("/payroll/ious", iousRouter);
  v1.use("/payroll/loans", loansRouter);
  v1.use("/payroll/repayments", repaymentsRouter);
  v1.use("/payroll/compensation", compensationRouter);
  v1.use("/payroll", payrollRouter);
  v1.use("/permissions", permissionsRouter);
  v1.use("/reports", reportsRouter);
  v1.use("/search", searchRouter);
  v1.use("/quick-operations", quickOperationsRouter);
  v1.use("/users", usersRouter);

  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
