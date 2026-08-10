import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Assigns a per-request correlation id (reusing an inbound X-Request-Id
 * header if the caller/proxy already set one) and echoes it back on the
 * response. This id is what AuditLog rows reference (correlationId) so a
 * given request's audit trail can be reconstructed later, and it's cheap
 * enough to attach unconditionally rather than only when auditing.
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const inbound = req.headers["x-request-id"];
  const correlationId = typeof inbound === "string" && inbound.length > 0 ? inbound : crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader("X-Request-Id", correlationId);

  next();
}
