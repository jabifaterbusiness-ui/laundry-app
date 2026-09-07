import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickOperationLauncher } from "../../../src/components/quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../../src/lib/quick-operations-catalog.js";

const {
  executeQuickOperationMock,
  saveOrderWorkspaceStateMock,
  clearWorkspacesMock,
  useIsMutatingMock,
} = vi.hoisted(() => ({
  executeQuickOperationMock: vi.fn(),
  saveOrderWorkspaceStateMock: vi.fn(),
  clearWorkspacesMock: vi.fn(),
  useIsMutatingMock: vi.fn(() => 0),
}));

vi.mock("../../../src/lib/quick-operations-api.js", () => ({
  executeQuickOperation: executeQuickOperationMock,
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
    } | null;
  }) => unknown) =>
    selector({
      accessToken: "access-token",
      activeBranchId: "branch-1",
      user: {
        id: "user-1",
        businessId: "business-1",
      },
    }),
}));


vi.mock("../../../src/state/order-workspace-store.js", () => ({
  useOrderWorkspaceStore: (
    selector: (state: {
      workspaces: unknown[];
      activeWorkspaceId: string | null;
      clearWorkspaces: () => void;
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
    }),
}));


vi.mock("../../../src/lib/order-workspace-persistence.js", () => ({
  saveOrderWorkspaceState: saveOrderWorkspaceStateMock,
}));

const operations: Record<string, QuickOperationDefinition> = {
  TI: {
    code: "TI",
    name: "Transfer Invoice",
    description: "Transfer an invoice/order to another customer account.",
    permission: "orders.update",
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
  SI: {
    code: "SI",
    name: "Stock Issue",
    description: "Record an inventory issue against the active branch.",
    permission: "inventory.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  MU: {
    code: "MU",
    name: "Manual Update",
    description: "Make an authorized manual update.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
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
      code: "TI",
      result: {},
    });

    saveOrderWorkspaceStateMock.mockReset();
    clearWorkspacesMock.mockReset();
    useIsMutatingMock.mockReset();
    useIsMutatingMock.mockReturnValue(0);
  });

  it("renders the selected operation", () => {
    render(
      <QuickOperationLauncher
        operation={operations.TI}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Transfer Invoice")).toBeInTheDocument();
    expect(screen.getByText("TI")).toBeInTheDocument();
  });

  it("requires confirmation before sensitive execution", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.TI}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Order ID"), {
      target: { value: "order-1" },
    });
    fireEvent.change(screen.getByLabelText("New Customer ID"), {
      target: { value: "customer-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText(
        "Please confirm that you want to perform this operation.",
      ),
    ).toBeInTheDocument();

    expect(executeQuickOperationMock).not.toHaveBeenCalled();
  });

  it("executes TI with the correct input after confirmation", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.TI}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Order ID"), {
      target: { value: "order-1" },
    });
    fireEvent.change(screen.getByLabelText("New Customer ID"), {
      target: { value: "customer-2" },
    });
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    await waitFor(() => {
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "TI",
          input: {
            orderId: "order-1",
            customerId: "customer-2",
          },
          confirmed: true,
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });

    expect(
      await screen.findByText("Transfer Invoice completed successfully."),
    ).toBeInTheDocument();
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
            reason: "Damaged stock",
            reference: "ADJ-001",
          },
          confirmed: true,
        },
        { accessToken: "access-token" },
        "branch-1",
      );
    });
  });

  it("does not execute unsupported operations", async () => {
    render(
      <QuickOperationLauncher
        operation={operations.MU}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/backend workflow has not been implemented yet/i),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /execute/i }),
    ).not.toBeInTheDocument();

    expect(executeQuickOperationMock).not.toHaveBeenCalled();
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
        pendingOfflineOperationsHandled: false,
        offlineQueueAvailable: false,
      },
    });

    render(
      <QuickOperationLauncher
        operation={operations.SOS}
        onClose={onClose}
      />,
    );

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
      expect(executeQuickOperationMock).toHaveBeenCalledWith(
        {
          code: "SOS",
          input: {},
          confirmed: true,
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
        operation={operations.TI}
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
    fireEvent.click(screen.getByLabelText(/confirm/i));
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));

    expect(
      await screen.findByText("Network failure"),
    ).toBeInTheDocument();
  });
});
