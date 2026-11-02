import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "../../../src/components/search/GlobalSearch.js";

const { globalSearchMock, navigateMock, hasPermissionMock, searchQuickOperationsMock } = vi.hoisted(() => ({
  globalSearchMock: vi.fn(),
  navigateMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  searchQuickOperationsMock: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
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

  it("searches the active branch and opens the selected order result", async () => {
    globalSearchMock.mockResolvedValue([{
      type: "ORDER", id: "order-42", title: "Order #00042",
      subtitle: "Ada Laundry · RECEIVED", href: "/orders?orderId=order-42",
    }]);
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("textbox", { name: "Global search" }), { target: { value: "00042" } });

    const result = await screen.findByRole("option", { name: /Order #00042/ });
    await waitFor(() => expect(globalSearchMock).toHaveBeenCalledWith(
      { q: "00042", limit: 10 }, { accessToken: "access-token" }, "branch-main",
    ));
    fireEvent.click(result);
    expect(navigateMock).toHaveBeenCalledWith("/orders?orderId=order-42");
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
