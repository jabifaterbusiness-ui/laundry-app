import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../auth/auth.service.js";
import { createBusinessPaymentIdentity } from "../payments/business-payment-identity.service.js";
import { ensureDefaultColors } from "../colors/colors.service.js";

export type BusinessProvisioningInput = {
  businessName: string;
  businessPhone?: string;
  businessEmail?: string | undefined;
  businessWebsite?: string | undefined;
  businessAddress?: string;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  locale: string;
  ownerName: string;
  ownerEmail: string;
  username?: string | undefined;
  password: string;
  branchName: string;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "laundryangel";
}

async function uniqueSlug(
  base: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  let slug = base;
  let counter = 2;

  while (
    await client.business.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    slug = `${base}-${counter++}`;
  }

  return slug;
}

export async function provisionBusiness(
  input: BusinessProvisioningInput,
) {
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const slug = await uniqueSlug(slugify(input.businessName), tx);

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
        username: input.username || null,
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
}
