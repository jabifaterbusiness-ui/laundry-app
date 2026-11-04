import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../../config/index.js";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const configured = config.receiptDelivery.whatsappTokenEncryptionKey;
  if (!configured) {
    throw new Error("WhatsApp token encryption is not configured");
  }
  return Buffer.from(configured, "hex");
}

/**
 * Encrypt a Meta access token before it is persisted. The random IV and GCM
 * authentication tag are stored with the ciphertext; the key remains in the
 * server environment and is never returned by API handlers.
 */
export function encryptWhatsAppAccessToken(token: string): string {
  if (!token.trim()) throw new Error("WhatsApp access token cannot be empty");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypt only inside trusted server-side provider code. */
export function decryptWhatsAppAccessToken(envelope: string): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = envelope.split(".");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded || extra) {
    throw new Error("Unsupported WhatsApp token ciphertext format");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt WhatsApp access token");
  }
}
