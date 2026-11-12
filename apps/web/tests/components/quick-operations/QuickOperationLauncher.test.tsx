import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickOperationLauncher } from "../../../src/components/quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../../src/lib/quick-operations-catalog.js";

const {
  executeQuickOperationMock,
  saveOrderWorkspaceStateMock,
  clearWorkspacesMock,
  listOfflineSyncOperationsMock,
  useIsMutatingMock,
  getCustomerMock,
  listCustomersMock,
  getOrderMock,
  exportBackupMock,
  listCloudBackupConnectionsMock,
  getCloudBackupSettingsMock,
  createCloudBackupRunMock,
  requestSensitiveAuthorizationMock,
  createManualLocalBackupMock,
  publishCloudBackupNotificationMock,
} = vi.hoisted(() => ({
  executeQuickOperationMock: vi.fn(),
  saveOrderWorkspaceStateMock: vi.fn(),
  clearWorkspacesMock: vi.fn(),
  listOfflineSyncOperationsMock: vi.fn(),
  useIsMutatingMock: vi.fn(() => 0),
  getCustomerMock: vi.fn(),
  listCustomersMock: vi.fn(),
  getOrderMock: vi.fn(),
  exportBackupMock: vi.fn(),
  listCloudBackupConnectionsMock: vi.fn(),
  getCloudBackupSettingsMock: vi.fn(),
  createCloudBackupRunMock: vi.fn(),
  requestSensitiveAuthorizationMock: vi.fn().mockResolvedValue("sensitive-auth"),
  createManualLocalBackupMock: vi.fn(),
  publishCloudBackupNotificationMock: vi.fn(),
}));

vi.mock("../../../src/components/data-management/LocalBackupManager.js", () => ({
  createManualLocalBackup: createManualLocalBackupMock,
}));

vi.mock("../../../src/lib/data-management-api.js", () => ({
  exportBackup: exportBackupMock,
  listCloudBackupConnections: listCloudBackupConnectionsMock,
  getCloudBackupSettings: getCloudBackupSettingsMock,
  createCloudBackupRun: createCloudBackupRunMock,
}));

vi.mock("../../../src/components/auth/SensitiveAuthorizationProvider.tsx", () => ({
  useSensitiveAuthorization: () => ({
    requestSensitiveAuthorization: requestSensitiveAuthorizationMock,
  }),
}));

vi.mock("../../../src/lib/cloud-backup-notifications.js", () => ({
  publishCloudBackupNotification: publishCloudBackupNotificationMock,
}));

vi.mock("../../../src/lib/quick-operations-api.js", () => ({
  executeQuickOperation: executeQuickOperationMock,
}));

vi.mock("../../../src/lib/customers-api.js", () => ({
  getCustomer: getCustomerMock,
  listCustomers: listCustomersMock,
}));

vi.mock("../../../src/lib/orders-api.js", () => ({
  getOrder: getOrderMock,
}));

vi.mock("@tanstack/react-query", () => ({
  useIsMutating: useIsMutatingMock,
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    accessToken: string | null;
    activeBranchId: string | null;
    user: {
      id: string;
      businessId: string | null;
      securityRole: string;
    } | null;
  }) => unknown) =>
    selector({
      accessToken: "access-token",
      activeBranchId: "branch-1",
      user: {
        id: "user-1",
        businessId: "business-1",
        securityRole: "BUSINESS_OWNER",
      },
    }),
}));

vi.mock("../../../src/state/order-workspace-store.js", () => ({
  useOrderWorkspaceStore: (
    selector: (state: {
      workspaces: unknown[];
      activeWorkspaceId: string | null;
      clearWorkspaces: () => void;
      openWorkspace: ReturnType<typeof vi.fn>;
      switchWorkspace: ReturnType<typeof vi.fn>;
      updateWorkspace: ReturnType<typeof vi.fn>;
    }) => unknown,
  ) =>
    selector({
      workspaces: [
        {
          id: "workspace-1",
          customer: {
            id: "customer-1",
            name: "Test Customer",
          },
          activeOrder: null,
          draft: {
            customerId: "customer-1",
            lines: [],
            garmentNote: "",
            internalNote: "",
            expectedReadyAt: "",
          },
          updatedAt: 123,
        },
      ],
      activeWorkspaceId: "workspace-1",
      clearWorkspaces: clearWorkspacesMock,
      openWorkspace: vi.fn(),
      switchWorkspace: vi.fn(),
      updateWorkspace: vi.fn(),
    }),
}));

