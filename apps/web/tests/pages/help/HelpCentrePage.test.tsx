import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelpCentrePage } from "../../../src/pages/help/HelpCentrePage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: "owner-1",
      email: "owner@example.com",
      username: "owner",
      fullName: "Business Owner",
      role: "Owner",
      securityRole: "BUSINESS_OWNER",
      businessId: "business-1",
      branches: [{ id: "branch-1", name: "Main Branch", isActive: true }],
      permissions: ["orders.view", "orders.update", "customers.view", "customers.update", "payments.manage", "invoices.view", "invoices.manage", "inventory.manage", "migrations.manage"],
    },
  });
});

function renderPage() {
  return render(<MemoryRouter><HelpCentrePage /></MemoryRouter>);
}

describe("HelpCentrePage", () => {
  it("renders practical guides, support contact and shortcut catalogue", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Help Centre" })).toBeInTheDocument();
    expect(screen.getAllByText("laundryangel2026@gmail.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Branches: how they work and why they matter")).toBeInTheDocument();
    expect(screen.getByText("Instant Local Backup")).toBeInTheDocument();
    expect(screen.getByText("Quick Operations shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Manual Update")).toBeInTheDocument();
    expect(screen.getByText("Safe Stop / Safe Exit")).toBeInTheDocument();
  });

  it("filters help guides and shortcuts from the search field", () => {
    renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: /search help articles/i }), { target: { value: "payroll" } });
    expect(screen.getByText("Payroll: requests, approvals and payment")).toBeInTheDocument();
    expect(screen.queryByText("Instant Local Backup")).not.toBeInTheDocument();
  });

  it("opens an allowed quick operation from its guide card", () => {
    const listener = vi.fn();
    window.addEventListener("quick-operation:open", listener);
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("quick-operation:open", listener);
  });
});
