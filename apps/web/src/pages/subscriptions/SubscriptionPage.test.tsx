import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubscriptionPaymentIntent,
  getSubscription,
  getSubscriptionPaymentOptions,
  getSubscriptionPrices,
  initializeSubscriptionPayment,
} from "../../lib/subscriptions-api.js";
import {
  cacheSubscriptionBillingConfig,
  enqueueOfflineSubscriptionPayment,
  getCachedSubscriptionBillingConfig,
  getOfflineSubscriptionPaymentByIntent,
  listOfflineSubscriptionPayments,
  updateOfflineSubscriptionPayment,
} from "../../lib/offline-subscription-payment-queue.js";
import { SubscriptionPage } from "./SubscriptionPage.js";

vi.mock("../../lib/subscriptions-api.js", () => ({
  createSubscriptionPaymentIntent: vi.fn(),
  getSubscription: vi.fn(),
  getSubscriptionPaymentOptions: vi.fn(),
  getSubscriptionPrices: vi.fn(),
  initializeSubscriptionPayment: vi.fn(),
  verifySubscriptionPayment: vi.fn(),
}));


vi.mock("../../lib/offline-subscription-payment-queue.js", () => ({
  cacheSubscriptionBillingConfig: vi.fn(),
  enqueueOfflineSubscriptionPayment: vi.fn(),
  getCachedSubscriptionBillingConfig: vi.fn(),
  getOfflineSubscriptionPaymentByIntent: vi.fn(),
  listOfflineSubscriptionPayments: vi.fn(),
  updateOfflineSubscriptionPayment: vi.fn(),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    user: {
      id: string;
      businessId: string;
      fullName: string;
      role: string;
    };
    accessToken: string;
  }) => unknown) =>
    selector({
      user: {
        id: "owner-1",
        businessId: "business-1",
        fullName: "Jane Owner",
        role: "BUSINESS_OWNER",
      },
      accessToken: "token",
    }),
}));

const mockedGetSubscription = vi.mocked(getSubscription);
const mockedGetSubscriptionPrices = vi.mocked(getSubscriptionPrices);
const mockedGetSubscriptionPaymentOptions = vi.mocked(
  getSubscriptionPaymentOptions,
);
const mockedCreateSubscriptionPaymentIntent = vi.mocked(
  createSubscriptionPaymentIntent,
);
const mockedInitializeSubscriptionPayment = vi.mocked(
  initializeSubscriptionPayment,
);
const mockedCacheBillingConfig = vi.mocked(cacheSubscriptionBillingConfig);
const mockedEnqueueOfflineSubscriptionPayment = vi.mocked(
  enqueueOfflineSubscriptionPayment,
);
const mockedGetCachedBillingConfig = vi.mocked(getCachedSubscriptionBillingConfig);
const mockedGetOfflinePaymentByIntent = vi.mocked(
  getOfflineSubscriptionPaymentByIntent,
);
const mockedListOfflineSubscriptionPayments = vi.mocked(
  listOfflineSubscriptionPayments,
);
const mockedUpdateOfflineSubscriptionPayment = vi.mocked(
  updateOfflineSubscriptionPayment,
);

