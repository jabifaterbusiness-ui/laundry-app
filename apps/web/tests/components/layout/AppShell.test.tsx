import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../../../src/components/layout/AppShell.js";
import { useAuthStore } from "../../../src/state/auth-store.js";

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "test@example.com",
      fullName: "Test User",
      role: "STAFF",
      businessId: "business-1",
      branches: [{ id: "branch-1", name: "Main Branch" }],
    },
    accessToken: "test-token",
    refreshToken: "refresh-token",
    activeBranchId: "branch-1",
  });
});

function renderShell(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppShell>
        <div>Current page content</div>
      </AppShell>
    </MemoryRouter>,
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

  it("shows business management navigation only to authorized roles", () => {
    useAuthStore.setState({
      user: {
        id: "manager-1",
        email: "manager@example.com",
        fullName: "Branch Manager",
        role: "BRANCH_MANAGER",
        businessId: "business-1",
        branches: [{ id: "branch-1", name: "Main Branch" }],
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
