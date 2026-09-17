import { AppError } from "../../../middleware/error-handler.js";
import type { SubscriptionPaymentProvider } from "./payment-provider.types.js";

const providers = new Map<string, SubscriptionPaymentProvider>();

export function registerSubscriptionPaymentProvider(
  provider: SubscriptionPaymentProvider,
) {
  providers.set(provider.providerKey, provider);
}

export function getSubscriptionPaymentProvider(providerKey: string) {
  const provider = providers.get(providerKey);

  if (!provider) {
    throw new AppError(
      `Subscription payment provider "${providerKey}" is not configured`,
      400,
    );
  }

  return provider;
}

export function listSubscriptionPaymentProviders() {
  return [...providers.values()];
}