const subscription = {
  id: "sub-1",
  businessId: "business-1",
  plan: "MONTHLY" as const,
  status: "ACTIVE" as const,
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const prices = {
  countryCode: "NG",
  currencyCode: "NGN",
  prices: [
    {
      id: "1",
      plan: "WEEKLY" as const,
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 2500,
      isActive: true,
    },
    {
      id: "2",
      plan: "MONTHLY" as const,
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 8000,
      isActive: true,
    },
    {
      id: "3",
      plan: "QUARTERLY" as const,
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 22000,
      isActive: true,
    },
    {
      id: "4",
      plan: "YEARLY" as const,
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 80000,
      isActive: true,
    },
  ],
};

const paymentOptions = {
  countryCode: "NG",
  currencyCode: "NGN",
  providers: [
    {
      providerKey: "paystack",
      displayName: "Paystack",
    },
  ],
  methods: [
    {
      methodKey: "CARD",
      displayName: "Card",
      providerKey: "paystack",
    },
    {
      methodKey: "BANK_TRANSFER",
      displayName: "Bank transfer",
      providerKey: "paystack",
    },
  ],
};

const paymentIntent = {
  id: "00000000-0000-4000-8000-000000000010",
  businessId: "business-1",
  plan: "MONTHLY" as const,
  amount: 8000,
  currencyCode: "NGN",
  paymentReference: "LA-PAY-TEST-123",
  idempotencyKey: "12345678-1234-4234-8234-123456789012",
  origin: "ONLINE" as const,
  status: "CREATED" as const,
  providerKey: "paystack",
  paymentMethodKey: "CARD",
  providerCheckoutReference: null,
  providerCheckoutUrl: null,
  expiresAt: null,
  createdAt: "2026-09-17T10:00:00.000Z",
  updatedAt: "2026-09-17T10:00:00.000Z",
};

const initializedPaymentIntent = {
  ...paymentIntent,
  status: "PENDING" as const,
  providerCheckoutReference: "checkout-123",
  providerCheckoutUrl: "https://example.com/checkout/123",
};

function renderSubscription() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SubscriptionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedGetSubscription.mockResolvedValue(subscription);
  mockedGetSubscriptionPrices.mockResolvedValue(prices);
  mockedGetSubscriptionPaymentOptions.mockResolvedValue(paymentOptions);
  mockedCreateSubscriptionPaymentIntent.mockResolvedValue(paymentIntent);
  mockedInitializeSubscriptionPayment.mockResolvedValue(
    initializedPaymentIntent,
  );
  mockedCacheBillingConfig.mockResolvedValue(undefined);
  mockedGetCachedBillingConfig.mockResolvedValue(undefined);
  mockedGetOfflinePaymentByIntent.mockResolvedValue(undefined);
  mockedListOfflineSubscriptionPayments.mockResolvedValue([]);
  mockedUpdateOfflineSubscriptionPayment.mockResolvedValue(undefined);
  mockedEnqueueOfflineSubscriptionPayment.mockResolvedValue({
    id: 1,
    businessId: "business-1",
    actorUserId: "owner-1",
    plan: "MONTHLY",
    amount: 8000,
    currencyCode: "NGN",
    providerKey: "paystack",
    paymentMethodKey: "CARD",
    idempotencyKey: "offline-idempotency-12345678",
    status: "PENDING",
    intentId: null,
    paymentReference: null,
    providerCheckoutUrl: null,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
  });
});

