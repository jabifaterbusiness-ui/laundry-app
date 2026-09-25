import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
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
    }) => unknown,
  ) =>
    selector({
      user: mockUser,
      accessToken: mockAccessToken,
    }),
}));

const mockedListSuspiciousActivity = vi.mocked(listSuspiciousActivity);

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

  it("shows separate event buttons and does not display records before selection", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "payment-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "payment.voided",
        entityType: "Payment",
        entityId: "payment-1",
        actorUserId: "manager-1",
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

  it("opens only the selected event and closes the previous event", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "login-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "user.login",
        entityType: "User",
        entityId: "user-1",
        actorUserId: "user-1",
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
        metadata: { reason: "Wrong price entered" },
        correlationId: null,
      },
      {
        id: "invoice-transfer-1",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "invoice.transferred",
        entityType: "Invoice",
        entityId: "invoice-2",
        actorUserId: "manager-1",
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
