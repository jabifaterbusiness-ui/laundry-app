import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { hashPassword, issueTokenPair } from "../auth/auth.service.js";
import type { SetupInput } from "./setup.validation.js";
import { createBusinessPaymentIdentity } from "../payments/business-payment-identity.service.js";
import { getEffectivePermissionCodes } from "../permissions/permissions.service.js";
import { ensureDefaultColors } from "../colors/colors.service.js";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "laundryangel";
}

async function uniqueSlug(base: string) {
  let slug = base;
  let counter = 2;

  while (
    await prisma.business.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    slug = `${base}-${counter++}`;
  }

  return slug;
}

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

  const passwordHash = await hashPassword(input.password);
  const slug = await uniqueSlug(slugify(input.businessName));

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: input.businessName,
        slug,
        phone: input.businessPhone || null,
        email: input.businessEmail || null,
        website: input.businessWebsite || null,
        address: input.businessAddress || null,
        countryCode: input.countryCode,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        locale: input.locale,
        isActive: true,
      },
    });

    await createBusinessPaymentIdentity(tx, business.id);

    await ensureDefaultColors(business.id, tx);

    const branch = await tx.branch.create({
      data: {
        businessId: business.id,
        name: input.branchName,
        isActive: true,
      },
    });

    const user = await tx.user.create({
      data: {
        email: input.ownerEmail,
        passwordHash,
        fullName: input.ownerName,
        role: "Business Owner",
        securityRole: "BUSINESS_OWNER",
        isActive: true,
        businessId: business.id,
      },
    });

    await tx.userBranch.create({
      data: {
        userId: user.id,
        branchId: branch.id,
      },
    });

    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setMonth(endsAt.getMonth() + 1);

    await tx.subscription.create({
      data: {
        businessId: business.id,
        plan: "MONTHLY",
        status: "ACTIVE",
        startsAt,
        endsAt,
      },
    });

    return { business, branch, user };
  });

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
