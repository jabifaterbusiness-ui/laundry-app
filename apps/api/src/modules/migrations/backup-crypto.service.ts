import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { config } from "../../config/index.js";

const MAGIC = Buffer.from("LABK1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + IV_BYTES + TAG_BYTES;

export type BackupEncryptionPurpose = "artifact" | "provider-credentials";

export type BackupEncryptionContext = {
  businessId: string;
  purpose: BackupEncryptionPurpose;
};

function additionalData(context: BackupEncryptionContext): Buffer {
  if (!context.businessId.trim()) {
    throw new Error("A business ID is required for backup encryption.");
  }

  return Buffer.from(
    `${MAGIC.toString("ascii")}:${context.businessId}:${context.purpose}`,
    "utf8",
  );
}

function getKey(): Buffer {
  const configured = config.backups.encryptionKey;

  if (!configured || !/^[a-fA-F0-9]{64}$/.test(configured)) {
    throw new Error(
      "Automatic backup encryption is unavailable: BACKUP_ENCRYPTION_KEY must be configured as 64 hexadecimal characters.",
    );
  }

  const key = Buffer.from(configured, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error("Invalid automatic backup encryption key.");
  }

  return key;
}

/**
 * Encrypts backup artifacts or serialized provider credentials using the
 * dedicated server-managed key. The returned envelope includes a format
 * marker, a random IV and an authenticated-encryption tag.
 */
export function encryptBackupData(
  plaintext: Buffer,
  context: BackupEncryptionContext,
): Buffer {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError("Backup encryption input must be a Buffer.");
  }

  const aad = additionalData(context);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  return Buffer.concat([
    MAGIC,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

/**
 * Decrypts only envelopes created by this service. Authentication failures
 * are returned as a generic error so ciphertext and key details are not leaked.
 */
export function decryptBackupData(
  envelope: Buffer,
  context: BackupEncryptionContext,
): Buffer {
  if (
    !Buffer.isBuffer(envelope) ||
    envelope.length <= HEADER_BYTES ||
    !envelope.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new Error("Invalid automatic backup encrypted data.");
  }

  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;

  const iv = envelope.subarray(ivStart, tagStart);
  const tag = envelope.subarray(tagStart, ciphertextStart);
  const ciphertext = envelope.subarray(ciphertextStart);

  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAAD(additionalData(context));
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      "Unable to decrypt automatic backup data: the key is incorrect or the data is corrupted.",
    );
  }
}

/** Stores encrypted credentials as a database-safe base64url string. */
export function encryptBackupCredentials(
  plaintext: string,
  businessId: string,
): string {
  if (!plaintext) {
    throw new Error("Cloud provider credentials cannot be empty.");
  }

  return encryptBackupData(Buffer.from(plaintext, "utf8"), {
    businessId,
    purpose: "provider-credentials",
  }).toString("base64url");
}

/** Decrypts credentials previously stored by encryptBackupCredentials. */
export function decryptBackupCredentials(
  ciphertext: string,
  businessId: string,
): string {
  if (
    !ciphertext ||
    !/^[A-Za-z0-9_-]+$/.test(ciphertext)
  ) {
    throw new Error("Invalid encrypted cloud provider credentials.");
  }

  const envelope = Buffer.from(ciphertext, "base64url");
  if (envelope.toString("base64url") !== ciphertext) {
    throw new Error("Invalid encrypted cloud provider credentials.");
  }

  return decryptBackupData(envelope, {
    businessId,
    purpose: "provider-credentials",
  }).toString("utf8");
}
