import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

const appSecret = "test_whatsapp_app_secret_for_webhook_tests";

function signature(payload: object) {
  return `sha256=${createHmac("sha256", appSecret).update(JSON.stringify(payload)).digest("hex")}`;
}

describe("WhatsApp webhook", () => {
  it("verifies a valid Meta webhook challenge", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/whatsapp/webhook").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "test_whatsapp_verify_token",
      "hub.challenge": "123456789",
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe("123456789");
  });

  it("rejects an invalid verify token", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/whatsapp/webhook").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong_token",
      "hub.challenge": "123456789",
    });
    expect(res.status).toBe(403);
  });

  it("accepts a correctly signed Meta callback", async () => {
    const app = createApp();
    const payload = { object: "whatsapp_business_account", entry: [] };
    const res = await request(app)
      .post("/api/v1/whatsapp/webhook")
      .set("x-hub-signature-256", signature(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, processedStatuses: 0 });
  });

  it("rejects an unsigned or incorrectly signed callback", async () => {
    const app = createApp();
    const payload = { object: "whatsapp_business_account", entry: [] };
    const res = await request(app)
      .post("/api/v1/whatsapp/webhook")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(payload);

    expect(res.status).toBe(401);
  });
});
