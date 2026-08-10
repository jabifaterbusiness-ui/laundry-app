import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CustomersPage } from "../../../src/pages/customers/CustomersPage.js";

vi.mock("../../../src/lib/customers-api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/customers-api.js")>(
    "../../../src/lib/customers-api.js",
  );
  return { ...actual, listCustomers: vi.fn(), updateCustomer: vi.fn() };
});

import { DuplicateCustomerError, listCustomers, updateCustomer } from "../../../src/lib/customers-api.js";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CustomersPage", () => {
  it("renders customers once loaded", async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: [{ id: "1", name: "Jane Doe", phone: "5551234567", email: null, address: null, notes: null, isActive: true, createdAt: "", updatedAt: "" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows an empty state when there are no customers", async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });

  it("shows an error state when the list request fails", async () => {
    vi.mocked(listCustomers).mockRejectedValue(new Error("network down"));

    renderPage();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("editing a customer's phone to a duplicate shows the confirmation flow, and 'Save anyway' resubmits with confirmDuplicate: true", async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: [
        {
          id: "1",
          name: "Jane Doe",
          phone: "5551234567",
          email: null,
          address: null,
          notes: null,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });

    vi.mocked(updateCustomer).mockRejectedValueOnce(
      new DuplicateCustomerError("A customer with this phone number may already exist.", [
        { id: "2", name: "John Doe", phone: "5559998888" },
      ]),
    );
    vi.mocked(updateCustomer).mockResolvedValueOnce({
      id: "1",
      name: "Jane Doe",
      phone: "5559998888",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    fireEvent.click(await screen.findByText("Jane Doe"));

    const phoneInput = await screen.findByLabelText(/phone/i);
    fireEvent.change(phoneInput, { target: { value: "555-999-8888" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Duplicate warning surfaces the conflicting customer and offers an
    // explicit choice rather than silently overwriting/merging.
    expect(await screen.findByText(/john doe/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save anyway/i }));

    await waitFor(() => expect(vi.mocked(updateCustomer)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateCustomer).mock.calls[1][1]).toMatchObject({
      phone: "555-999-8888",
      confirmDuplicate: true,
    });
  });
});
