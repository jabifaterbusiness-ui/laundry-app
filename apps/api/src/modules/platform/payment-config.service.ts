import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import type {
  PaymentMethodInput,
  PaymentProviderInput,
} from "./payment-config.validation.js";

const PLATFORM_CONFIG_ID = "00000000-0000-4000-8000-000000000001";

function normalizeCodes(values: string[]) {
  return values.map((value) => value.trim().toUpperCase());
}

export async function listPaymentProviders() {
  return prisma.paymentProviderConfig.findMany({
    where: { platformConfigId: PLATFORM_CONFIG_ID },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
  });
}

export async function upsertPaymentProvider(
  input: PaymentProviderInput,
  actorUserId: string,
  correlationId?: string | null,
) {
  const providerKey = input.providerKey.trim();
  const supportedCountries = normalizeCodes(input.supportedCountries);
  const supportedCurrencies = normalizeCodes(input.supportedCurrencies);

  const provider = await prisma.paymentProviderConfig.upsert({
    where: {
      platformConfigId_providerKey: {
        platformConfigId: PLATFORM_CONFIG_ID,
        providerKey,
      },
    },
    create: {
      platformConfigId: PLATFORM_CONFIG_ID,
      providerKey,
      displayName: input.displayName.trim(),
      enabled: input.enabled ?? false,
      supportedCountries,
      supportedCurrencies,
      supportedMethods: input.supportedMethods,
      displayOrder: input.displayOrder ?? 0,
    },
    update: {
      displayName: input.displayName.trim(),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      supportedCountries,
      supportedCurrencies,
      supportedMethods: input.supportedMethods,
      ...(input.displayOrder !== undefined
        ? { displayOrder: input.displayOrder }
        : {}),
    },
  });

  await recordAuditEvent({
    action: "payment.provider.updated",
    entityType: "PaymentProviderConfig",
    entityId: provider.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      providerKey: provider.providerKey,
      displayName: provider.displayName,
      enabled: provider.enabled,
      supportedCountries: provider.supportedCountries,
      supportedCurrencies: provider.supportedCurrencies,
      supportedMethods: provider.supportedMethods,
      displayOrder: provider.displayOrder,
    },
  });

  return provider;
}

export async function setPaymentProviderActive(
  id: string,
  enabled: boolean,
  actorUserId: string,
  correlationId?: string | null,
) {
  const existing = await prisma.paymentProviderConfig.findFirst({
    where: { id, platformConfigId: PLATFORM_CONFIG_ID },
  });

  if (!existing) {
    throw new AppError("Payment provider not found", 404);
  }

  const provider = await prisma.paymentProviderConfig.update({
    where: { id },
    data: { enabled },
  });

  await recordAuditEvent({
    action: "payment.provider.status_updated",
    entityType: "PaymentProviderConfig",
    entityId: provider.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      providerKey: provider.providerKey,
      previousEnabled: existing.enabled,
      enabled: provider.enabled,
    },
  });

  return provider;
}

export async function removePaymentProvider(
  id: string,
  actorUserId: string,
  correlationId?: string | null,
) {
  const existing = await prisma.paymentProviderConfig.findFirst({
    where: { id, platformConfigId: PLATFORM_CONFIG_ID },
  });

  if (!existing) {
    throw new AppError("Payment provider not found", 404);
  }

  const linkedMethods = await prisma.paymentMethodConfig.count({
    where: {
      platformConfigId: PLATFORM_CONFIG_ID,
      providerKey: existing.providerKey,
    },
  });

  if (linkedMethods > 0) {
    throw new AppError(
      "Payment provider cannot be removed while payment methods are linked to it",
      409,
    );
  }

  await prisma.paymentProviderConfig.delete({ where: { id } });

  await recordAuditEvent({
    action: "payment.provider.removed",
    entityType: "PaymentProviderConfig",
    entityId: existing.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      providerKey: existing.providerKey,
      displayName: existing.displayName,
    },
  });

  return { id: existing.id, removed: true };
}

export async function listPaymentMethods() {
  return prisma.paymentMethodConfig.findMany({
    where: { platformConfigId: PLATFORM_CONFIG_ID },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
  });
}

export async function upsertPaymentMethod(
  input: PaymentMethodInput,
  actorUserId: string,
  correlationId?: string | null,
) {
  const methodKey = input.methodKey.trim();
  const providerKey = input.providerKey?.trim() || null;

  if (providerKey) {
    const provider = await prisma.paymentProviderConfig.findFirst({
      where: {
        platformConfigId: PLATFORM_CONFIG_ID,
        providerKey,
      },
    });

    if (!provider) {
      throw new AppError("Payment provider not found", 404);
    }
  }

  const supportedCountries = normalizeCodes(input.supportedCountries);
  const supportedCurrencies = normalizeCodes(input.supportedCurrencies);

  const method = await prisma.paymentMethodConfig.upsert({
    where: {
      platformConfigId_methodKey: {
        platformConfigId: PLATFORM_CONFIG_ID,
        methodKey,
      },
    },
    create: {
      platformConfigId: PLATFORM_CONFIG_ID,
      methodKey,
      displayName: input.displayName.trim(),
      providerKey,
      enabled: input.enabled ?? false,
      supportedCountries,
      supportedCurrencies,
      displayOrder: input.displayOrder ?? 0,
    },
    update: {
      displayName: input.displayName.trim(),
      providerKey,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      supportedCountries,
      supportedCurrencies,
      ...(input.displayOrder !== undefined
        ? { displayOrder: input.displayOrder }
        : {}),
    },
  });

  await recordAuditEvent({
    action: "payment.method.updated",
    entityType: "PaymentMethodConfig",
    entityId: method.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      methodKey: method.methodKey,
      displayName: method.displayName,
      providerKey: method.providerKey,
      enabled: method.enabled,
      supportedCountries: method.supportedCountries,
      supportedCurrencies: method.supportedCurrencies,
      displayOrder: method.displayOrder,
    },
  });

  return method;
}

