import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollCompensationSection } from "./PayrollCompensationSection.js";
import {
  assignLegacyCompensationToCurrentBranch,
  createCompensation,
  listCompensation,
  listUnassignedLegacyCompensation,
} from "../../lib/payroll-api.js";
import { listBranchUsers } from "../../lib/users-api.js";

vi.mock("../../lib/payroll-api.js", () => ({
  assignLegacyCompensationToCurrentBranch: vi.fn(),
  createCompensation: vi.fn(),
  listCompensation: vi.fn(),
  listUnassignedLegacyCompensation: vi.fn(),
}));

vi.mock("../../lib/users-api.js", () => ({
  listBranchUsers: vi.fn(),
}));

const mockUser = {
  id: "owner-1",
  fullName: "Owner",
  email: "owner@example.com",
  username: "owner",
  role: "Business Owner",
  securityRole: "BUSINESS_OWNER",
  businessId: "biz-1",
  branches: [],
  permissions: ["compensation.view", "compensation.manage"],
};

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser }),
}));

const employees = [
  {
    id: "employee-1",
    fullName: "Jabi Fater Peter",
    email: "jabi@example.com",
    username: "jabi",
    role: "Accountant",
    isActive: true,
    businessId: "biz-1",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    branches: [],
  },
];

const compensation = [
  {
    id: "comp-1",
    businessId: "biz-1",
    employeeId: "employee-1",
    branchId: null,
    basicSalary: 150000,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    employee: {
      id: "employee-1",
      fullName: "Jabi Fater Peter",
      email: "jabi@example.com",
      role: "Accountant",
    },
  },
];

const mockedAssignLegacyCompensation = vi.mocked(assignLegacyCompensationToCurrentBranch);
const mockedListUnassignedLegacy = vi.mocked(listUnassignedLegacyCompensation);
const mockedCreateCompensation = vi.mocked(createCompensation);
const mockedListCompensation = vi.mocked(listCompensation);
const mockedListBranchUsers = vi.mocked(listBranchUsers);

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PayrollCompensationSection
        accessToken="token"
        branchId="branch-1"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListBranchUsers.mockResolvedValue(employees);
  mockedListCompensation.mockResolvedValue(compensation);
  mockedListUnassignedLegacy.mockResolvedValue([]);
  mockedAssignLegacyCompensation.mockResolvedValue(compensation[0]!);
  mockedCreateCompensation.mockResolvedValue(compensation[0]!);
});

describe("PayrollCompensationSection", () => {
  it("shows the employee salary register", async () => {
    renderSection();

    const employeeRow = await screen.findByRole("row", {
      name: /Jabi Fater Peter.*jabi@example.com.*Accountant.*₦150,000/i,
    });
    expect(employeeRow).toBeInTheDocument();
    expect(employeeRow).toHaveTextContent("₦150,000");
    expect(employeeRow).toHaveTextContent("Accountant");
  });

  it("opens the compensation form", async () => {
    renderSection();

    await screen.findByRole("row", {
      name: /Jabi Fater Peter.*jabi@example.com.*Accountant.*150,000/i,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "+ Add Compensation" }),
    );

    expect(
      screen.getByRole("heading", { name: "Add Employee Compensation" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Employee")).toBeInTheDocument();
    expect(screen.getByLabelText("Basic salary (₦)")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective from")).toBeInTheDocument();
  });

  it("creates compensation with the selected employee, salary and date", async () => {
    renderSection();

    await screen.findByRole("row", {
      name: /Jabi Fater Peter.*jabi@example.com.*Accountant.*150,000/i,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "+ Add Compensation" }),
    );

    fireEvent.change(screen.getByLabelText("Employee"), {
      target: { value: "employee-1" },
    });
    fireEvent.change(screen.getByLabelText("Basic salary (₦)"), {
      target: { value: "175000" },
    });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-10-01" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Save Compensation" }),
    );

    await waitFor(() => {
      expect(mockedCreateCompensation).toHaveBeenCalledWith(
        {
          employeeId: "employee-1",
          basicSalary: 175000,
          effectiveFrom: "2026-10-01",
        },
        {
          accessToken: "token",
        },
        "branch-1",
      );
    });
  });

  it("shows the owner-only pending legacy queue and requires confirmation before assignment", async () => {
    mockedListUnassignedLegacy.mockResolvedValue([
      {
        ...compensation[0]!,
        branchId: null,
        employee: {
          ...compensation[0]!.employee,
          branches: [
            { branch: { id: "branch-1", name: "1st Avenue", isActive: true } },
            { branch: { id: "branch-2", name: "mainbranch", isActive: true } },
          ],
        },
      },
    ]);

    renderSection();

    expect(
      await screen.findByRole("heading", { name: "Unassigned legacy salaries" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1st Avenue, mainbranch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assign to this branch" }));

    expect(screen.getByRole("button", { name: "Confirm assignment" })).toBeInTheDocument();
    expect(mockedAssignLegacyCompensation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    await waitFor(() => {
      expect(mockedAssignLegacyCompensation).toHaveBeenCalledWith(
        "comp-1",
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

});
