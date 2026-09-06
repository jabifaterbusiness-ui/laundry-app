import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickOperationLauncher } from "../../../src/components/quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../../src/lib/quick-operations-catalog.js";

const { executeQuickOperationMock } = vi.hoisted(() => ({
  executeQuickOperationMock: vi.fn(),
}));

vi.mock("../../../src/lib/quick-operations-api.js", () => ({
  executeQuickOperation: executeQuickOperationMock,
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    accessToken: string | null;
    activeBranchId: string | null;
  }) => unknown) =>
    selector({
      accessToken: "access-token",
      activeBranchId: "branch-1",
    }),
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
};

describe("QuickOperationLauncher", () => {
  beforeEach(() => {
    executeQuickOperationMock.mockReset();
    executeQuickOperationMock.mockResolvedValue({
      code: "TI",
      result: {},
    });
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
      await screen.findByText(
        "The operation could not be completed. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});
