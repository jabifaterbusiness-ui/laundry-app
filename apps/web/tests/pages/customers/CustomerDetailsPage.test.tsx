import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CustomerDetailsPage } from "../../../src/pages/customers/CustomerDetailsPage.js";

const mockAuthState = vi.hoisted(() => ({
  accessToken: "token",
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

vi.mock("../../../src/lib/customers-api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/customers-api.js")>(
    "../../../src/lib/customers-api.js",
  );
  return {
    ...actual,
    getCustomer: vi.fn(),
  };
});

import { getCustomer } from "../../../src/lib/customers-api.js";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/customers/customer-1"]}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailsPage />} />
          <Route path="/orders" element={<p>Orders page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CustomerDetailsPage", () => {
  it("loads customer details and provides Add New Order", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: "jane@example.com",
      address: "Abuja",
      notes: "VIP",
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.getByText("08012345678")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add new order/i })).toBeInTheDocument();
  });

  it("opens the order workspace for the displayed customer", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    await screen.findByRole("heading", { name: "Jane Doe" });
    screen.getByRole("button", { name: /add new order/i }).click();

    await waitFor(() => {
      expect(screen.getByText("Orders page")).toBeInTheDocument();
    });
  });
});
