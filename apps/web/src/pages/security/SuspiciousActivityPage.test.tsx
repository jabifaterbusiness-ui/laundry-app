import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SuspiciousActivityPage } from "./SuspiciousActivityPage.js";
import { listSuspiciousActivity } from "../../lib/audit-api.js";

let mockUser = {
  id: "manager-1",
  fullName: "Jane Manager",
  email: "jane@example.com",
  role: "Branch Manager",
  securityRole: "BRANCH_MANAGER" as const,
  permissions: ["security.suspicious_activity.view"],
};

let mockAccessToken = "token";

vi.mock("../../lib/audit-api.js", () => ({
  listSuspiciousActivity: vi.fn(),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (
    selector: (state: {
      user: typeof mockUser;
      accessToken: string;
      activeBranchId: string;
    }) => unknown,
  ) =>
    selector({
      user: mockUser,
      accessToken: mockAccessToken,
      activeBranchId: "branch-1",
    }),
}));

const mockedListSuspiciousActivity = vi.mocked(listSuspiciousActivity);

function LocationProbe() {
  const location = useLocation();

  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SuspiciousActivityPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SuspiciousActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUser = {
      id: "manager-1",
      fullName: "Jane Manager",
      email: "jane@example.com",
      role: "Branch Manager",
      securityRole: "BRANCH_MANAGER",
      permissions: ["security.suspicious_activity.view"],
    };

    mockAccessToken = "token";
    localStorage.clear();
  });

  it("lets an authorized user reorder sections and remembers the chosen order", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([]);
    const { unmount } = renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Customize section order" }));
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Backup & recovery");
    expect(screen.getAllByRole("heading", { level: 3 })[1]).toHaveTextContent("Inventory");
    fireEvent.click(screen.getByRole("button", { name: "Move Inventory up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));

    const savedOrder = JSON.parse(localStorage.getItem("laundry-app:suspicious-activity-order:manager-1:branch-1") ?? "[]");
    expect(savedOrder.slice(0, 2)).toEqual(["inventory", "backup"]);
    unmount();

    renderPage();
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings[0]).toHaveTextContent("Inventory");
    expect(headings[1]).toHaveTextContent("Backup & recovery");
  });

  it("blocks users without the suspicious activity permission", () => {
    mockUser.permissions = [];

    renderPage();

    expect(
      screen.getByText(
        /you do not have permission to view suspicious or high-risk activity/i,
      ),
    ).toBeInTheDocument();

    expect(mockedListSuspiciousActivity).not.toHaveBeenCalled();
  });

  it("displays the actor name instead of the actor user ID", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "actor-name-event",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: "invoice-123",
        actorUserId: "30cd9cc7-2c18-48e5-b364-77336f0f8940",
        actorName: "Jane Manager",
        metadata: {
          operationName: "Resend Receipt",
        },
        correlationId: "corr-actor-name",
      },
    ]);

    renderPage();

    const eventButton = await screen.findByRole("button", {
      name: /resend receipt/i,
    });

    fireEvent.click(eventButton);

    expect(screen.getByText("Jane Manager")).toBeInTheDocument();
    expect(
      screen.queryByText("30cd9cc7-2c18-48e5-b364-77336f0f8940"),
    ).not.toBeInTheDocument();
  });

  it("shows separate event buttons and does not display records before selection", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "payment-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "payment.voided",
        entityType: "Payment",
        entityId: "payment-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Duplicate payment" },
        correlationId: "corr-1",
      },
      {
        id: "permission-1",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "permission.user.allow_all",
        entityType: "UserPermission",
        entityId: "permission-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Temporary management access" },
        correlationId: null,
      },
    ]);

    renderPage();

    expect(
      await screen.findByRole("button", { name: /payment voided/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /(?:^|\s)allow all permissions\b.*view records/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Duplicate payment"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Temporary management access"),
    ).not.toBeInTheDocument();
  });

  it("makes supported record IDs navigate to their exact record routes", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "customer-event",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "order.customer_transferred",
        entityType: "Customer",
        entityId: "customer-123",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {},
        correlationId: null,
      },
      {
        id: "order-event",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "order.status_changed",
        entityType: "Order",
        entityId: "order-123",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {},
        correlationId: null,
      },
      {
        id: "invoice-event",
        timestamp: "2026-09-25T06:32:00.000Z",
        action: "invoice.updated",
        entityType: "Invoice",
        entityId: "invoice-123",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {},
        correlationId: null,
      },
      {
        id: "payment-event",
        timestamp: "2026-09-25T06:33:00.000Z",
        action: "payment.voided",
        entityType: "Payment",
        entityId: "payment-123",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {},
        correlationId: null,
      },
    ]);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SuspiciousActivityPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const customerButton = await screen.findByRole("button", {
      name: /Customer Transferred/i,
    });

    fireEvent.click(customerButton);

    const customerId = screen.getByRole("button", {
      name: "Customer",
    });
    fireEvent.click(customerId);

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/customer-workstation?customerId=customer-123",
    );
  });

  it("makes MigrationJob record IDs navigate to the Data Management job", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "migration-event",
        timestamp: "2026-09-25T06:34:00.000Z",
        action: "migration.analyzed",
        entityType: "MigrationJob",
        entityId: "migration-job-123",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {},
        correlationId: null,
      },
    ]);

    renderPage();

    const migrationEventButton = await screen.findByRole("button", {
      name: /migration analyzed/i,
    });

    fireEvent.click(migrationEventButton);

    const migrationJobId = screen.getByRole("button", {
      name: "Migration Job",
    });

    fireEvent.click(migrationJobId);

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/data-management?jobId=migration-job-123",
    );
  });

  it("opens only the selected event and closes the previous event", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "login-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "user.login",
        entityType: "User",
        entityId: "user-1",
        actorUserId: "user-1",
        actorName: "Jane Manager",
        metadata: {},
        correlationId: null,
      },
      {
        id: "permission-1",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "permission.user.allow_all",
        entityType: "UserPermission",
        entityId: "permission-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Temporary management access" },
        correlationId: null,
      },
      {
        id: "payment-1",
        timestamp: "2026-09-25T06:32:00.000Z",
        action: "payment.voided",
        entityType: "Payment",
        entityId: "payment-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Duplicate payment" },
        correlationId: "corr-1",
      },
    ]);

    renderPage();

    const loginButton = await screen.findByRole("button", {
      name: /login history/i,
    });

    fireEvent.click(loginButton);

    expect(
      screen.getByRole("heading", { name: "Login History", level: 2 }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("user.login"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Temporary management access"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /(?:^|\s)allow all permissions\b.*view records/i }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Allow All Permissions",
        level: 2,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Temporary management access"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("user.login"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Duplicate payment"),
    ).not.toBeInTheDocument();
  });

  it("keeps invoice correction events separate", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "invoice-update-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "invoice.updated",
        entityType: "Invoice",
        entityId: "invoice-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Wrong price entered" },
        correlationId: null,
      },
      {
        id: "order-invoice-edit-1",
        timestamp: "2026-09-25T06:30:30.000Z",
        action: "order.invoice_edited",
        entityType: "Order",
        entityId: "order-3",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {
          reason: "Corrected invoice service details",
          invoiceNumber: "INV-1003",
          orderNumber: "ORD-1003",
          historyId: "history-3",
        },
        correlationId: null,
      },
      {
        id: "invoice-transfer-1",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "invoice.transferred",
        entityType: "Invoice",
        entityId: "invoice-2",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Wrong customer account" },
        correlationId: null,
      },
    ]);

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /invoice updated/i,
      }),
    );

    expect(
      screen.getByText("Wrong price entered"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Corrected invoice service details"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Wrong customer account"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /invoice transferred/i,
      }),
    );

    expect(
      screen.getByText("Wrong customer account"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Wrong price entered"),
    ).not.toBeInTheDocument();
  });

  it("shows each permission activity as its own event", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "permission-1",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "permission.user.allow_all",
        entityType: "UserPermission",
        entityId: "permission-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Management approval" },
        correlationId: null,
      },
      {
        id: "permission-2",
        timestamp: "2026-09-25T06:32:00.000Z",
        action: "permission.user.disallow_all",
        entityType: "UserPermission",
        entityId: "permission-2",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: { reason: "Access removed after task completion" },
        correlationId: null,
      },
    ]);

    renderPage();

    expect(
      await screen.findByRole("button", {
        name: /(?:^|\s)allow all permissions\b.*view records/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /(?:^|\s)disallow all permissions\b.*view records/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Management approval"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Access removed after task completion"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /(?:^|\s)allow all permissions\b.*view records/i,
      }),
    );

    expect(
      screen.getByText("Management approval"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Access removed after task completion"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /(?:^|\s)disallow all permissions\b.*view records/i,
      }),
    );

    expect(
      screen.getByText("Access removed after task completion"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Management approval"),
    ).not.toBeInTheDocument();
  });

  it("keeps quick operations as separate event types", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "quick-transfer-1",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: "order-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {
          operationCode: "TI",
          operationName: "Transfer Invoice",
          reason: "Wrong customer account",
        },
        correlationId: null,
      },
      {
        id: "quick-refund-1",
        timestamp: "2026-09-25T06:32:00.000Z",
        action: "quick_operation.executed",
        entityType: "Payment",
        entityId: "payment-1",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {
          operationCode: "RF",
          operationName: "Refund",
          reason: "Customer refund approved",
        },
        correlationId: null,
      },
    ]);

    renderPage();

    expect(
      await screen.findByRole("button", {
        name: /transfer invoice/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /refund/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: /^quick operation/i,
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /transfer invoice/i,
      }),
    );

    expect(
      screen.getByText("Wrong customer account"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Customer refund approved"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /refund/i,
      }),
    );

    expect(
      screen.getByText("Customer refund approved"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Wrong customer account"),
    ).not.toBeInTheDocument();
  });

  it("renders invoice correction snapshots, service lines, changes, and collapsed technical data", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "invoice-snapshot-test",
        timestamp: "2026-10-01T10:00:00.000Z",
        action: "order.invoice_edited",
        entityType: "Order",
        entityId: "order-snapshot-test",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {
          orderNumber: "ORD-TEST-100",
          invoiceNumber: "INV-TEST-100",
          reason: "Corrected service quantity",
          before: {
            orderNumber: "ORD-TEST-100",
            status: "IN_PROGRESS",
            orderTotal: 2000,
            items: [
              {
                id: "old-line",
                serviceName: "Wash and Fold",
                quantity: 1,
                totalPieces: 5,
                colors: ["White", "Blue"],
                unitPrice: 2000,
                lineTotal: 2000,
              },
            ],
            invoice: {
              invoiceNumber: "INV-TEST-100",
              totalAmount: 2000,
              customerName: "Test Customer",
              items: [
                {
                  id: "old-invoice-line",
                  itemName: "Wash and Fold",
                  quantity: 1,
                  totalPieces: 5,
                  colors: ["White", "Blue"],
                  unitPrice: 2000,
                  totalPrice: 2000,
                },
              ],
            },
          },
          after: {
            orderNumber: "ORD-TEST-100",
            status: "READY_FOR_PICKUP",
            orderTotal: 4000,
            items: [
              {
                id: "new-line",
                serviceName: "Wash and Fold",
                quantity: 2,
                totalPieces: 10,
                colors: ["White", "Blue"],
                unitPrice: 2000,
                lineTotal: 4000,
              },
            ],
            invoice: {
              invoiceNumber: "INV-TEST-100",
              totalAmount: 4000,
              customerName: "Test Customer",
              items: [
                {
                  id: "new-invoice-line",
                  itemName: "Wash and Fold",
                  quantity: 2,
                  totalPieces: 10,
                  colors: ["White", "Blue"],
                  unitPrice: 2000,
                  totalPrice: 4000,
                },
              ],
            },
          },
          historyId: "history-snapshot-test",
        },
        correlationId: null,
      },
    ]);

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /invoice updated/i,
      }),
    );

    expect(screen.getByText("Corrected service quantity")).toBeInTheDocument();
    expect(screen.getByText("Before the change")).toBeInTheDocument();
    expect(screen.getByText("After the change")).toBeInTheDocument();
    expect(screen.getAllByText("Wash and Fold").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Test Customer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("White, Blue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quantity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Order total").length).toBeGreaterThan(0);
    expect(screen.getByText("Recorded change")).toBeInTheDocument();

    const technicalDetails = screen.getByText(
      "Technical details (raw event data)",
    ).closest("details");

    expect(technicalDetails).not.toBeNull();
    expect(technicalDetails).not.toHaveAttribute("open");
  });

  it("renders status-only changes and handles missing or unexpected metadata safely", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "status-change-test",
        timestamp: "2026-10-01T11:00:00.000Z",
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: "order-status-test",
        actorUserId: "manager-1",
        actorName: "Jane Manager",
        metadata: {
          operationName: "Manual Update",
          orderNumber: "ORD-STATUS-1",
          beforeStatus: "IN_PROGRESS",
          afterStatus: "READY_FOR_PICKUP",
          reason: "Order is ready",
          extraContext: {
            source: "test",
            flags: ["checked", "approved"],
          },
        },
        correlationId: null,
      },
      {
        id: "missing-metadata-test",
        timestamp: "2026-10-01T11:01:00.000Z",
        action: "user.login",
        entityType: "User",
        entityId: null,
        actorUserId: null,
        actorName: null,
        metadata: null,
        correlationId: null,
      },
      {
        id: "unexpected-metadata-test",
        timestamp: "2026-10-01T11:02:00.000Z",
        action: "user.password_reset_completed",
        entityType: "User",
        entityId: null,
        actorUserId: null,
        actorName: null,
        metadata: ["unexpected", 12, true],
        correlationId: null,
      },
    ]);

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /manual update/i,
      }),
    );

    expect(screen.getByText("ORD-STATUS-1")).toBeInTheDocument();
    expect(screen.getAllByText("IN_PROGRESS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("READY_FOR_PICKUP").length).toBeGreaterThan(0);
    expect(screen.getByText("Order is ready")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /login history/i,
      }),
    );

    expect(
      screen.getByText("No additional event details were recorded."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /password reset completed/i,
      }),
    );

    expect(screen.getByText("unexpected, 12, Yes")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByText(
        /select an event button above to view its records/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows an API error state", async () => {
    mockedListSuspiciousActivity.mockRejectedValue(
      new Error("request failed"),
    );

    renderPage();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/unable to load suspicious activity/i);
  });
});
