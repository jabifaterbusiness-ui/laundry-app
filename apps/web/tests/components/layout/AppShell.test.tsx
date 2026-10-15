import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../../../src/components/layout/AppShell.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import { CLOUD_BACKUP_NOTIFICATION_EVENT } from "../../../src/lib/cloud-backup-notifications.js";

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "test@example.com",
      fullName: "Test User",
      role: "STAFF",
      businessId: "business-1",
      branches: [{ id: "branch-1", name: "Main Branch" }],
      permissions: [
        "customers.view",
        "orders.view",
        "invoices.view",
        "payments.view",
        "services.view",
      ],
    },
    accessToken: "test-token",
    refreshToken: "refresh-token",
    activeBranchId: "branch-1",
  });
});

function renderShell(initialEntry = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppShell>
          <div>Current page content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  it("renders global search and the authenticated navigation", () => {
    renderShell();

    expect(
      screen.getByRole("textbox", { name: /global search/i }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Invoices & Receipts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Payments" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Services & Price List" }),
    ).toBeInTheDocument();
  });

  it("renders the current page content", () => {
    renderShell("/orders");

    expect(screen.getByText("Current page content")).toBeInTheDocument();
  });

  it("shows and dismisses persistent cloud backup notifications", async () => {
    renderShell("/orders");

    window.dispatchEvent(
      new CustomEvent(CLOUD_BACKUP_NOTIFICATION_EVENT, {
        detail: {
          status: "error",
          title: "Scheduled cloud backup",
          message: "Backup failed. Check the backup run details.",
          source: "scheduled",
          runId: "run-test-1",
        },
      }),
    );

    expect(await screen.findByText("Scheduled cloud backup")).toBeInTheDocument();
    expect(screen.getByText("Backup failed. Check the backup run details.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() => {
      expect(screen.queryByText("Scheduled cloud backup")).not.toBeInTheDocument();
    });
  });

  it("opens the Quick Operation launcher from the global event", async () => {
    renderShell();

    window.dispatchEvent(
      new CustomEvent("quick-operation:open", {
        detail: {
          code: "VO",
          name: "Void Operation",
          permission: "payments.manage",
          requiresConfirmation: true,
          sensitive: true,
        },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /void operation/i }),
      ).toBeInTheDocument();
    });
  });

  it("opens SOS through the global Quick Operation event", async () => {
    renderShell();

    window.dispatchEvent(
      new CustomEvent("quick-operation:open", {
        detail: {
          code: "SOS",
          name: "Safe Stop / Safe Exit",
          description:
            "Safely stop the current workflow while protecting unsaved and pending business state.",
          permission: "orders.update",
          requiresConfirmation: true,
          sensitive: true,
        },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /safe stop \/ safe exit/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it("shows business management navigation only to authorized roles", () => {
    useAuthStore.setState({
      user: {
        id: "manager-1",
        email: "manager@example.com",
        fullName: "Branch Manager",
        role: "BRANCH_MANAGER",
        businessId: "business-1",
        branches: [{ id: "branch-1", name: "Main Branch" }],
        permissions: ["migrations.view"],
      },
    });

    renderShell();

    expect(
      screen.getByRole("link", { name: "Backup & Data Migration" }),
    ).toBeInTheDocument();
  });

  it("hides business management navigation from staff", () => {
    renderShell();

    expect(
      screen.queryByRole("link", { name: "Backup & Data Migration" }),
    ).not.toBeInTheDocument();
  });

  it("highlights the active navigation item", () => {
    renderShell("/orders");

    const ordersLink = screen.getByRole("link", { name: "Orders" });

    expect(ordersLink).toHaveStyle({
      fontWeight: "700",
    });
  });
});
