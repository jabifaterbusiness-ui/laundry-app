import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

const PAYMENT_CODE_PREFIX = "LA-";
const PAYMENT_CODE_LENGTH = 8;
const PAYMENT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateIdentityCodes() {
  const bytes = randomBytes(PAYMENT_CODE_LENGTH);
  let suffix = "";

  for (const byte of bytes) {
    suffix += PAYMENT_CODE_ALPHABET[byte % PAYMENT_CODE_ALPHABET.length];
  }

  return {
    businessCode: `LA-BIZ-${suffix}`,
    paymentCode: `${PAYMENT_CODE_PREFIX}${suffix}`,
  };
}

export async function ensureBusinessPaymentIdentity(
  businessId: string,
) {
  const existing = await prisma.businessPaymentIdentity.findUnique({
    where: { businessId },
  });

  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { businessCode, paymentCode } = generateIdentityCodes();

    try {
      return await prisma.businessPaymentIdentity.create({
        data: {
          businessId,
          businessCode,
          paymentCode,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError(
    "Unable to create a unique business payment identity",
    500,
  );
}

export async function backfillBusinessPaymentIdentities() {
  const businesses = await prisma.business.findMany({
    where: {
      paymentIdentity: null,
    },
    select: {
      id: true,
    },
  });

  let created = 0;

  for (const business of businesses) {
    await ensureBusinessPaymentIdentity(business.id);
    created += 1;
  }

  return {
    scanned: businesses.length,
    created,
  };
}

export async function createBusinessPaymentIdentity(
  tx: Prisma.TransactionClient,
  businessId: string,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { businessCode, paymentCode } = generateIdentityCodes();

    try {
      return await tx.businessPaymentIdentity.create({
        data: {
          businessId,
          businessCode,
          paymentCode,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to generate a unique business payment identity");
}
