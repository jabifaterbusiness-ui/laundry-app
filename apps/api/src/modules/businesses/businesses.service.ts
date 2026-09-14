import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export interface UpdateBusinessBrandingData {
  receiptPrimaryColor?: string | null | undefined;
  receiptAccentColor?: string | null | undefined;
  receiptBackgroundColor?: string | null | undefined;
  receiptTextColor?: string | null | undefined;
  receiptHeaderStyle?: string | null | undefined;
}

const brandingSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  website: true,
  address: true,
  logoUrl: true,
  receiptPrimaryColor: true,
  receiptAccentColor: true,
  receiptBackgroundColor: true,
  receiptTextColor: true,
  receiptHeaderStyle: true,
} as const;

export async function getBusinessBranding(businessId: string) {
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: brandingSelect,
  });

  if (!business) {
    throw new AppError("Business not found", 404);
  }

  return business;
}

export async function setBusinessLogo(
  businessId: string,
  logoUrl: string,
) {
  const result = await prisma.business.updateMany({
    where: {
      id: businessId,
    },
    data: {
      logoUrl,
    },
  });

  if (result.count === 0) {
    throw new AppError("Business not found", 404);
  }

  return getBusinessBranding(businessId);
}

export async function clearBusinessLogo(
  businessId: string,
) {
  const result = await prisma.business.updateMany({
    where: {
      id: businessId,
    },
    data: {
      logoUrl: null,
    },
  });

  if (result.count === 0) {
    throw new AppError("Business not found", 404);
  }

  return getBusinessBranding(businessId);
}

export async function updateBusinessBranding(
  businessId: string,
  data: UpdateBusinessBrandingData,
) {
  const patch: Prisma.BusinessUpdateManyMutationInput = {};

  if (data.receiptPrimaryColor !== undefined) {
    patch.receiptPrimaryColor = data.receiptPrimaryColor;
  }

  if (data.receiptAccentColor !== undefined) {
    patch.receiptAccentColor = data.receiptAccentColor;
  }

  if (data.receiptBackgroundColor !== undefined) {
    patch.receiptBackgroundColor = data.receiptBackgroundColor;
  }

  if (data.receiptTextColor !== undefined) {
    patch.receiptTextColor = data.receiptTextColor;
  }

  if (data.receiptHeaderStyle !== undefined) {
    patch.receiptHeaderStyle = data.receiptHeaderStyle;
  }

  const result = await prisma.business.updateMany({
    where: {
      id: businessId,
    },
    data: patch,
  });

  if (result.count === 0) {
    throw new AppError("Business not found", 404);
  }

  return getBusinessBranding(businessId);
}