vi.mock("../../../src/lib/order-workspace-persistence.js", () => ({
  saveOrderWorkspaceState: saveOrderWorkspaceStateMock,
}));

vi.mock("../../../src/lib/offline-sync-queue.js", () => ({
  listOfflineSyncOperations: listOfflineSyncOperationsMock,
}));

const operations: Record<string, QuickOperationDefinition> = {
  MCB: {
    code: "MCB",
    name: "Manual Cloud Backup",
    description: "Create an encrypted cloud backup.",
    permission: "migrations.manage",
    requiresConfirmation: false,
    sensitive: false,
  },
  MLB: {
    code: "MLB",
    name: "Manual Local Backup",
    description: "Download an encrypted local backup.",
    permission: "migrations.manage",
    requiresConfirmation: false,
    sensitive: false,
  },
  MU: {
    code: "MU",
    name: "Manual Update",
    description: "Make an authorized manual update.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  TO: {
    code: "TO",
    name: "Transfer Order",
    description: "Transfer an invoice/order to another customer account.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  TC: {
    code: "TC",
    name: "Transfer Customer",
    description: "Transfer a customer to another business account.",
    permission: "customers.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  MC: {
    code: "MC",
    name: "Merge Customer",
    description: "Merge one customer account into another.",
    permission: "customers.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  VO: {
    code: "VO",
    name: "Void Operation",
    description: "Void a supported financial or operational record.",
    permission: "payments.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  RF: {
    code: "RF",
    name: "Refund",
    description: "Refund a supported payment.",
    permission: "payments.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  RI: {
    code: "RI",
    name: "Reprint Invoice / Receipt",
    description: "Reprint an existing invoice or receipt.",
    permission: "invoices.view",
    requiresConfirmation: false,
    sensitive: false,
  },
  RS: {
    code: "RS",
    name: "Resend Receipt",
    description: "Resend an existing digital receipt through a supported delivery channel.",
    permission: "invoices.view",
    requiresConfirmation: true,
    sensitive: false,
  },
  RC: {
    code: "RC",
    name: "Reconcile",
    description: "Run an authorized reconciliation for supported business records.",
    permission: "invoices.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  SI: {
    code: "SI",
    name: "Stock Issue",
    description: "Record an inventory issue against the active branch.",
    permission: "inventory.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  SR: {
    code: "SR",
    name: "Stock Receipt",
    description: "Record an inventory receipt against the active branch.",
    permission: "inventory.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  SO: {
    code: "SO",
    name: "Switch Order",
    description: "Switch the active workspace to another order.",
    permission: "orders.view",
    requiresConfirmation: false,
    sensitive: false,
  },
  SC: {
    code: "SC",
    name: "Switch Customer",
    description: "Switch the active workspace to another customer.",
    permission: "customers.view",
    requiresConfirmation: false,
    sensitive: false,
  },
  SOS: {
    code: "SOS",
    name: "Safe Stop / Safe Exit",
    description:
      "Safely stop the current workflow while protecting unsaved and pending business state.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
  },
};

