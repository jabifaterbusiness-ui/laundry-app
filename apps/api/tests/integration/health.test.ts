import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns 200 and status ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", env: "test" });
  });
});

describe("Unknown route", () => {
  it("returns 404 with a structured error body", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("Route not found");
  });
});
