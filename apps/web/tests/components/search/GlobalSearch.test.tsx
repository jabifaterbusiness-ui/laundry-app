import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "../../../src/components/search/GlobalSearch.js";

const { globalSearchMock, navigateMock, hasPermissionMock, searchQuickOperationsMock, locationState } = vi.hoisted(() => ({
  globalSearchMock: vi.fn(),
  navigateMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  searchQuickOperationsMock: vi.fn(),
  locationState: { key: "location-1", pathname: "/dashboard", search: "", hash: "" },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => locationState,
}));
vi.mock("../../../src/lib/search-api.js", () => ({ globalSearch: globalSearchMock }));
vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    accessToken: "access-token",
    activeBranchId: "branch-main",
    user: { id: "user-1", permissions: ["customers.create"] },
  }),
}));
vi.mock("../../../src/lib/permissions.js", () => ({ hasPermission: hasPermissionMock }));
vi.mock("../../../src/lib/quick-operations-catalog.js", () => ({ searchQuickOperations: searchQuickOperationsMock }));

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalSearchMock.mockResolvedValue([]);
    hasPermissionMock.mockReturnValue(true);
    searchQuickOperationsMock.mockReturnValue([]);
  });

  it("shows order matches in suggestions and opens the exact order selected", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "ORDER", id: "order-42", title: "Order #00042",
      subtitle: "Ada Laundry · RECEIVED", href: "/orders?orderId=order-42",
    }]);
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Global search" }), { target: { value: "00042" } });

    expect(await screen.findByRole("option", { name: /Order #00042/ })).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    await waitFor(() => expect(globalSearchMock).toHaveBeenCalledWith(
      { q: "00042", limit: 10 }, { accessToken: "access-token" }, "branch-main",
    ));
    fireEvent.click(screen.getByRole("option", { name: /Order #00042/ }));
    expect(navigateMock).toHaveBeenCalledWith("/order-management?orderId=order-42");
    expect(screen.getByRole("searchbox", { name: "Global search" })).toHaveValue("");
  });

  it("shows customer, order, and invoice results separately when identifiers overlap", async () => {
    globalSearchMock.mockResolvedValue([
      { type: "CUSTOMER", id: "customer-1", title: "Adam", subtitle: "08012345678", href: "/orders?customerId=customer-1" },
      { type: "ORDER", id: "order-1", title: "Order #00022", subtitle: "Adam · RECEIVED", href: "/orders?orderId=order-1" },
      { type: "INVOICE", id: "invoice-1", title: "Invoice #00022", subtitle: "Adam · ISSUED", href: "/invoices?invoiceId=invoice-1" },
    ]);
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "00022" } });

    const customer = await screen.findByRole("option", { name: /Adam/ });
    const order = screen.getByRole("option", { name: /Order #00022/ });
    const invoice = screen.getByRole("option", { name: /Invoice #00022/ });
    expect(customer).toBeInTheDocument();
    expect(order).toBeInTheDocument();
    expect(invoice).toBeInTheDocument();

    fireEvent.click(invoice);
    expect(navigateMock).toHaveBeenCalledWith("/invoices?invoiceId=invoice-1");
  });

  it("opens the order when Enter is pressed before the debounced search finishes", async () => {
    let resolveSearch!: (results: Array<{
      type: "ORDER";
      id: string;
      title: string;
      subtitle: string;
      href: string;
    }>) => void;
    globalSearchMock.mockReturnValue(
      new Promise((resolve) => { resolveSearch = resolve; }),
    );

    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "00005" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(globalSearchMock).toHaveBeenCalled());
    resolveSearch([{
      type: "ORDER",
      id: "order-5",
      title: "Order #00005",
      subtitle: "Aaron Daniel · RECEIVED",
      href: "/orders?orderId=order-5",
    }]);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/order-management?orderId=order-5");
    });
  });

  it("chooses the exact order number when broader matches are also returned", async () => {
    globalSearchMock.mockResolvedValue([
      {
        type: "ORDER", id: "order-100005", title: "Order #100005",
        subtitle: "Other Customer · RECEIVED", href: "/orders?orderId=order-100005",
      },
      {
        type: "ORDER", id: "order-5", title: "Order #00005",
        subtitle: "Aaron Daniel · RECEIVED", href: "/orders?orderId=order-5",
      },
    ]);

    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "00005" } });
    await screen.findByRole("option", { name: /Order #00005/ });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(navigateMock).toHaveBeenCalledWith("/order-management?orderId=order-5");
  });

  it("does not open a different order when the order number is only a partial match", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "ORDER", id: "order-100005", title: "Order #100005",
      subtitle: "Other Customer · RECEIVED", href: "/orders?orderId=order-100005",
    }]);

    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "00005" } });

    expect(await screen.findByText("Order #100005")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Global search" })).toHaveValue("00005");
    expect(screen.queryByRole("option", { name: /Add New Customer/ })).not.toBeInTheDocument();
  });

  it("offers customer creation and carries a phone-like query into the new customer flow", async () => {
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Global search" }), { target: { value: "08012345678" } });
    fireEvent.click(await screen.findByRole("option", { name: /Add New Customer/ }));
    expect(navigateMock).toHaveBeenCalledWith("/orders?addCustomer=1&customerPhone=08012345678");
  });

  it("dispatches the selected quick operation without navigating", async () => {
    const operation = {
      code: "MCB", name: "Manual Cloud Backup", description: "Create an encrypted cloud backup.",
      permission: "migrations.manage", requiresConfirmation: false, sensitive: false,
    };
    searchQuickOperationsMock.mockReturnValue([operation]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Global search" }), { target: { value: "manual cloud backup" } });
    fireEvent.click(await screen.findByRole("option", { name: /MCB Manual Cloud Backup/ }));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "quick-operation:open", detail: operation }));
    expect(navigateMock).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("does not offer quick operations the current user is not permitted to run", async () => {
    const operation = {
      code: "MCB", name: "Manual Cloud Backup", description: "Create an encrypted cloud backup.",
      permission: "migrations.manage", requiresConfirmation: false, sensitive: false,
    };
    searchQuickOperationsMock.mockReturnValue([operation]);
    hasPermissionMock.mockImplementation((_user: unknown, permission: string) =>
      permission !== "migrations.manage" && permission !== "customers.create",
    );

    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Global search" }), {
      target: { value: "manual cloud backup" },
    });

    await screen.findByText("No results found.");
    expect(screen.queryByText("MCB")).not.toBeInTheDocument();
  });

  it("clears and disables search while sensitive password authorization is open", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "staff@example.com" } });
    expect(input).toHaveValue("staff@example.com");

    act(() => {
      window.dispatchEvent(new Event("sensitive-authorization:started"));
    });
    expect(input).toHaveValue("");
    expect(input).toBeDisabled();

    act(() => {
      window.dispatchEvent(new Event("sensitive-authorization:finished"));
    });
    expect(input).toHaveValue("");
    expect(input).toBeEnabled();
  });

  it("clears the search query when the current route changes", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "CUSTOMER", id: "customer-1", title: "Ada Laundry",
      subtitle: "08012345678", href: "/orders?customerId=customer-1",
    }]);
    const { rerender } = render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "Ada" } });
    expect(await screen.findByRole("option", { name: /Ada Laundry/ })).toBeInTheDocument();

    locationState.key = "location-2";
    locationState.pathname = "/orders";
    rerender(<GlobalSearch />);
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    locationState.key = "location-1";
    locationState.pathname = "/dashboard";
  });

  it("does not restore results from an in-flight search after navigation", async () => {
    let resolveSearch!: (value: Array<{ type: "CUSTOMER"; id: string; title: string; subtitle: string; href: string }>) => void;
    globalSearchMock.mockImplementation(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const { rerender } = render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "private customer" } });
    await waitFor(() => expect(globalSearchMock).toHaveBeenCalledOnce());

    locationState.key = "location-3";
    locationState.pathname = "/reports";
    rerender(<GlobalSearch />);
    await waitFor(() => expect(input).toHaveValue(""));
    resolveSearch([{
      type: "CUSTOMER", id: "customer-private", title: "Private Customer",
      subtitle: "08000000000", href: "/customers/customer-private",
    }]);
    await waitFor(() => expect(screen.queryByText("Private Customer")).not.toBeInTheDocument());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    locationState.key = "location-1";
    locationState.pathname = "/dashboard";
  });

  it("closes the result panel when Escape is pressed", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "CUSTOMER", id: "customer-1", title: "Ada Laundry",
      subtitle: "08012345678", href: "/orders?customerId=customer-1",
    }]);
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "Ada" } });
    expect(await screen.findByRole("option", { name: /Ada Laundry/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
