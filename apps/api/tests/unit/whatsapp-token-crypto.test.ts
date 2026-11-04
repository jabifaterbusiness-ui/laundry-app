import { beforeEach, describe, expect, it, vi } from "vitest";

const { encryptionKey } = vi.hoisted(() => ({ encryptionKey: "0123456789abcdef".repeat(4) }));
vi.mock("../../src/config/index.js", () => ({
  config: { receiptDelivery: { whatsappTokenEncryptionKey: encryptionKey } },
}));

import {
  decryptWhatsAppAccessToken,
  encryptWhatsAppAccessToken,
} from "../../src/modules/whatsapp/whatsapp-token-crypto.js";

describe("WhatsApp token encryption", () => {
  it("round-trips a token without storing the plaintext", () => {
    const token = "EAA_test_access_token_value";
    const encrypted = encryptWhatsAppAccessToken(token);
    expect(encrypted).not.toContain(token);
    expect(encrypted.split(".")).toHaveLength(4);
    expect(decryptWhatsAppAccessToken(encrypted)).toBe(token);
  });

  it("uses a fresh nonce for every encryption", () => {
    const first = encryptWhatsAppAccessToken("same-token");
    const second = encryptWhatsAppAccessToken("same-token");
    expect(first).not.toBe(second);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptWhatsAppAccessToken("sensitive-token");
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    const changed = ciphertext!.slice(0, -1) + (ciphertext!.endsWith("A") ? "B" : "A");
    expect(() => decryptWhatsAppAccessToken([version, iv, tag, changed].join("."))).toThrow(
      "Unable to decrypt WhatsApp access token",
    );
  });

  it("rejects malformed ciphertext envelopes", () => {
    expect(() => decryptWhatsAppAccessToken("not-a-valid-envelope")).toThrow(
      "Unsupported WhatsApp token ciphertext format",
    );
  });

  it("rejects empty tokens", () => {
    expect(() => encryptWhatsAppAccessToken("  ")).toThrow(
      "WhatsApp access token cannot be empty",
    );
  });
});
