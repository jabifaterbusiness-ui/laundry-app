import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CustomersPage } from "../../../src/pages/customers/CustomersPage.js";

const mockAuthState = vi.hoisted(() => ({
  user: {
    id: "user-1",
    email: "staff@example.com",
    fullName: "Staff User",
    role: "STAFF" as const,
    securityRole: undefined as "BUSINESS_OWNER" | undefined,
    businessId: "business-1",
    branches: [{ id: "branch-1", name: "Main Branch" }],
  },
  accessToken: "token",
  refreshToken: "refresh",
  activeBranchId: "branch-1",
}));

vi.mock("../../../src/components/auth/SensitiveAuthorizationProvider.js", () => ({
  useSensitiveAuthorization: () => ({
    requestSensitiveAuthorization: vi.fn().mockResolvedValue("sensitive-token"),
  }),
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

vi.mock("../../../src/lib/api-client.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/api-client.js")>(
    "../../../src/lib/api-client.js",
  );
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../../../src/lib/customers-api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/customers-api.js")>(
    "../../../src/lib/customers-api.js",
  );
  return {
    ...actual,
    listCustomers: vi.fn(),
    listLegacyUnassignedCustomers: vi.fn(),
    assignLegacyCustomersOwnerBranch: vi.fn(),
    createCustomerWithOfflineQueue: vi.fn(),
    updateCustomer: vi.fn(),
    updateCustomerWithOfflineQueue: vi.fn(),
  };
});

import { apiFetch } from "../../../src/lib/api-client.js";
import {
  DuplicateCustomerError,
  listCustomers,
  listLegacyUnassignedCustomers,
  assignLegacyCustomersOwnerBranch,
  createCustomerWithOfflineQueue,
  updateCustomer,
  updateCustomerWithOfflineQueue,
} from "../../../src/lib/customers-api.js";

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
  beforeEach(() => {
    mockAuthState.user.securityRole = undefined;
  });

  it("allows the business owner to assign selected legacy customers to one branch", async () => {
    mockAuthState.user.securityRole = "BUSINESS_OWNER";
    vi.mocked(listCustomers).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    });
    vi.mocked(listLegacyUnassignedCustomers).mockResolvedValue({
      data: [{ id: "legacy-1", name: "Legacy Jane", phone: "08000000001", email: null, _count: { orders: 2 } }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    vi.mocked(apiFetch).mockResolvedValue([{ id: "branch-2", name: "Branch Two" }] as never);
    vi.mocked(assignLegacyCustomersOwnerBranch).mockResolvedValue({
      assignedCount: 1,
      branchId: "branch-2",
      branchName: "Branch Two",
      assignmentScope: "SELECTED",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Legacy Jane" }));
    fireEvent.change(screen.getByLabelText("Branch for bulk legacy customer assignment"), {
      target: { value: "branch-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign selected (1)" }));

    await waitFor(() => {
      expect(assignLegacyCustomersOwnerBranch).toHaveBeenCalledWith(
        { branchId: "branch-2", customerIds: ["legacy-1"] },
        { accessToken: "token", sensitiveAuthorization: "sensitive-token" },
      );
    });
  });

  it("allows the business owner to assign every unassigned legacy customer to one branch", async () => {
    mockAuthState.user.securityRole = "BUSINESS_OWNER";
    vi.mocked(listCustomers).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    });
    vi.mocked(listLegacyUnassignedCustomers).mockResolvedValue({
      data: [{ id: "legacy-1", name: "Legacy Jane", phone: "08000000001", email: null, _count: { orders: 2 } }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    vi.mocked(apiFetch).mockResolvedValue([{ id: "branch-2", name: "Branch Two" }] as never);
    vi.mocked(assignLegacyCustomersOwnerBranch).mockResolvedValue({
      assignedCount: 4,
      branchId: "branch-2",
      branchName: "Branch Two",
      assignmentScope: "ALL_UNASSIGNED",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPage();

    await screen.findByText("Legacy Jane");
    fireEvent.change(screen.getByLabelText("Branch for bulk legacy customer assignment"), {
      target: { value: "branch-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign all unassigned customers" }));

    await waitFor(() => {
      expect(assignLegacyCustomersOwnerBranch).toHaveBeenCalledWith(
        { branchId: "branch-2", all: true },
        { accessToken: "token", sensitiveAuthorization: "sensitive-token" },
      );
    });
  });

  it("renders customers once loaded", async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: [{ id: "1", name: "Jane Doe", phone: "5551234567", email: null, address: null, notes: null, ownerBranchId: "branch-1", ownerBranch: { id: "branch-1", name: "Main Branch" }, isActive: true, createdAt: "", updatedAt: "" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Business-wide legacy")).not.toBeInTheDocument();
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



  it("reports a customer create as saved offline when the queue-aware mutation queues it", async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    });

    vi.mocked(createCustomerWithOfflineQueue).mockResolvedValue({
      queued: true,
      operation: {
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
        clientOperationId: "client-op-1",
        operationType: "CUSTOMER_CREATE",
        payloadVersion: 1,
        payload: {},
        correlationId: null,
        status: "PENDING",
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        id: 1,
      },
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /new customer/i }));

    fireEvent.change(await screen.findByLabelText(/name/i), {
      target: { value: "Offline Customer" },
    });
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: "08012345678" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent(/saved offline/i);

    expect(vi.mocked(createCustomerWithOfflineQueue)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Offline Customer",
        phone: "08012345678",
      }),
      { accessToken: "token", branchId: "branch-1" },
      {
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
      },
    );
  });

  it("reports a customer update as saved offline when the queue-aware mutation queues it", async () => {
    vi.mocked(listCustomers).mockResolvedValue({
      data: [
        {
          id: "customer-1",
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

    vi.mocked(updateCustomerWithOfflineQueue).mockResolvedValue({
      queued: true,
      operation: {
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
        clientOperationId: "client-op-2",
        operationType: "CUSTOMER_UPDATE",
        payloadVersion: 1,
        payload: {},
        correlationId: null,
        status: "PENDING",
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        id: 2,
      },
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    const nameInput = await screen.findByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "Jane Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/update saved offline/i);

    expect(vi.mocked(updateCustomerWithOfflineQueue)).toHaveBeenCalledWith(
      "customer-1",
      expect.objectContaining({
        name: "Jane Updated",
      }),
      { accessToken: "token", branchId: "branch-1", sensitiveAuthorization: "sensitive-token" },
      {
        businessId: "business-1",
        branchId: "branch-1",
        actorUserId: "user-1",
      },
    );
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

    vi.mocked(updateCustomerWithOfflineQueue).mockImplementation(
      async (id, input, auth) => ({
        queued: false,
        customer: await updateCustomer(id, input, auth),
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    const phoneInput = await screen.findByLabelText(/phone/i);
    fireEvent.change(phoneInput, { target: { value: "555-999-8888" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/john doe/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save anyway/i }));

    await waitFor(() => expect(vi.mocked(updateCustomer)).toHaveBeenCalledTimes(2));

    expect(vi.mocked(updateCustomer).mock.calls[1][1]).toMatchObject({
      phone: "555-999-8888",
      confirmDuplicate: true,
    });
  });
});
