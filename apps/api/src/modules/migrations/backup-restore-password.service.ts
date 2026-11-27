import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptBackupData, encryptBackupData } from "./backup-crypto.service.js";

function encryptPassword(password: string, businessId: string): string {
  return encryptBackupData(Buffer.from(password, "utf8"), { businessId, purpose: "restore-password" }).toString("base64");
}

function decryptPassword(ciphertext: string, businessId: string): string {
  return decryptBackupData(Buffer.from(ciphertext, "base64"), { businessId, purpose: "restore-password" }).toString("utf8");
}

export async function getBusinessRestorePassword(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { backupRestorePasswordCiphertext: true },
  });
  if (!business) throw new AppError("Business not found.", 404);

  let ciphertext = business.backupRestorePasswordCiphertext;
  if (!ciphertext) {
    const generated = randomBytes(24).toString("base64url");
    const created = await prisma.business.updateMany({
      where: { id: businessId, backupRestorePasswordCiphertext: null },
      data: { backupRestorePasswordCiphertext: encryptPassword(generated, businessId) },
    });
    const stored = await prisma.business.findUnique({ where: { id: businessId }, select: { backupRestorePasswordCiphertext: true } });
    if (!stored?.backupRestorePasswordCiphertext) throw new AppError("Could not initialize the business restoration password.", 503);
    ciphertext = stored.backupRestorePasswordCiphertext;
    // A concurrent initializer may have won. Return its secret; the caller only
    // needs to fetch the persisted value once and it is never written to logs.
    void created;
  }

  try {
    return decryptPassword(ciphertext, businessId);
  } catch {
    throw new AppError("The business restoration password cannot be decrypted. Contact your administrator.", 503);
  }
}

export async function changeBusinessRestorePassword(businessId: string, password: string) {
  const ciphertext = encryptPassword(password, businessId);
  const result = await prisma.business.updateMany({ where: { id: businessId }, data: { backupRestorePasswordCiphertext: ciphertext } });
  if (!result.count) throw new AppError("Business not found.", 404);
}

export async function verifyBusinessRestorePassword(businessId: string, submitted: string | undefined) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { backupRestorePasswordCiphertext: true } });
  if (!business) throw new AppError("Business not found.", 404);
  if (!business.backupRestorePasswordCiphertext) {
    throw new AppError("A business restoration password has not been configured. Ask an authorized manager to configure one.", 409);
  }
  if (typeof submitted !== "string") throw new AppError("The business restoration password is required.", 422);
  let expected: Buffer;
  try {
    expected = Buffer.from(decryptPassword(business.backupRestorePasswordCiphertext, businessId), "utf8");
  } catch {
    throw new AppError("The business restoration password cannot be verified. Contact your administrator.", 503);
  }
  const actual = Buffer.from(submitted, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError("The business restoration password is incorrect.", 403);
  }
}