export async function setPaymentMethodActive(
  id: string,
  enabled: boolean,
  actorUserId: string,
  correlationId?: string | null,
) {
  const existing = await prisma.paymentMethodConfig.findFirst({
    where: { id, platformConfigId: PLATFORM_CONFIG_ID },
  });

  if (!existing) {
    throw new AppError("Payment method not found", 404);
  }

  const method = await prisma.paymentMethodConfig.update({
    where: { id },
    data: { enabled },
  });

  await recordAuditEvent({
    action: "payment.method.status_updated",
    entityType: "PaymentMethodConfig",
    entityId: method.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      methodKey: method.methodKey,
      previousEnabled: existing.enabled,
      enabled: method.enabled,
    },
  });

  return method;
}

export async function removePaymentMethod(
  id: string,
  actorUserId: string,
  correlationId?: string | null,
) {
  const existing = await prisma.paymentMethodConfig.findFirst({
    where: { id, platformConfigId: PLATFORM_CONFIG_ID },
  });

  if (!existing) {
    throw new AppError("Payment method not found", 404);
  }

  await prisma.paymentMethodConfig.delete({ where: { id } });

  await recordAuditEvent({
    action: "payment.method.removed",
    entityType: "PaymentMethodConfig",
    entityId: existing.id,
    actorUserId,
    correlationId: correlationId ?? null,
    metadata: {
      methodKey: existing.methodKey,
      displayName: existing.displayName,
      providerKey: existing.providerKey,
    },
  });

  return { id: existing.id, removed: true };
}

export async function validatePaymentSelection(
  countryCode: string,
  currencyCode: string,
  providerKey?: string | null,
  paymentMethodKey?: string | null,
) {
  const normalizedCountry = countryCode.trim().toUpperCase();
  const normalizedCurrency = currencyCode.trim().toUpperCase();

  if (!providerKey && !paymentMethodKey) {
    return { provider: null, method: null };
  }

  if (!providerKey || !paymentMethodKey) {
    throw new AppError(
      "Online subscription payments require both a payment provider and payment method",
      400,
    );
  }

  const [provider, method] = await Promise.all([
    prisma.paymentProviderConfig.findFirst({
      where: {
        platformConfigId: PLATFORM_CONFIG_ID,
        providerKey: providerKey.trim(),
        enabled: true,
      },
    }),
    prisma.paymentMethodConfig.findFirst({
      where: {
        platformConfigId: PLATFORM_CONFIG_ID,
        methodKey: paymentMethodKey.trim(),
        enabled: true,
      },
    }),
  ]);

  if (!provider) {
    throw new AppError("Selected payment provider is unavailable", 400);
  }

  if (!method) {
    throw new AppError("Selected payment method is unavailable", 400);
  }

  const providerCountries = Array.isArray(provider.supportedCountries)
    ? provider.supportedCountries.map((value) => String(value).toUpperCase())
    : [];
  const providerCurrencies = Array.isArray(provider.supportedCurrencies)
    ? provider.supportedCurrencies.map((value) => String(value).toUpperCase())
    : [];
  const providerMethods = Array.isArray(provider.supportedMethods)
    ? provider.supportedMethods.map((value) => String(value))
    : [];

  if (
    !providerCountries.includes(normalizedCountry) ||
    !providerCurrencies.includes(normalizedCurrency)
  ) {
    throw new AppError(
      "Selected payment provider does not support this business country or currency",
      400,
    );
  }

  if (!providerMethods.includes(method.methodKey)) {
    throw new AppError(
      "Selected payment provider does not support the selected payment method",
      400,
    );
  }

  const methodCountries = Array.isArray(method.supportedCountries)
    ? method.supportedCountries.map((value) => String(value).toUpperCase())
    : [];
  const methodCurrencies = Array.isArray(method.supportedCurrencies)
    ? method.supportedCurrencies.map((value) => String(value).toUpperCase())
    : [];

  if (
    !methodCountries.includes(normalizedCountry) ||
    !methodCurrencies.includes(normalizedCurrency)
  ) {
    throw new AppError(
      "Selected payment method does not support this business country or currency",
      400,
    );
  }

  if (method.providerKey && method.providerKey !== provider.providerKey) {
    throw new AppError(
      "Selected payment method is restricted to another payment provider",
      400,
    );
  }

  return { provider, method };
}