describe("QuickOperationLauncher", () => {
  beforeEach(() => {
    executeQuickOperationMock.mockReset();
    executeQuickOperationMock.mockResolvedValue({
      code: "TO",
      result: {},
    });

    saveOrderWorkspaceStateMock.mockReset();
    clearWorkspacesMock.mockReset();
    useIsMutatingMock.mockReset();
    useIsMutatingMock.mockReturnValue(0);

    getCustomerMock.mockReset();
    listCustomersMock.mockReset();
    listCustomersMock.mockResolvedValue({
      data: [
        { id: "customer-1", name: "Source Customer", phone: "08000000001", lifecycleStatus: "ACTIVE" },
        { id: "customer-2", name: "Target Customer", phone: "08000000002", lifecycleStatus: "ACTIVE" },
      ],
      pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
    });
    getCustomerMock.mockResolvedValue({
      id: "customer-2",
      name: "Target Customer",
      phone: "08000000000",
      email: null,
      address: null,
      notes: null,
      customerInstructions: null,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });

    getOrderMock.mockReset();
    exportBackupMock.mockReset();
    exportBackupMock.mockResolvedValue(new Blob(["backup"]));
    createManualLocalBackupMock.mockReset();
    createManualLocalBackupMock.mockResolvedValue({
      fileName: "LaundryAngel_Backup_test.laundry-backup",
      destination: "Backups",
    });
    listCloudBackupConnectionsMock.mockReset();
    listCloudBackupConnectionsMock.mockResolvedValue([]);
    getCloudBackupSettingsMock.mockReset();
    getCloudBackupSettingsMock.mockResolvedValue({ destinationConnectionId: null });
    createCloudBackupRunMock.mockReset();
    createCloudBackupRunMock.mockResolvedValue({ id: "run-1", status: "SUCCEEDED" });
    publishCloudBackupNotificationMock.mockReset();
    requestSensitiveAuthorizationMock.mockReset();
    requestSensitiveAuthorizationMock.mockResolvedValue("sensitive-auth");

    getOrderMock.mockResolvedValue({
      id: "order-2",
      businessId: "business-1",
      branchId: "branch-1",
      customerId: "customer-2",
      orderNumber: "00002",
      status: "RECEIVED",
      orderTotal: 10000,
      expectedReadyAt: null,
      readyAt: null,
      completedAt: null,
      cancelledAt: null,
      garmentNote: null,
      internalNote: null,
      items: [],
      createdAt: "",
      updatedAt: "",
    });
  });

  it("requires a strong encryption password for a manual local backup", async () => {
    render(
      <QuickOperationLauncher operation={operations.MLB} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
    expect(exportBackupMock).not.toHaveBeenCalled();
  });

  it("saves a manual local backup using the remembered destination", async () => {
    render(
      <QuickOperationLauncher operation={operations.MLB} onClose={vi.fn()} />,
    );

    fireEvent.change(
      screen.getByLabelText(/backup encryption password/i),
      { target: { value: "a-strong-backup-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(createManualLocalBackupMock).toHaveBeenCalledWith(
        "business-1",
        "a-strong-backup-password",
        { accessToken: "access-token" },
      );
    });
    expect(await screen.findByText(/in Backups/i)).toBeInTheDocument();
  });

  it("starts a manual cloud backup on the verified configured destination", async () => {
    listCloudBackupConnectionsMock.mockResolvedValue([
      {
        id: "connection-1",
        displayName: "Primary cloud",
        status: "CONNECTED",
        verifiedAt: "2026-11-01T00:00:00.000Z",
      },
    ]);
    getCloudBackupSettingsMock.mockResolvedValue({
      destinationConnectionId: "connection-1",
    });

    render(
      <QuickOperationLauncher operation={operations.MCB} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(createCloudBackupRunMock).toHaveBeenCalledWith(
        "connection-1",
        {
          accessToken: "access-token",
          sensitiveAuthorization: "sensitive-auth",
        },
      );
    });
    expect(requestSensitiveAuthorizationMock).toHaveBeenCalledOnce();
    expect(await screen.findByText(/completed successfully/i)).toBeInTheDocument();
  });

  it("does not start a cloud backup when no verified destination is available", async () => {
    listCloudBackupConnectionsMock.mockResolvedValue([
      { id: "connection-unverified", displayName: "Unverified cloud", status: "CONNECTED", verifiedAt: null },
      { id: "connection-disconnected", displayName: "Disconnected cloud", status: "DISCONNECTED", verifiedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    getCloudBackupSettingsMock.mockResolvedValue({ destinationConnectionId: "connection-unverified" });

    render(<QuickOperationLauncher operation={operations.MCB} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(await screen.findByText(/no verified cloud destination is available/i)).toBeInTheDocument();
    expect(requestSensitiveAuthorizationMock).not.toHaveBeenCalled();
    expect(createCloudBackupRunMock).not.toHaveBeenCalled();
  });

  it("does not start a cloud backup when sensitive authorization is cancelled", async () => {
    listCloudBackupConnectionsMock.mockResolvedValue([
      { id: "connection-1", displayName: "Primary cloud", status: "CONNECTED", verifiedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    getCloudBackupSettingsMock.mockResolvedValue({ destinationConnectionId: "connection-1" });
    requestSensitiveAuthorizationMock.mockResolvedValueOnce(null);

    render(<QuickOperationLauncher operation={operations.MCB} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(await screen.findByText(/sensitive authorization was cancelled/i)).toBeInTheDocument();
    expect(createCloudBackupRunMock).not.toHaveBeenCalled();
  });

  it("falls back to the first verified cloud destination when the configured one is unavailable", async () => {
    listCloudBackupConnectionsMock.mockResolvedValue([
      { id: "connection-first", displayName: "Verified fallback", status: "CONNECTED", verifiedAt: "2026-11-01T00:00:00.000Z" },
      { id: "connection-configured", displayName: "Configured but disconnected", status: "DISCONNECTED", verifiedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    getCloudBackupSettingsMock.mockResolvedValue({ destinationConnectionId: "connection-configured" });

    render(<QuickOperationLauncher operation={operations.MCB} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => expect(createCloudBackupRunMock).toHaveBeenCalledWith(
      "connection-first",
      { accessToken: "access-token", sensitiveAuthorization: "sensitive-auth" },
    ));
  });

  it("publishes a single failure notification when a cloud backup run fails", async () => {
    listCloudBackupConnectionsMock.mockResolvedValue([
      { id: "connection-1", displayName: "Primary cloud", status: "CONNECTED", verifiedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    getCloudBackupSettingsMock.mockResolvedValue({ destinationConnectionId: "connection-1" });
    createCloudBackupRunMock.mockResolvedValue({
      id: "run-failed", status: "FAILED", errorMessage: "Cloud upload failed.",
    });

    render(<QuickOperationLauncher operation={operations.MCB} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(await screen.findByText("Cloud upload failed.")).toBeInTheDocument();
    expect(publishCloudBackupNotificationMock).toHaveBeenCalledTimes(2);
    expect(publishCloudBackupNotificationMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      status: "progress", source: "manual",
    }));
    expect(publishCloudBackupNotificationMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      status: "error", message: "Cloud upload failed.", source: "manual",
    }));
  });

  it("renders the selected operation", () => {
    render(
      <QuickOperationLauncher
        operation={operations.TO}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Transfer Order")).toBeInTheDocument();
    expect(screen.getByText("TO")).toBeInTheDocument();
  });

  it("requires confirmation before sensitive execution", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.TO}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Order ID"), {
      target: { value: "order-1" },
    });
    await screen.findByRole("option", { name: /Source Customer/ });
    fireEvent.change(screen.getByLabelText("Target Customer ID"), {
      target: { value: "customer-1" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Safely stopping the current workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText(
        "Please confirm that you want to perform this operation.",
      ),
    ).toBeInTheDocument();

    expect(executeQuickOperationMock).not.toHaveBeenCalled();
  });

  it("executes MU with the correct input after confirmation", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.MU}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Order ID"), {
      target: { value: "order-1" },
    });
    fireEvent.change(screen.getByLabelText("New Order Status"), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Correcting an incorrectly entered order status" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "MU",
          input: {
            orderId: "order-1",
            status: "IN_PROGRESS",
          },
          confirmed: true,
          reason: "Correcting an incorrectly entered order status",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes TI with the correct input after confirmation", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.TO}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Order ID"), {
      target: { value: "order-1" },
    });
    await screen.findByRole("option", { name: /Source Customer/ });
    fireEvent.change(screen.getByLabelText("Target Customer ID"), {
      target: { value: "customer-1" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Invoice was entered on the wrong customer account" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "TI",
          input: {
            orderId: "order-1",
            customerId: "customer-1",
          },
          confirmed: true,
          reason: "Invoice was entered on the wrong customer account",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });

    expect(
      await screen.findByText("Transfer Order completed successfully."),
    ).toBeInTheDocument();
  });

  it("executes TC with source and target customer IDs", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.TC}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Customer ID"), {
      target: { value: "customer-1" },
    });
    fireEvent.change(screen.getByLabelText("Target Customer ID"), {
      target: { value: "customer-2" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Customer account correction requested" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "TC",
          input: {
            customerId: "customer-1",
            targetCustomerId: "customer-2",
          },
          confirmed: true,
          reason: "Customer account correction requested",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes MC with source and target customer IDs", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.MC}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Customer ID"), {
      target: { value: "customer-1" },
    });
    await screen.findByRole("option", { name: /Target Customer/ });
    fireEvent.change(screen.getByLabelText("Target Customer ID"), {
      target: { value: "customer-2" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Customer account correction requested" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "MA",
          input: {
            customerId: "customer-1",
            targetCustomerId: "customer-2",
          },
          confirmed: true,
          reason: "Customer account correction requested",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes VO with the payment ID", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.VO}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Payment ID"), {
      target: { value: "payment-1" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Payment was entered incorrectly" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "VO",
          input: {
            paymentId: "payment-1",
          },
          confirmed: true,
          reason: "Payment was entered incorrectly",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes RF with payment, amount, method, reference and note", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.RF}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Payment ID"), {
      target: { value: "payment-1" },
    });
    fireEvent.change(screen.getByLabelText("Refund Amount"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Refund Method"), {
      target: { value: "TRANSFER" },
    });
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "REF-001" },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Customer refund" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Customer refund approved after payment correction" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "RF",
          input: {
            paymentId: "payment-1",
            amount: 2500,
            method: "TRANSFER",
            reference: "REF-001",
            note: "Customer refund",
          },
          confirmed: true,
          reason: "Customer refund approved after payment correction",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes RI with invoice ID and customer receipt type", async () => {
    executeQuickOperationMock.mockResolvedValueOnce({
      code: "RI",
      result: {
        receiptType: "CUSTOMER",
      },
    });

    render(
      <QuickOperationLauncher
        operation={operations.RI}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Invoice ID"), {
      target: { value: "invoice-1" },
    });
    fireEvent.change(screen.getByLabelText("Receipt Type"), {
      target: { value: "CUSTOMER" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "RI",
          input: {
            invoiceId: "invoice-1",
            receiptType: "CUSTOMER",
          },
          confirmed: false,
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes RS with invoice ID and delivery channel", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.RS}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Invoice ID"), {
      target: { value: "invoice-1" },
    });
    fireEvent.change(screen.getByLabelText("Delivery Channel"), {
      target: { value: "EMAIL" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "RS",
          input: {
            invoiceId: "invoice-1",
            channel: "EMAIL",
          },
          confirmed: true,
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes RC with the invoice ID", async () => {
    executeQuickOperationMock.mockResolvedValueOnce({
      code: "RC",
      result: {
        reconciled: true,
        issueCount: 0,
      },
    });

    render(
      <QuickOperationLauncher
        operation={operations.RC}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Invoice ID"), {
      target: { value: "invoice-1" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Reconciliation correction requested" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "RC",
          input: {
            invoiceId: "invoice-1",
          },
          confirmed: true,
          reason: "Reconciliation correction requested",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes SI with quantity, reason and reference", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.SI}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Inventory Item ID"), {
      target: { value: "item-1" },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Damaged stock" },
    });
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "ADJ-001" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "SI",
          input: {
            inventoryItemId: "item-1",
            quantity: 4,
            reference: "ADJ-001",
          },
          confirmed: true,
          reason: "Damaged stock",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes SR with quantity, reason and reference", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.SR}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Inventory Item ID"), {
      target: { value: "item-1" },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Supplier delivery" },
    });
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "REC-001" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "SR",
          input: {
            inventoryItemId: "item-1",
            quantity: 7,
            reference: "REC-001",
          },
          confirmed: true,
          reason: "Supplier delivery",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("executes SO and switches to the requested order", async () => {
    const onClose = vi.fn();

    render(
      <QuickOperationLauncher
        operation={operations.SO}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("Order ID"), {
      target: { value: "order-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "SO",
          input: {
            orderId: "order-2",
          },
          confirmed: false,
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });

    expect(getOrderMock).toHaveBeenCalledWith(
      "order-2",
      { accessToken: "access-token" },
      "branch-1",
    );
    expect(getCustomerMock).toHaveBeenCalledWith(
      "customer-2",
      { accessToken: "access-token" },
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("executes SC and switches to the requested customer", async () => {
    const onClose = vi.fn();

    render(
      <QuickOperationLauncher
        operation={operations.SC}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("Customer ID"), {
      target: { value: "customer-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "SC",
          input: {
            customerId: "customer-2",
          },
          confirmed: false,
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });

    expect(getCustomerMock).toHaveBeenCalledWith(
      "customer-2",
      { accessToken: "access-token" },
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    listOfflineSyncOperationsMock.mockReset();
    listOfflineSyncOperationsMock.mockResolvedValue([]);
  });

  it("renders SOS without requiring a record ID", () => {
    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Safe Stop / Safe Exit"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Record ID"),
    ).not.toBeInTheDocument();
  });

  it("requires confirmation before executing SOS", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Safely stopping the current workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText(
        "Please confirm that you want to perform this operation.",
      ),
    ).toBeInTheDocument();

    expect(executeQuickOperationMock).not.toHaveBeenCalled();
    expect(saveOrderWorkspaceStateMock).not.toHaveBeenCalled();
    expect(clearWorkspacesMock).not.toHaveBeenCalled();
  });

  it("saves workspaces before executing SOS and clears them after success", async () => {
    const onClose = vi.fn();

    executeQuickOperationMock.mockResolvedValueOnce({
      code: "SOS",
      result: {
        stopped: true,
        safeStateSaved: true,
        pendingOfflineOperationsPreserved: true,
        pendingOfflineOperationCount: 2,
        offlineQueueReconciled: false,
      },
    });

    listOfflineSyncOperationsMock.mockResolvedValueOnce([
      { id: "pending-1" },
      { id: "pending-2" },
    ]);

    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Safely stopping the current workflow" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(saveOrderWorkspaceStateMock).toHaveBeenCalledWith(
        "business-1",
        "user-1",
        "branch-1",
        expect.any(Array),
        "workspace-1",
      );
    });

    await waitFor(() => {
      expect(listOfflineSyncOperationsMock).toHaveBeenCalledWith(
        "business-1",
        "branch-1",
        "PENDING",
      );
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "SOS",
          input: {
            pendingOfflineOperationCount: 2,
          },
          confirmed: true,
          reason: "Safely stopping the current workflow",
        },
        { accessToken: "access-token" },
        "branch-1",
      );
      expect(clearWorkspacesMock).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks SOS while an order mutation is pending", async () => {
    useIsMutatingMock.mockReturnValue(1);

    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Safely stopping while an order operation is pending" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText(
        "SOS is temporarily blocked while an order operation is still in progress. Please wait and try again.",
      ),
    ).toBeInTheDocument();

    expect(saveOrderWorkspaceStateMock).not.toHaveBeenCalled();
    expect(executeQuickOperationMock).not.toHaveBeenCalled();
    expect(clearWorkspacesMock).not.toHaveBeenCalled();
  });

  it("does not call the backend or clear workspaces when persistence fails", async () => {
    saveOrderWorkspaceStateMock.mockImplementationOnce(() => {
      throw new Error("Storage failure");
    });

    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Safely stopping before closing the workflow" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText("Storage failure"),
    ).toBeInTheDocument();

    expect(saveOrderWorkspaceStateMock).toHaveBeenCalledTimes(1);
    expect(executeQuickOperationMock).not.toHaveBeenCalled();
    expect(clearWorkspacesMock).not.toHaveBeenCalled();
  });

  it("preserves workspaces when the backend SOS operation fails", async () => {
    executeQuickOperationMock.mockRejectedValueOnce(
      new Error("Safe stop failed"),
    );

    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Safely stopping after workflow failure" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText("Safe stop failed"),
    ).toBeInTheDocument();

    expect(saveOrderWorkspaceStateMock).toHaveBeenCalledTimes(1);
    expect(executeQuickOperationMock).toHaveBeenCalledTimes(1);
    expect(clearWorkspacesMock).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();

    render(
      <QuickOperationLauncher
        operation={operations.TO}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an API error without crashing", async () => {
    executeQuickOperationMock.mockRejectedValueOnce(
      new Error("Network failure"),
    );

    render(
      <QuickOperationLauncher
        operation={operations.VO}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Payment ID"), {
      target: { value: "payment-1" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Correcting a voided payment" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText("Network failure"),
    ).toBeInTheDocument();
  });
});
