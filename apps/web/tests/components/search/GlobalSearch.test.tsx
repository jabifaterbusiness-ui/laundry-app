import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("keeps order matches out of suggestions and opens the exact match on Enter", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "ORDER", id: "order-42", title: "Order #00042",
      subtitle: "Ada Laundry · RECEIVED", href: "/orders?orderId=order-42",
    }]);
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("textbox", { name: "Global search" }), { target: { value: "00042" } });

    expect(await screen.findByText("Matching order found. Press Enter to open Order Management.")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Order #00042/ })).not.toBeInTheDocument();
    await waitFor(() => expect(globalSearchMock).toHaveBeenCalledWith(
      { q: "00042", limit: 10 }, { accessToken: "access-token" }, "branch-main",
    ));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Global search" }), { key: "Enter" });
    expect(navigateMock).toHaveBeenCalledWith("/order-management?orderId=order-42");
    expect(screen.getByRole("textbox", { name: "Global search" })).toHaveValue("");
  });

  it("offers customer creation and carries a phone-like query into the new customer flow", async () => {
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("textbox", { name: "Global search" }), { target: { value: "08012345678" } });
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
    fireEvent.change(screen.getByRole("textbox", { name: "Global search" }), { target: { value: "manual cloud backup" } });
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
    fireEvent.change(screen.getByRole("textbox", { name: "Global search" }), {
      target: { value: "manual cloud backup" },
    });

    await screen.findByText("No results found.");
    expect(screen.queryByText("MCB")).not.toBeInTheDocument();
  });

  it("clears the search query when the current route changes", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "CUSTOMER", id: "customer-1", title: "Ada Laundry",
      subtitle: "08012345678", href: "/orders?customerId=customer-1",
    }]);
    const { rerender } = render(<GlobalSearch />);
    const input = screen.getByRole("textbox", { name: "Global search" });
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
    const input = screen.getByRole("textbox", { name: "Global search" });
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
    const input = screen.getByRole("textbox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "Ada" } });
    expect(await screen.findByRole("option", { name: /Ada Laundry/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
