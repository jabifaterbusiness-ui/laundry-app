import { config } from "../../../config/index.js";
import { registerSubscriptionPaymentProvider } from "./payment-provider.registry.js";
import { paystackSubscriptionPaymentProvider } from "./paystack.provider.js";

export function registerConfiguredSubscriptionPaymentProviders() {
  if (config.paymentProviders.paystack.secretKey) {
    registerSubscriptionPaymentProvider(
      paystackSubscriptionPaymentProvider,
    );
  }
}
