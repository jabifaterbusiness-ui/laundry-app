import { afterEach, describe, expect, it, vi } from "vitest";

describe("background scheduler environment configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadSchedulerSetting() {
    vi.resetModules();
    const { env } = await import("../../src/config/env.js");
    return env.ENABLE_BACKGROUND_SCHEDULERS;
  }

  it("defaults to enabled to preserve existing deployments", async () => {
    vi.stubEnv("ENABLE_BACKGROUND_SCHEDULERS", undefined as unknown as string);
    expect(await loadSchedulerSetting()).toBe(true);
  });

  it("accepts the explicit true value", async () => {
    vi.stubEnv("ENABLE_BACKGROUND_SCHEDULERS", "true");
    expect(await loadSchedulerSetting()).toBe(true);
  });

  it("treats the explicit false string as false", async () => {
    vi.stubEnv("ENABLE_BACKGROUND_SCHEDULERS", "false");
    expect(await loadSchedulerSetting()).toBe(false);
  });

  it("rejects unrecognised values", async () => {
    vi.stubEnv("ENABLE_BACKGROUND_SCHEDULERS", "0");
    await expect(loadSchedulerSetting()).rejects.toThrow(
      "Invalid environment configuration",
    );
  });
});
