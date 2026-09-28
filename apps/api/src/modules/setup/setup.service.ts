import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { issueTokenPair } from "../auth/auth.service.js";
import { getEffectivePermissionCodes } from "../permissions/permissions.service.js";
import { provisionBusiness } from "../businesses/business-provisioning.service.js";
import type { SetupInput } from "./setup.validation.js";

export async function getSetupStatus() {
  const [businessCount, userCount] = await Promise.all([
    prisma.business.count(),
    prisma.user.count(),
  ]);

  return {
    setupRequired: businessCount === 0 && userCount === 0,
  };
}

export async function completeSetup(input: SetupInput) {
  const status = await getSetupStatus();

  if (!status.setupRequired) {
    throw new AppError("LaundryAngel has already been set up", 409);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.ownerEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError("That email address is already registered", 409);
  }

  const result = await provisionBusiness(input);

  const tokens = await issueTokenPair(result.user);
  const permissions = await getEffectivePermissionCodes(
    result.user.businessId,
    result.user.id,
    result.user.securityRole,
  );

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role,
      businessId: result.user.businessId,
      branches: [
        {
          id: result.branch.id,
          name: result.branch.name,
        },
      ],
      permissions,
    },
    ...tokens,
  };
}
