import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollApprovalSection } from "./PayrollApprovalSection.js";
import {
  approvePayroll,
  declinePayroll,
  getPayrollStatus,
  listPayrollPeriods,
  submitPayrollForApproval,
} from "../../lib/payroll-api.js";

const mocks = vi.hoisted(() => ({
  requestSensitiveAuthorization: vi.fn(),
  user: {
    id: "approver-1",
    permissions: ["payroll.view", "payroll.manage", "payroll.approve"],
  },
}));

vi.mock("../../lib/payroll-api.js", () => ({
  approvePayroll: vi.fn(),
  declinePayroll: vi.fn(),
  getPayrollStatus: vi.fn(),
  listPayrollPeriods: vi.fn(),
  submitPayrollForApproval: vi.fn(),
}));

vi.mock("../../lib/permissions.js", () => ({
  hasPermission: (_user: unknown, permission: string) =>
    mocks.user.permissions.includes(permission),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: { user: typeof mocks.user }) => unknown) =>
    selector({ user: mocks.user }),
}));

vi.mock("../../components/auth/SensitiveAuthorizationProvider.js", () => ({
  useSensitiveAuthorization: () => ({
    requestSensitiveAuthorization: mocks.requestSensitiveAuthorization,
  }),
}));

const period = {
  id: "period-1",
  businessId: "business-1",
  branchId: "branch-1",
  periodStart: "2026-10-01T00:00:00.000Z",
  periodEnd: "2026-10-31T23:59:59.000Z",
  status: "PROCESSING" as const,
  approvalStatus: "PENDING" as const,
  approvalSubmittedById: "manager-1",
  approvalDecidedAt: null,
  approvalReason: null,
};

const payrollStatus = {
  payrollPeriod: period,
  summary: {
    employeeCount: 1,
    paidCount: 0,
    partiallyPaidCount: 1,
    unpaidCount: 0,
    totalGrossPay: 150000,
    totalDeductions: 20000,
    totalNetPay: 130000,
    totalPaid: 50000,
    totalBalance: 80000,
  },
  records: [{
    payrollRecordId: "record-1",
    employee: {
      id: "employee-1",
      fullName: "Ada Okafor",
      email: "ada@example.com",
      role: "Accountant",
    },
    basicSalary: 120000,
    allowances: 20000,
    bonuses: 10000,
    grossPay: 150000,
    totalDeductions: 20000,
    netPay: 130000,
    amountPaid: 50000,
    balance: 80000,
    paymentStatus: "PARTIALLY_PAID" as const,
    deductions: [{
      id: "deduction-1",
      type: "IOU",
      amount: 20000,
      description: "Staff IOU repayment",
    }],
    payments: [{
      id: "payment-1",
      amount: 50000,
      method: "TRANSFER" as const,
      reference: "BANK-REF-77",
      note: "October salary part payment",
      status: "POSTED" as const,
      createdAt: "2026-10-20T10:00:00.000Z",
    }],
  }],
};

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PayrollApprovalSection
        accessToken="test-token"
        branchId="branch-1"
        selectedPeriodId="period-1"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.permissions = ["payroll.view", "payroll.manage", "payroll.approve"];
  vi.mocked(listPayrollPeriods).mockResolvedValue([period]);
  vi.mocked(getPayrollStatus).mockResolvedValue(payrollStatus);
  vi.mocked(approvePayroll).mockResolvedValue(period);
  vi.mocked(declinePayroll).mockResolvedValue(period);
  vi.mocked(submitPayrollForApproval).mockResolvedValue(period);
});

describe("PayrollApprovalSection", () => {
  it("shows complete read-only totals, employee payment status, deduction details and payment history", async () => {
    renderSection();

    const review = await screen.findByRole("region", {
      name: "Read-only employee payroll review",
    });

    expect(within(review).getByText("Employees")).toBeInTheDocument();
    expect(within(review).getByText("₦150,000")).toBeInTheDocument();
    expect(within(review).getByText("₦20,000")).toBeInTheDocument();
    expect(within(review).getByText("₦130,000")).toBeInTheDocument();
    expect(within(review).getByText("₦50,000")).toBeInTheDocument();
    expect(within(review).getByText("₦80,000")).toBeInTheDocument();
    expect(within(review).getByText("Paid:")).toBeInTheDocument();
    expect(within(review).getByText("Partially paid:")).toBeInTheDocument();
    expect(within(review).getByText("Unpaid:")).toBeInTheDocument();

    expect(within(review).getByText("Ada Okafor")).toBeInTheDocument();
    expect(within(review).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(review).getByText("Accountant")).toBeInTheDocument();
    expect(within(review).getByText("PARTIALLY PAID")).toBeInTheDocument();
    expect(within(review).getByText("Staff IOU repayment")).toBeInTheDocument();
    expect(within(review).getByText("BANK-REF-77")).toBeInTheDocument();
    expect(within(review).getByText("October salary part payment")).toBeInTheDocument();
  });

  it("keeps the approver's employee review read-only", async () => {
    renderSection();
    const review = await screen.findByRole("region", {
      name: "Read-only employee payroll review",
    });

    expect(within(review).queryByRole("button")).not.toBeInTheDocument();
    expect(within(review).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(review).getByText("Deduction details")).toBeInTheDocument();
    expect(within(review).getByText("Payment history")).toBeInTheDocument();
  });
});
