import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("WhatsApp webhook", () => {
  it("verifies a valid Meta webhook challenge", async () => {
    const app = createApp();

    const res = await request(app)
      .get("/api/v1/whatsapp/webhook")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "test_whatsapp_verify_token",
        "hub.challenge": "123456789",
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe("123456789");
  });

  it("rejects an invalid verify token", async () => {
    const app = createApp();

    const res = await request(app)
      .get("/api/v1/whatsapp/webhook")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong_token",
        "hub.challenge": "123456789",
      });

    expect(res.status).toBe(403);
  });

  it("acknowledges incoming webhook notifications", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/v1/whatsapp/webhook")
      .send({
        object: "whatsapp_business_account",
        entry: [],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
