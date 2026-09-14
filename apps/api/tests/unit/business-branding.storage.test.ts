import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const { configMock } = vi.hoisted(() => ({
  configMock: {
    appUrl: "http://localhost:4000",
    isProduction: false,
    log: {
      level: "silent",
    },
    businessBranding: {
      storageDir: "",
      maxUploadBytes: 5 * 1024 * 1024,
    },
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: configMock,
}));

import {
  deleteBusinessLogo,
  getBusinessLogoUrl,
  readBusinessLogo,
  saveBusinessLogo,
} from "../../src/modules/businesses/business-branding.storage.js";

let storageDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  configMock.businessBranding.maxUploadBytes = 5 * 1024 * 1024;
  storageDir = await mkdtemp(path.join(os.tmpdir(), "laundry-branding-"));
  configMock.businessBranding.storageDir = storageDir;
});

afterEach(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

async function pngBuffer(width = 200, height = 100) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("business branding storage", () => {
  it("stores a normalized PNG inside the business-scoped directory", async () => {
    const input = await pngBuffer();

    const result = await saveBusinessLogo(
      "biz-1",
      input,
      "image/png",
    );

    expect(result.logoUrl).toBe(
      "http://localhost:4000/api/v1/businesses/logo",
    );

    const stored = await readFile(
      path.join(storageDir, "biz-1", "logo.png"),
    );

    expect(stored.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
  });

  it("accepts JPEG and normalizes it to PNG", async () => {
    const input = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    await saveBusinessLogo("biz-jpeg", input, "image/jpeg");

    const stored = await readBusinessLogo("biz-jpeg");
    expect(stored).not.toBeNull();
    expect(stored!.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
  });

  it("rejects unsupported MIME types", async () => {
    const input = await pngBuffer();

    await expect(
      saveBusinessLogo("biz-1", input, "application/pdf"),
    ).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("rejects uploads over the configured size limit", async () => {
    configMock.businessBranding.maxUploadBytes = 10;

    const input = await pngBuffer();

    await expect(
      saveBusinessLogo("biz-1", input, "image/png"),
    ).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("rejects images exceeding the dimension limit", async () => {
    const input = await pngBuffer(4001, 100);

    await expect(
      saveBusinessLogo("biz-1", input, "image/png"),
    ).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("returns null when a business has no stored logo", async () => {
    await expect(readBusinessLogo("missing-business")).resolves.toBeNull();
  });

  it("replaces an existing logo atomically", async () => {
    const first = await pngBuffer(100, 100);
    const second = await pngBuffer(300, 150);

    await saveBusinessLogo("biz-1", first, "image/png");
    await saveBusinessLogo("biz-1", second, "image/png");

    const stored = await readBusinessLogo("biz-1");
    expect(stored).not.toBeNull();

    const metadata = await sharp(stored!).metadata();
    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(150);
  });

  it("deletes only the selected business logo storage", async () => {
    await saveBusinessLogo("biz-1", await pngBuffer(), "image/png");
    await saveBusinessLogo("biz-2", await pngBuffer(), "image/png");

    await deleteBusinessLogo("biz-1");

    await expect(readBusinessLogo("biz-1")).resolves.toBeNull();
    await expect(readBusinessLogo("biz-2")).resolves.not.toBeNull();
  });

  it("returns the authenticated application logo endpoint", () => {
    expect(getBusinessLogoUrl()).toBe(
      "http://localhost:4000/api/v1/businesses/logo",
    );
  });
});
