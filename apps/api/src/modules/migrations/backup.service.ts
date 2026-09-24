import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";

const MAGIC = Buffer.from("LAUNDRYBK");
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

interface BackupPayload {
  format: "laundry-business-backup";
  version: 1;
  exportedAt: string;
  business: { id: string; name: string; slug: string; isActive: boolean; createdAt: string; updatedAt: string };
  branches: Array<{ id: string; name: string; address: string | null; isActive: boolean; createdAt: string; updatedAt: string }>;
  users: Array<{ id: string; email: string; fullName: string; role: string; isActive: boolean; createdAt: string; updatedAt: string }>;
  customers: Array<{ id: string; name: string; phone: string; email: string | null; address: string | null; notes: string | null; isActive: boolean; createdAt: string; updatedAt: string }>;
}

function deriveKey(password: string, salt: Buffer) {
  if (password.length < 12) throw new AppError("Backup password must be at least 12 characters", 422);
  return scryptSync(password, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

function encrypt(payload: BackupPayload, password: string): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(password, salt);
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv, tag, ciphertext]);
}

function decrypt(buffer: Buffer, password: string): BackupPayload {
  const headerLength = MAGIC.length + 1 + SALT_BYTES + IV_BYTES + TAG_BYTES;
  if (buffer.length <= headerLength || !buffer.subarray(0, MAGIC.length).equals(MAGIC) || buffer[MAGIC.length] !== VERSION) {
    throw new AppError("Unsupported or invalid Laundry backup file", 422);
  }
  const saltStart = MAGIC.length + 1;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const salt = buffer.subarray(saltStart, ivStart);
  const iv = buffer.subarray(ivStart, tagStart);
  const tag = buffer.subarray(tagStart, headerLength);
  const ciphertext = buffer.subarray(headerLength);
  const key = deriveKey(password, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(gunzipSync(compressed).toString("utf8")) as BackupPayload;
    if (payload.format !== "laundry-business-backup" || payload.version !== 1) throw new Error("Unsupported backup version");
    return payload;
  } catch {
    throw new AppError("Backup password is incorrect or the backup is corrupted", 422);
  }
}

export async function exportBusinessBackup(businessId: string, userId: string, password: string): Promise<Buffer> {
  const [business, branches, users, customers] = await Promise.all([
    prisma.business.findFirst({ where: { id: businessId } }),
    prisma.branch.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { businessId }, orderBy: { email: "asc" } }),
    prisma.customer.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
  ]);
  if (!business) throw new AppError("Business not found", 404);

  const payload: BackupPayload = {
    format: "laundry-business-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    business: { ...business, createdAt: business.createdAt.toISOString(), updatedAt: business.updatedAt.toISOString() },
    branches: branches.map((branch) => ({ ...branch, createdAt: branch.createdAt.toISOString(), updatedAt: branch.updatedAt.toISOString() })),
    users: users.map((user) => ({ id: user.id, email: user.email, fullName: user.fullName, role: user.role, securityRole: user.securityRole, isActive: user.isActive, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() })),
    customers: customers.map((customer) => ({ ...customer, createdAt: customer.createdAt.toISOString(), updatedAt: customer.updatedAt.toISOString() })),
  };

  const encrypted = encrypt(payload, password);
  await recordAuditEvent({ action: "backup.exported", entityType: "BusinessBackup", businessId, actorUserId: userId, correlationId: null, metadata: { version: 1, sha256: createHash("sha256").update(encrypted).digest("hex"), customers: customers.length, branches: branches.length, users: users.length } });
  return encrypted;
}

export async function restoreBusinessBackup(businessId: string, userId: string, buffer: Buffer, password: string) {
  const payload = decrypt(buffer, password);
  if (payload.business.slug === "") throw new AppError("Backup does not contain a valid business", 422);

  const result = await prisma.$transaction(async (tx) => {
    let createdCustomers = 0;
    let updatedCustomers = 0;
    let skippedUsers = 0;

    for (const branch of payload.branches) {
      const existing = await tx.branch.findFirst({ where: { businessId, name: branch.name } });
      if (existing) {
        await tx.branch.update({ where: { id: existing.id }, data: { address: branch.address, isActive: branch.isActive } });
      } else {
        await tx.branch.create({ data: { businessId, name: branch.name, address: branch.address, isActive: branch.isActive } });
      }
    }

    for (const customer of payload.customers) {
      const existing = await tx.customer.findFirst({ where: { businessId, phone: customer.phone } });
      if (existing) {
        await tx.customer.update({ where: { id: existing.id }, data: { name: customer.name, email: customer.email, address: customer.address, notes: customer.notes, isActive: customer.isActive } });
        updatedCustomers += 1;
      } else {
        await tx.customer.create({ data: { businessId, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, notes: customer.notes, isActive: customer.isActive } });
        createdCustomers += 1;
      }
    }

    // Users are deliberately not overwritten during a merge restore. This
    // prevents a backup from silently changing credentials/roles in a live
    // tenant. User recovery is an explicit future elevated workflow.
    skippedUsers = payload.users.length;
    return { createdCustomers, updatedCustomers, skippedUsers };
  });

  await recordAuditEvent({ action: "backup.restored", entityType: "BusinessBackup", businessId, actorUserId: userId, correlationId: null, metadata: { version: 1, createdCustomers: result.createdCustomers, updatedCustomers: result.updatedCustomers, skippedUsers: result.skippedUsers } });
  return result;
}
