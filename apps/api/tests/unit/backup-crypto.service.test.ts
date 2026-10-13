import { beforeEach, describe, expect, it, vi } from "vitest";

const cryptoConfig = vi.hoisted(() => ({
  encryptionKey: "0123456789abcdef".repeat(4),
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    backups: {
      get encryptionKey() {
        return cryptoConfig.encryptionKey;
      },
    },
  },
}));

import {
  decryptBackupCredentials,
  decryptBackupData,
  encryptBackupCredentials,
  encryptBackupData,
} from "../../src/modules/migrations/backup-crypto.service.js";

describe("dedicated backup encryption", () => {
  beforeEach(() => {
    cryptoConfig.encryptionKey = "0123456789abcdef".repeat(4);
  });

  it("round-trips backup artifact bytes", () => {
    const original = Buffer.from("scheduled backup artifact", "utf8");
    const context = { businessId: "business-a", purpose: "artifact" as const };
    const encrypted = encryptBackupData(original, context);

    expect(encrypted.equals(original)).toBe(false);
    expect(decryptBackupData(encrypted, context)).toEqual(original);
  });

  it("uses a fresh nonce for each encryption", () => {
    const original = Buffer.from("same content");
    const context = { businessId: "business-a", purpose: "artifact" as const };
    const first = encryptBackupData(original, context);
    const second = encryptBackupData(original, context);

    expect(first.equals(second)).toBe(false);
    expect(decryptBackupData(first, context)).toEqual(original);
    expect(decryptBackupData(second, context)).toEqual(original);
  });

  it("round-trips provider credentials without storing plaintext", () => {
    const secret = JSON.stringify({
      accessToken: "example-access-token",
      refreshToken: "example-refresh-token",
    });

    const encrypted = encryptBackupCredentials(secret, "business-a");

    expect(encrypted).not.toContain("example-access-token");
    expect(encrypted).not.toContain("example-refresh-token");
    expect(decryptBackupCredentials(encrypted, "business-a")).toBe(secret);
  });

  it("rejects data encrypted under a different key", () => {
    const context = { businessId: "business-a", purpose: "artifact" as const };
    const encrypted = encryptBackupData(Buffer.from("private data"), context);
    cryptoConfig.encryptionKey = "fedcba9876543210".repeat(4);

    expect(() => decryptBackupData(encrypted, context)).toThrow(/incorrect|corrupted/i);
  });

  it("rejects tampered ciphertext", () => {
    const context = { businessId: "business-a", purpose: "artifact" as const };
    const encrypted = encryptBackupData(Buffer.from("private data"), context);
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;

    expect(() => decryptBackupData(encrypted, context)).toThrow(/incorrect|corrupted/i);
  });

  it("fails closed when the dedicated key is missing", () => {
    cryptoConfig.encryptionKey = "";

    expect(() =>
      encryptBackupData(Buffer.from("private data"), {
        businessId: "business-a",
        purpose: "artifact",
      }),
    ).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it("rejects ciphertext used for another business or purpose", () => {
    const encrypted = encryptBackupData(Buffer.from("private data"), {
      businessId: "business-a",
      purpose: "artifact",
    });

    expect(() =>
      decryptBackupData(encrypted, {
        businessId: "business-b",
        purpose: "artifact",
      }),
    ).toThrow(/incorrect|corrupted/i);

    expect(() =>
      decryptBackupData(encrypted, {
        businessId: "business-a",
        purpose: "provider-credentials",
      }),
    ).toThrow(/incorrect|corrupted/i);
  });

  it("rejects malformed credential envelopes", () => {
    expect(() =>
      decryptBackupCredentials("not valid ciphertext!", "business-a"),
    ).toThrow();
  });

  it("rejects empty credentials", () => {
    expect(() => encryptBackupCredentials("", "business-a")).toThrow(/cannot be empty/i);
  });
});
