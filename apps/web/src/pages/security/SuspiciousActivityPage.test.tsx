import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

  it("classifies payment activity and renders an organized table", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "audit-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "payment.voided",
        entityType: "Payment",
        entityId: "payment-1",
        actorUserId: "manager-1",
        metadata: { reason: "Duplicate payment" },
        correlationId: "corr-1",
      },
    ]);

    renderPage();

    expect(
      await screen.findByText("Financial & Payments"),
    ).toBeInTheDocument();

    expect(screen.getByText("Payment voided")).toBeInTheDocument();
    expect(screen.getByText("payment.voided")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Payment · payment-1")).toBeInTheDocument();
    expect(screen.getByText("manager-1")).toBeInTheDocument();
    expect(screen.getByText("Duplicate payment")).toBeInTheDocument();
    expect(screen.getByText("Total events")).toBeInTheDocument();
    expect(screen.getByText("Critical events")).toBeInTheDocument();

    expect(mockedListSuspiciousActivity).toHaveBeenCalledWith(
      "token",
      100,
    );
  });

  it("groups activities into their correct categories", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([
      {
        id: "audit-1",
        timestamp: "2026-09-25T06:30:00.000Z",
        action: "user.login",
        entityType: "User",
        entityId: "user-1",
        actorUserId: "user-1",
        metadata: {},
        correlationId: null,
      },
      {
        id: "audit-2",
        timestamp: "2026-09-25T06:31:00.000Z",
        action: "permission.user.allow_all",
        entityType: "UserPermission",
        entityId: "permission-1",
        actorUserId: "manager-1",
        metadata: {},
        correlationId: null,
      },
      {
        id: "audit-3",
        timestamp: "2026-09-25T06:32:00.000Z",
        action: "backup.restored",
        entityType: "Business",
        entityId: "business-1",
        actorUserId: "manager-1",
        metadata: {},
        correlationId: null,
      },
    ]);

    renderPage();

    expect(
      await screen.findByText("Security & Authentication"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Permissions & Access"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Backup & Recovery"),
    ).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mockedListSuspiciousActivity.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByText(
        /no suspicious or high-risk activity has been recorded/i,
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
