import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import { issueTokenPair } from "../auth/auth.service.js";
import { getEffectivePermissionCodes } from "../permissions/permissions.service.js";
import { getPlatformConfig } from "../platform/platform-config.service.js";
import { provisionBusiness } from "../businesses/business-provisioning.service.js";
import type { BusinessRegistrationInput } from "./business-registration.validation.js";

export async function getBusinessRegistrationStatus() {
  const config = await getPlatformConfig();

  return {
    registrationEnabled: config.allowNewBusinessRegistration,
  };
}

export async function registerBusiness(input: BusinessRegistrationInput) {
  const platformConfig = await getPlatformConfig();

  if (!platformConfig.allowNewBusinessRegistration) {
    throw new AppError(
      "New business registration is currently unavailable.",
      403,
    );
  }

  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const username = input.username?.trim().toLowerCase() || undefined;

  const existingEmail = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });

  if (existingEmail) {
    throw new AppError("That email address is already registered", 409);
  }

  if (username) {
    const existingUsername = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUsername) {
      throw new AppError("That username is already registered", 409);
    }
  }

  let result;

  try {
    result = await provisionBusiness({
      businessName: input.businessName,
      businessPhone: input.businessPhone,
      businessEmail: input.businessEmail?.trim().toLowerCase(),
      businessWebsite: input.businessWebsite,
      businessAddress: input.businessAddress,
      countryCode: input.countryCode,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      locale: input.locale,
      ownerName: input.ownerName,
      ownerEmail,
      username,
      password: input.password,
      branchName: input.branchName,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "The registration details are already in use. Please check the email or username and try again.",
        409,
      );
    }

    throw error;
  }

  const tokens = await issueTokenPair(result.user);
  const permissions = await getEffectivePermissionCodes(
    result.user.businessId,
    result.user.id,
    result.user.securityRole,
  );

  await recordAuditEvent({
    action: "business.registration.created",
    entityType: "Business",
    entityId: result.business.id,
    businessId: result.business.id,
    actorUserId: result.user.id,
    metadata: {
      businessName: result.business.name,
      ownerUserId: result.user.id,
      branchId: result.branch.id,
    },
  });

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      fullName: result.user.fullName,
      role: result.user.role,
      securityRole: result.user.securityRole,
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
