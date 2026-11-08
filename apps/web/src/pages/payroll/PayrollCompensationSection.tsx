import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  assignLegacyCompensationToCurrentBranch,
  createCompensation,
  listCompensation,
  listUnassignedLegacyCompensation,
  type EmployeeCompensation,
  type UnassignedLegacyCompensation,
} from "../../lib/payroll-api.js";
import {
  listBranchUsers,
  type ManagedUser,
} from "../../lib/users-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

function money(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

function displayDate(value: string) {
  return new Date(value).toLocaleDateString("en-NG", {
    dateStyle: "medium",
  });
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  background: "#ffffff",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
};

const mutedStyle = {
  color: "#64748b",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "5px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 700,
  background: "#dcfce7",
  color: "#166534",
};

export interface PayrollCompensationSectionProps {
  accessToken: string | null;
  branchId: string | null;
}

export function PayrollCompensationSection({
  accessToken,
  branchId,
}: PayrollCompensationSectionProps) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const canView = hasPermission(user, "compensation.view");
  const canManage = hasPermission(user, "compensation.manage");
  const canReviewLegacy = user?.securityRole === "BUSINESS_OWNER" && canManage;

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [basicSalary, setBasicSalary] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayInputValue());
  const [formError, setFormError] = useState("");
  const [confirmAssignmentId, setConfirmAssignmentId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState("");

  const employeesQuery = useQuery({
    queryKey: ["payroll", "compensation", "employees", branchId],
    queryFn: () => listBranchUsers(branchId!, accessToken ?? ""),
    enabled: Boolean(accessToken && branchId && canView),
  });

  const compensationQuery = useQuery({
    queryKey: ["payroll", "compensation", branchId],
    queryFn: () =>
      listCompensation(
        {},
        {
          accessToken,
        },
        branchId,
      ),
    enabled: Boolean(accessToken && branchId && canView),
  });

  const unassignedLegacyQuery = useQuery({
    queryKey: ["payroll", "compensation", "unassigned-legacy", user?.businessId],
    queryFn: () =>
      listUnassignedLegacyCompensation({ accessToken }, branchId),
    enabled: Boolean(accessToken && branchId && canReviewLegacy),
  });

  const assignLegacyMutation = useMutation({
    mutationFn: (compensationId: string) =>
      assignLegacyCompensationToCurrentBranch(
        compensationId,
        { accessToken },
        branchId,
      ),
    onSuccess: async () => {
      setConfirmAssignmentId(null);
      setAssignmentError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payroll", "compensation"] }),
        queryClient.invalidateQueries({
          queryKey: ["payroll", "compensation", "unassigned-legacy"],
        }),
      ]);
    },
    onError: (error) => {
      setAssignmentError(
        error instanceof ApiError
          ? error.message
          : "Unable to assign this legacy compensation. Refresh and try again.",
      );
    },
  });

  const employees = useMemo(
    () =>
      (employeesQuery.data ?? [])
        .filter((employee) => employee.isActive)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employeesQuery.data],
  );

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((employee) =>
      [
        employee.fullName,
        employee.email ?? "",
        employee.username ?? "",
        employee.role ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [employees, search]);

  const compensation = compensationQuery.data ?? [];

  const latestByEmployee = useMemo(() => {
    const map = new Map<string, EmployeeCompensation>();

    for (const item of compensation) {
      const existing = map.get(item.employeeId);

      if (
        !existing ||
        new Date(item.effectiveFrom).getTime() >
          new Date(existing.effectiveFrom).getTime()
      ) {
        map.set(item.employeeId, item);
      }
    }

    return map;
  }, [compensation]);

  const historyByEmployee = useMemo(() => {
    const map = new Map<string, EmployeeCompensation[]>();

    for (const item of compensation) {
      const list = map.get(item.employeeId) ?? [];
      list.push(item);
      map.set(item.employeeId, list);
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.effectiveFrom).getTime() -
          new Date(a.effectiveFrom).getTime(),
      );
    }

    return map;
  }, [compensation]);

  const createMutation = useMutation({
    mutationFn: () =>
      createCompensation(
        {
          employeeId,
          basicSalary: Number(basicSalary),
          effectiveFrom,
        },
        {
          accessToken,
        },
        branchId,
      ),
    onSuccess: async () => {
      setFormOpen(false);
      setEmployeeId("");
      setBasicSalary("");
      setEffectiveFrom(todayInputValue());
      setFormError("");

      await queryClient.invalidateQueries({
        queryKey: ["payroll", "compensation"],
      });
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to save compensation. Please try again.",
      );
    },
  });

  if (!canView) {
    return null;
  }

  function openCreate() {
    setEmployeeId("");
    setBasicSalary("");
    setEffectiveFrom(todayInputValue());
    setFormError("");
    setFormOpen(true);
  }

  function closeCreate() {
    if (createMutation.isPending) return;
    setFormOpen(false);
    setFormError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!employeeId) {
      setFormError("Select an active employee.");
      return;
    }

    const salary = Number(basicSalary);

    if (!Number.isInteger(salary) || salary <= 0) {
      setFormError("Basic salary must be a whole naira amount greater than zero.");
      return;
    }

    if (!effectiveFrom) {
      setFormError("Effective-from date is required.");
      return;
    }

    createMutation.mutate();
  }

  const employeesWithoutCompensation = visibleEmployees.filter(
    (employee) => !latestByEmployee.has(employee.id),
  ).length;

  return (
    <section
      aria-label="Employee Compensation"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        marginBottom: "28px",
      }}
    >
      <div
        style={{
          ...cardStyle,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          gap: "20px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.75,
            }}
          >
            Payroll setup
          </div>
          <h2 style={{ margin: "6px 0 6px", fontSize: "24px" }}>
            Employee Compensation
          </h2>
          <p style={{ margin: 0, opacity: 0.82 }}>
            Maintain current salaries and historical effective dates before
            generating payroll.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            style={{
              border: "0",
              borderRadius: "10px",
              padding: "11px 16px",
              fontWeight: 800,
              cursor: "pointer",
              background: "#ffffff",
              color: "#0f172a",
            }}
          >
            + Add Compensation
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <div style={cardStyle}>
          <div style={{ ...mutedStyle, fontSize: "13px" }}>
            Active employees
          </div>
          <strong style={{ display: "block", fontSize: "28px", marginTop: 6 }}>
            {employees.length}
          </strong>
        </div>

        <div style={cardStyle}>
          <div style={{ ...mutedStyle, fontSize: "13px" }}>
            Salary configured
          </div>
          <strong style={{ display: "block", fontSize: "28px", marginTop: 6 }}>
            {Math.max(employees.length - employeesWithoutCompensation, 0)}
          </strong>
        </div>

        <div
          style={{
            ...cardStyle,
            border:
              employeesWithoutCompensation > 0
                ? "1px solid #f59e0b"
                : "1px solid #bbf7d0",
            background:
              employeesWithoutCompensation > 0 ? "#fffbeb" : "#f0fdf4",
          }}
        >
          <div style={{ ...mutedStyle, fontSize: "13px" }}>
            Setup required
          </div>
          <strong
            style={{
              display: "block",
              fontSize: "28px",
              marginTop: 6,
              color:
                employeesWithoutCompensation > 0 ? "#b45309" : "#166534",
            }}
          >
            {employeesWithoutCompensation}
          </strong>
        </div>
      </div>

      {canReviewLegacy && (
        <section
          aria-label="Unassigned legacy compensation"
          style={{
            ...cardStyle,
            border: "1px solid #f3c66b",
            background: "linear-gradient(135deg, #fffbeb 0%, #fff 72%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, color: "#92400e", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
                Owner review required
              </p>
              <h3 style={{ margin: "5px 0" }}>Unassigned legacy salaries</h3>
              <p style={{ ...mutedStyle, margin: 0 }}>
                These historical records are not visible to any branch until you assign each one deliberately.
              </p>
            </div>
            <strong style={{ color: "#92400e", fontSize: 28 }}>
              {unassignedLegacyQuery.data?.length ?? (unassignedLegacyQuery.isLoading ? "…" : 0)}
            </strong>
          </div>

          {unassignedLegacyQuery.isLoading ? (
            <p>Checking unassigned records…</p>
          ) : unassignedLegacyQuery.isError ? (
            <p role="alert">
              {unassignedLegacyQuery.error instanceof ApiError
                ? unassignedLegacyQuery.error.message
                : "Unable to load unassigned legacy compensation."}
            </p>
          ) : (unassignedLegacyQuery.data ?? []).length === 0 ? (
            <p style={{ marginBottom: 0, color: "#166534", fontWeight: 650 }}>
              All legacy compensation records have been assigned.
            </p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Employee", "Historical salary", "Effective period", "Eligible branches", "Action"].map((heading) => (
                      <th key={heading} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #f3d69a", fontSize: 12, color: "#78350f" }}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(unassignedLegacyQuery.data ?? []).map((item: UnassignedLegacyCompensation) => {
                    const employeeActive = item.employee.isActive && !item.employee.deletedAt;
                    const eligibleHere = employeeActive && item.employee.branches.some(
                      (membership) => membership.branch.id === branchId && membership.branch.isActive,
                    );
                    const eligibleBranches = item.employee.branches
                      .filter((membership) => membership.branch.isActive)
                      .map((membership) => membership.branch.name);
                    const confirming = confirmAssignmentId === item.id;

                    return (
                      <tr key={item.id}>
                        <td style={{ padding: 10, borderBottom: "1px solid #f1e7d3" }}>
                          <strong>{item.employee.fullName}</strong>
                          <div style={{ ...mutedStyle, fontSize: 12 }}>{item.employee.email || "No email"}</div>
                        </td>
                        <td style={{ padding: 10, borderBottom: "1px solid #f1e7d3", fontWeight: 800 }}>{money(item.basicSalary)}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #f1e7d3" }}>
                          {displayDate(item.effectiveFrom)}{item.effectiveTo ? ` – ${displayDate(item.effectiveTo)}` : " – Current"}
                        </td>
                        <td style={{ padding: 10, borderBottom: "1px solid #f1e7d3" }}>
                          {eligibleBranches.length ? eligibleBranches.join(", ") : "No active branch memberships"}
                        </td>
                        <td style={{ padding: 10, borderBottom: "1px solid #f1e7d3" }}>
                          {!employeeActive ? (
                            <span style={{ color: "#92400e", fontSize: 12 }}>Employee inactive or deleted</span>
                          ) : !eligibleHere ? (
                            <span style={{ color: "#92400e", fontSize: 12 }}>Switch to an eligible branch</span>
                          ) : confirming ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                disabled={assignLegacyMutation.isPending}
                                onClick={() => {
                                  setAssignmentError("");
                                  assignLegacyMutation.mutate(item.id);
                                }}
                              >
                                {assignLegacyMutation.isPending ? "Assigning…" : "Confirm assignment"}
                              </button>
                              <button type="button" onClick={() => setConfirmAssignmentId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setConfirmAssignmentId(item.id)}>
                              Assign to this branch
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {assignmentError && <p role="alert" style={{ color: "#991b1b", marginBottom: 0 }}>{assignmentError}</p>}
          <p style={{ ...mutedStyle, fontSize: 12, marginBottom: 0 }}>
            Assignment moves the historical record to the selected branch; it does not copy it to other branches. Review the employee’s intended salary arrangement before confirming.
          </p>
        </section>
      )}

      {formOpen && canManage && (
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Add Employee Compensation</h3>
              <p style={{ ...mutedStyle, margin: "5px 0 0" }}>
                A new salary automatically preserves the employee's previous
                compensation history.
              </p>
            </div>

            <button type="button" onClick={closeCreate}>
              Close
            </button>
          </div>

          <form
            onSubmit={submit}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              alignItems: "end",
            }}
          >
            <label>
              <span style={{ display: "block", marginBottom: 6 }}>
                Employee
              </span>
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                required
                style={{ width: "100%" }}
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                    {employee.role ? ` — ${employee.role}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 6 }}>
                Basic salary (₦)
              </span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={basicSalary}
                onChange={(event) => setBasicSalary(event.target.value)}
                placeholder="e.g. 150000"
                required
                style={{ width: "100%" }}
              />
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 6 }}>
                Effective from
              </span>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
                style={{ width: "100%" }}
              />
            </label>

            <button
              type="submit"
              disabled={createMutation.isPending}
              style={{
                minHeight: "40px",
                fontWeight: 800,
              }}
            >
              {createMutation.isPending ? "Saving..." : "Save Compensation"}
            </button>
          </form>

          {formError && (
            <p role="alert" style={{ color: "#b91c1c", marginBottom: 0 }}>
              {formError}
            </p>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Employee Salary Register</h3>
            <p style={{ ...mutedStyle, margin: "5px 0 0" }}>
              Current salary is the latest effective compensation available to
              the employee.
            </p>
          </div>

          <input
            type="search"
            aria-label="Search compensation employees"
            placeholder="Search employee..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ minWidth: "240px" }}
          />
        </div>

        {employeesQuery.isLoading || compensationQuery.isLoading ? (
          <p>Loading employee compensation...</p>
        ) : employeesQuery.isError ? (
          <p role="alert">
            {employeesQuery.error instanceof ApiError
              ? employeesQuery.error.message
              : "Unable to load branch employees."}
          </p>
        ) : compensationQuery.isError ? (
          <p role="alert">
            {compensationQuery.error instanceof ApiError
              ? compensationQuery.error.message
              : "Unable to load compensation records."}
          </p>
        ) : visibleEmployees.length === 0 ? (
          <div
            style={{
              padding: "28px",
              textAlign: "center",
              border: "1px dashed #cbd5e1",
              borderRadius: "12px",
              ...mutedStyle,
            }}
          >
            No active employees match your search.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "1050px",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Employee",
                    "Email",
                    "Job Title",
                    "Current Salary",
                    "Effective From",
                    "History",
                    "Status",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        borderBottom: "2px solid #e2e8f0",
                        whiteSpace: "nowrap",
                        fontSize: "13px",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleEmployees.map((employee: ManagedUser) => {
                  const current = latestByEmployee.get(employee.id);
                  const history =
                    historyByEmployee.get(employee.id) ?? [];

                  return (
                    <tr key={employee.id}>
                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <strong>{employee.fullName}</strong>
                      </td>

                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        {employee.email || "—"}
                      </td>

                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        {employee.role || "—"}
                      </td>

                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                          fontWeight: 800,
                        }}
                      >
                        {current ? money(current.basicSalary) : "—"}
                      </td>

                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        {current ? displayDate(current.effectiveFrom) : "—"}
                      </td>

                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        {history.length}
                      </td>

                      <td
                        style={{
                          padding: "14px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        {current ? (
                          <span style={badgeStyle}>● Configured</span>
                        ) : (
                          <span
                            style={{
                              ...badgeStyle,
                              background: "#fef3c7",
                              color: "#92400e",
                            }}
                          >
                            ● Setup required
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {compensation.length > 0 && (
        <details style={cardStyle}>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 800,
              fontSize: "16px",
            }}
          >
            Compensation History
          </summary>

          <div style={{ overflowX: "auto", marginTop: "16px" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "760px",
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px" }}>
                    Employee
                  </th>
                  <th style={{ textAlign: "left", padding: "10px" }}>
                    Salary
                  </th>
                  <th style={{ textAlign: "left", padding: "10px" }}>
                    Effective from
                  </th>
                  <th style={{ textAlign: "left", padding: "10px" }}>
                    Effective to
                  </th>
                  <th style={{ textAlign: "left", padding: "10px" }}>
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {compensation
                  .filter((item) =>
                    employees.some(
                      (employee) => employee.id === item.employeeId,
                    ),
                  )
                  .map((item) => (
                    <tr key={item.id}>
                      <td style={{ padding: "10px" }}>
                        {item.employee.fullName}
                      </td>
                      <td style={{ padding: "10px", fontWeight: 700 }}>
                        {money(item.basicSalary)}
                      </td>
                      <td style={{ padding: "10px" }}>
                        {displayDate(item.effectiveFrom)}
                      </td>
                      <td style={{ padding: "10px" }}>
                        {item.effectiveTo
                          ? displayDate(item.effectiveTo)
                          : "Current"}
                      </td>
                      <td style={{ padding: "10px" }}>
                        {item.effectiveTo ? "Historical" : "Current"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
