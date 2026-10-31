import { PassThrough } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { LOG_REDACTION } from "../../src/lib/logger.js";

describe("HTTP log redaction", () => {
  it("redacts authorization, session, API-key and response cookie headers", async () => {
    const stream = new PassThrough();
    const logLine = new Promise<string>((resolve) => {
      stream.once("data", (chunk: Buffer) => resolve(chunk.toString("utf8")));
    });
    const testLogger = pino(
      { level: "info", redact: LOG_REDACTION },
      stream,
    );

    testLogger.info(
      {
        req: {
          id: "request-test",
          headers: {
            authorization: "Bearer access-secret",
            cookie: "session=session-secret",
            "set-cookie": "refresh=refresh-secret",
            "proxy-authorization": "Basic proxy-secret",
            "x-api-key": "api-key-secret",
            "x-auth-token": "custom-token-secret",
            "user-agent": "LaundryAngel security test",
          },
        },
        res: {
          statusCode: 200,
          responseTime: 12,
          headers: {
            "set-cookie": "session=outgoing-secret",
          },
        },
      },
      "request completed",
    );

    const output = await logLine;
    const record = JSON.parse(output);

    expect(record.req.headers.authorization).toBe("[Redacted]");
    expect(record.req.headers.cookie).toBe("[Redacted]");
    expect(record.req.headers["set-cookie"]).toBe("[Redacted]");
    expect(record.req.headers["proxy-authorization"]).toBe("[Redacted]");
    expect(record.req.headers["x-api-key"]).toBe("[Redacted]");
    expect(record.req.headers["x-auth-token"]).toBe("[Redacted]");
    expect(record.res.headers["set-cookie"]).toBe("[Redacted]");
    expect(record.req.headers["user-agent"]).toBe("LaundryAngel security test");
    expect(record.res.statusCode).toBe(200);
    expect(record.res.responseTime).toBe(12);

    for (const secret of [
      "access-secret",
      "session-secret",
      "refresh-secret",
      "proxy-secret",
      "api-key-secret",
      "custom-token-secret",
      "outgoing-secret",
    ]) {
      expect(output).not.toContain(secret);
    }

    testLogger.flush();
    stream.end();
  });
});
