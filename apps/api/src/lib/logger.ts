import pino from "pino";
import { config } from "../config/index.js";

// HTTP request logs must never persist credentials or session cookies.
// Pino applies these paths before serializing every log record.
export const LOG_REDACTION = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["set-cookie"]',
    "req.headers.proxy-authorization",
    'req.headers["x-api-key"]',
    'req.headers["x-auth-token"]',
    'res.headers["set-cookie"]',
  ],
  censor: "[Redacted]",
};

export const logger = pino({
  level: config.log.level,
  redact: LOG_REDACTION,
  ...(config.isProduction
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});
