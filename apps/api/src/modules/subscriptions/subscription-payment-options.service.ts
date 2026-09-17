import { prisma } from "../../lib/prisma.js";

const PLATFORM_CONFIG_ID = "00000000-0000-4000-8000-000000000001";

function normalizedList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim().toUpperCase())
    : [];
}

export async function getSubscriptionPaymentOptions(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      countryCode: true,
      currencyCode: true,
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const countryCode = business.countryCode.trim().toUpperCase();
  const currencyCode = business.currencyCode.trim().toUpperCase();

  const [configuredProviders, configuredMethods] = await Promise.all([
    prisma.paymentProviderConfig.findMany({
      where: {
        platformConfigId: PLATFORM_CONFIG_ID,
        enabled: true,
      },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    }),
    prisma.paymentMethodConfig.findMany({
      where: {
        platformConfigId: PLATFORM_CONFIG_ID,
        enabled: true,
      },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    }),
  ]);

  const providers = configuredProviders.filter((provider) => {
    const countries = normalizedList(provider.supportedCountries);
    const currencies = normalizedList(provider.supportedCurrencies);

    return countries.includes(countryCode) && currencies.includes(currencyCode);
  });

  const providerByKey = new Map(
    providers.map((provider) => [provider.providerKey, provider]),
  );

  const methods = configuredMethods.filter((method) => {
    const countries = normalizedList(method.supportedCountries);
    const currencies = normalizedList(method.supportedCurrencies);

    if (!countries.includes(countryCode) || !currencies.includes(currencyCode)) {
      return false;
    }

    if (!method.providerKey) {
      return true;
    }

    const provider = providerByKey.get(method.providerKey);
    if (!provider) {
      return false;
    }

    const providerMethods = normalizedList(provider.supportedMethods);
    return providerMethods.includes(method.methodKey.trim().toUpperCase());
  });

  return {
    countryCode,
    currencyCode,
    providers: providers.map((provider) => ({
      providerKey: provider.providerKey,
      displayName: provider.displayName,
    })),
    methods: methods.map((method) => ({
      methodKey: method.methodKey,
      displayName: method.displayName,
      providerKey: method.providerKey,
    })),
  };
}
