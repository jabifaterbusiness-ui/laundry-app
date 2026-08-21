import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";

const MAGIC = Buffer.from("LMIG1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  return createHash("sha256").update(config.migrations.storageKey, "utf8").digest();
}

function encrypt(buffer: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(buffer: Buffer): Buffer {
  if (buffer.length < MAGIC.length + IV_BYTES + TAG_BYTES || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Invalid encrypted migration source");
  }
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const payloadStart = tagStart + TAG_BYTES;
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(ivStart, tagStart));
  decipher.setAuthTag(buffer.subarray(tagStart, payloadStart));
  return Buffer.concat([decipher.update(buffer.subarray(payloadStart)), decipher.final()]);
}

export async function ensureMigrationStorage() {
  await mkdir(config.migrations.storageDir, { recursive: true });
}

export async function storeMigrationSource(jobId: string, buffer: Buffer): Promise<{ path: string; sha256: string }> {
  await ensureMigrationStorage();
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const filePath = path.join(config.migrations.storageDir, `${jobId}.source.enc`);
  await writeFile(filePath, encrypt(buffer), { flag: "wx", mode: 0o600 });
  return { path: filePath, sha256 };
}

export async function readMigrationSource(filePath: string): Promise<Buffer> {
  return decrypt(await readFile(filePath));
}

export async function deleteMigrationSource(filePath: string) {
  await rm(filePath, { force: true });
}
