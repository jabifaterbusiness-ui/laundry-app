import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { hashPassword } from "../auth/auth.service.js";

const PLATFORM_OWNER_PASSWORD_MIN_LENGTH = 12;

export async function bootstrapPlatformOwner(input: {
  fullName: string;
  email: string;
  password: string;
}) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) {
    throw new AppError("Platform Owner name is required", 400);
  }

  if (input.password.length < PLATFORM_OWNER_PASSWORD_MIN_LENGTH) {
    throw new AppError(
      `Platform Owner password must be at least ${PLATFORM_OWNER_PASSWORD_MIN_LENGTH} characters`,
      400,
    );
  }

  if (!email) {
    throw new AppError("Platform Owner email is required", 400);
  }

  const existingPlatformOwner = await prisma.user.findFirst({
    where: { role: "PLATFORM_ADMIN" },
    select: { id: true, email: true, isActive: true },
  });

  if (existingPlatformOwner) {
    throw new AppError(
      "A Platform Owner already exists. Use the existing account recovery flow instead.",
      409,
    );
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingEmail) {
    throw new AppError("A user with this email already exists", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(
    async (tx) => {
      const platformOwnerCount = await tx.user.count({
        where: { role: "PLATFORM_ADMIN" },
      });

      if (platformOwnerCount > 0) {
        throw new AppError(
          "A Platform Owner already exists. Use the existing account recovery flow instead.",
          409,
        );
      }

      return tx.user.create({
        data: {
          fullName,
          email,
          passwordHash,
          role: Role.PLATFORM_ADMIN,
          isActive: true,
          businessId: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          businessId: true,
          isActive: true,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await recordAuditEvent({
    action: "platform.owner_bootstrapped",
    entityType: "User",
    entityId: user.id,
    businessId: null,
    actorUserId: null,
    metadata: {
      role: user.role,
      email: user.email,
      bootstrap: true,
    },
  });

  return user;
}