describe("SubscriptionPage", () => {
  it("renders the current subscription and configured prices", async () => {
    renderSubscription();

    expect(
      await screen.findByRole("heading", { name: "Monthly" }),
    ).toBeInTheDocument();
    expect(screen.getByText("NGN 2,500")).toBeInTheDocument();
    expect(screen.getByText("NGN 8,000")).toBeInTheDocument();
    expect(screen.getByText("NGN 22,000")).toBeInTheDocument();
    expect(screen.getByText("NGN 80,000")).toBeInTheDocument();

    expect(mockedGetSubscriptionPrices).toHaveBeenCalledWith("token");
    expect(mockedGetSubscriptionPaymentOptions).toHaveBeenCalledWith("token");
  });

  it("disables a plan when its authoritative price is missing", async () => {
    mockedGetSubscriptionPrices.mockResolvedValue({
      ...prices,
      prices: prices.prices.filter((price) => price.plan !== "YEARLY"),
    });

    renderSubscription();

    expect(await screen.findByText("Price not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yearly subscription plan" })).toBeDisabled();
  });

  it("keeps configured plans enabled after payment selection", async () => {
    renderSubscription();

    expect(await screen.findByText("NGN 8,000")).toBeInTheDocument();

    const providerSelect = screen.getByLabelText("Payment provider");
    const methodSelect = screen.getByLabelText("Payment method");

    await waitFor(() => {
      expect(providerSelect).toBeEnabled();
      expect(methodSelect).toBeDisabled();
    });

    fireEvent.change(providerSelect, {
      target: { value: "paystack" },
    });

    await waitFor(() => {
      expect(methodSelect).toBeEnabled();
    });

    fireEvent.change(methodSelect, {
      target: { value: "CARD" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Weekly subscription plan" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Monthly subscription plan" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Quarterly subscription plan" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Yearly subscription plan" })).toBeEnabled();
    });
  });


  it("queues a configured plan for offline payment", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    renderSubscription();

    const providerSelect = await screen.findByLabelText("Payment provider");
    const methodSelect = screen.getByLabelText("Payment method");

    fireEvent.change(providerSelect, {
      target: { value: "paystack" },
    });

    await waitFor(() => {
      expect(methodSelect).toBeEnabled();
    });

    fireEvent.change(methodSelect, {
      target: { value: "CARD" },
    });

    const offlineButton = await screen.findByRole("button", {
      name: "Save Monthly payment offline",
    });

    await waitFor(() => {
      expect(offlineButton).toBeEnabled();
    });

    fireEvent.click(offlineButton);

    await waitFor(() => {
      expect(mockedEnqueueOfflineSubscriptionPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: "business-1",
          actorUserId: "owner-1",
          plan: "MONTHLY",
          amount: 8000,
          currencyCode: "NGN",
          providerKey: "paystack",
          paymentMethodKey: "CARD",
        }),
      );
    });

    expect(
      screen.getByText(/saved securely on this device/i),
    ).toBeInTheDocument();

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("shows a ready offline payment with a secure checkout continuation", async () => {
    const queued = {
      id: 2,
      businessId: "business-1",
      actorUserId: "owner-1",
      plan: "MONTHLY" as const,
      amount: 8000,
      currencyCode: "NGN",
      providerKey: "paystack",
      paymentMethodKey: "CARD",
      idempotencyKey: "offline-ready-12345678",
      status: "READY" as const,
      intentId: paymentIntent.id,
      paymentReference: paymentIntent.paymentReference,
      providerCheckoutUrl: "https://example.com/checkout/offline",
      attemptCount: 1,
      lastAttemptAt: Date.now(),
      lastError: null,
      createdAt: 1,
      updatedAt: 1,
    };

    mockedListOfflineSubscriptionPayments.mockResolvedValue([queued]);

    renderSubscription();

    expect(
      await screen.findByText(/Offline payment queue/i),
    ).toBeInTheDocument();

    const originalLocation = window.location;
    const assignSpy = vi.fn();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        assign: assignSpy,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Continue payment" }),
    );

    expect(assignSpy).toHaveBeenCalledWith(
      "https://example.com/checkout/offline",
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("creates and initializes a payment when a configured plan is selected", async () => {
    renderSubscription();

    const providerSelect = await screen.findByLabelText("Payment provider");
    const methodSelect = screen.getByLabelText("Payment method");

    fireEvent.change(providerSelect, {
      target: { value: "paystack" },
    });

    await waitFor(() => {
      expect(methodSelect).toBeEnabled();
    });

    fireEvent.change(methodSelect, {
      target: { value: "CARD" },
    });

    const monthlyButton = await screen.findByRole("button", { name: "Monthly subscription plan" });

    await waitFor(() => {
      expect(monthlyButton).toBeEnabled();
    });

    const originalLocation = window.location;
    const assignSpy = vi.fn();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        assign: assignSpy,
      },
    });

    fireEvent.click(monthlyButton);

    await waitFor(() => {
      expect(mockedCreateSubscriptionPaymentIntent).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({
          plan: "MONTHLY",
          origin: "ONLINE",
          providerKey: "paystack",
          paymentMethodKey: "CARD",
        }),
      );
    });

    await waitFor(() => {
      expect(mockedInitializeSubscriptionPayment).toHaveBeenCalledWith(
        "token",
        paymentIntent.id,
      );
    });

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        "https://example.com/checkout/123",
      );
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
