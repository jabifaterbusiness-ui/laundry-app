import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrRenewSubscription,
  getSubscription,
  getSubscriptionPrices,
} from "../../lib/subscriptions-api.js";
import { SubscriptionPage } from "./SubscriptionPage.js";

vi.mock("../../lib/subscriptions-api.js", () => ({
  createOrRenewSubscription: vi.fn(),
  getSubscription: vi.fn(),
  getSubscriptionPrices: vi.fn(),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    user: { fullName: string; role: string };
    accessToken: string;
  }) => unknown) =>
    selector({
      user: { fullName: "Jane Owner", role: "BUSINESS_OWNER" },
      accessToken: "token",
    }),
}));

const mockedGetSubscription = vi.mocked(getSubscription);
const mockedGetSubscriptionPrices = vi.mocked(getSubscriptionPrices);
const mockedCreateOrRenewSubscription = vi.mocked(createOrRenewSubscription);

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
    { id: "1", plan: "WEEKLY" as const, countryCode: "NG", currencyCode: "NGN", amount: 2500, isActive: true },
    { id: "2", plan: "MONTHLY" as const, countryCode: "NG", currencyCode: "NGN", amount: 8000, isActive: true },
    { id: "3", plan: "QUARTERLY" as const, countryCode: "NG", currencyCode: "NGN", amount: 22000, isActive: true },
    { id: "4", plan: "YEARLY" as const, countryCode: "NG", currencyCode: "NGN", amount: 80000, isActive: true },
  ],
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
  mockedCreateOrRenewSubscription.mockResolvedValue(subscription);
});

describe("SubscriptionPage", () => {
  it("renders the current subscription and configured prices", async () => {
    renderSubscription();

    expect(await screen.findByRole("heading", { name: "Monthly" })).toBeInTheDocument();
    expect(screen.getByText("NGN 2,500")).toBeInTheDocument();
    expect(screen.getByText("NGN 8,000")).toBeInTheDocument();
    expect(screen.getByText("NGN 22,000")).toBeInTheDocument();
    expect(screen.getByText("NGN 80,000")).toBeInTheDocument();
    expect(mockedGetSubscriptionPrices).toHaveBeenCalledWith("token");
  });

  it("disables a plan when its authoritative price is missing", async () => {
    mockedGetSubscriptionPrices.mockResolvedValue({
      ...prices,
      prices: prices.prices.filter((price) => price.plan !== "YEARLY"),
    });

    renderSubscription();

    expect(await screen.findByText("Price not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yearly/i })).toBeDisabled();
  });

  it("keeps configured plans enabled", async () => {
    renderSubscription();

    expect(await screen.findByText("NGN 8,000")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Weekly/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Monthly/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Quarterly/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Yearly/i })).toBeEnabled();
  });
});
