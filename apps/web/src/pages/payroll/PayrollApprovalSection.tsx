import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import {
  approvePayroll,
  declinePayroll,
  getPayrollStatus,
  listPayrollPeriods,
  submitPayrollForApproval,
  type PayrollPeriod,
} from "../../lib/payroll-api.js";

type Props = {
  accessToken: string | null;
  branchId: string | null;
  selectedPeriodId: string;
};

function money(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

function date(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-NG", {
    dateStyle: "medium",
  });
}

export function PayrollApprovalSection({
  accessToken,
  branchId,
  selectedPeriodId,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const queryClient = useQueryClient();

  const canView = hasPermission(user, "payroll.view");
  const canManage = hasPermission(user, "payroll.manage");
  const canApprove = hasPermission(user, "payroll.approve");

  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const query = useQuery({
    queryKey: ["payroll", "approval-queue", branchId],
    queryFn: () => listPayrollPeriods({ accessToken }, branchId),
    enabled: Boolean(accessToken && branchId && canView && (canManage || canApprove)),
  });

  const periods = query.data ?? [];

  const selectedPeriod = useMemo(
    () => periods.find((item) => item.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  const reviewQuery = useQuery({
    queryKey: ["payroll", "status", selectedPeriodId, branchId],
    queryFn: () => getPayrollStatus(selectedPeriodId, { accessToken }, branchId),
    enabled: Boolean(accessToken && branchId && canApprove && selectedPeriodId),
  });

  const pendingPeriods = useMemo(
    () => periods.filter((item) => item.approvalStatus === "PENDING"),
    [periods],
  );

  const actionMutation = useMutation({
    mutationFn: async (action: "submit" | "approve" | "decline") => {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) {
        throw new Error("Sensitive authorization was cancelled.");
      }

      const auth = {
        accessToken,
        sensitiveAuthorization: authorization,
      };

      if (!selectedPeriodId) {
        throw new Error("Select a payroll period first.");
      }

      if (action === "submit") {
        return submitPayrollForApproval(
          selectedPeriodId,
          auth,
          branchId,
        );
      }

      if (action === "approve") {
        return approvePayroll(
          selectedPeriodId,
          auth,
          branchId,
        );
      }

      const cleanReason = reason.trim();
      if (!cleanReason) {
        throw new Error("A decline reason is required.");
      }

      return declinePayroll(
        selectedPeriodId,
        cleanReason,
        auth,
        branchId,
      );
    },
    onSuccess: async () => {
      setReason("");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e) => {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Unable to complete payroll approval action.",
      );
    },
  });

  if (!canView || (!canManage && !canApprove)) {
    return null;
  }

  const approvalStatus = selectedPeriod?.approvalStatus ?? "NOT_SUBMITTED";

  const canSubmit =
    canManage &&
    selectedPeriod?.status === "PROCESSING" &&
    (approvalStatus === "NOT_SUBMITTED" || approvalStatus === "DECLINED");

  const canDecide =
    canApprove &&
    selectedPeriod?.status === "PROCESSING" &&
    approvalStatus === "PENDING" &&
    selectedPeriod.approvalSubmittedById !== user?.id;

  return (
    <section
      aria-label="Payroll Approval Centre"
      style={{
        marginTop: 24,
        border: "1px solid #e2e8f0",
        borderRadius: 18,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 12px 34px rgba(15,23,42,.07)",
      }}
    >
      <div
        style={{
          padding: "22px 24px",
          background: "linear-gradient(135deg,#172554,#1e3a8a 55%,#0f766e)",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 18,
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                opacity: .8,
              }}
            >
              Payroll Control
            </div>
            <h2 style={{ margin: "6px 0" }}>Approval Centre</h2>
            <p style={{ margin: 0, opacity: .9, maxWidth: 760 }}>
              Payroll is prepared first, independently approved, and only then
              finalized.
            </p>
          </div>

          <div
            style={{
              minWidth: 120,
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,.12)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, opacity: .75 }}>
              Pending
            </div>
            <strong style={{ fontSize: 28 }}>
              {pendingPeriods.length}
            </strong>
          </div>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              background: "#f8fafc",
            }}
          >
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#64748b",
            }}>
              Selected period
            </div>
            <strong style={{ display: "block", marginTop: 7 }}>
              {selectedPeriod
                ? `${date(selectedPeriod.periodStart)} — ${date(selectedPeriod.periodEnd)}`
                : "No period selected"}
            </strong>
          </div>

          <div
            style={{
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              background: "#f8fafc",
            }}
          >
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#64748b",
            }}>
              Approval status
            </div>
            <strong style={{ display: "block", marginTop: 7 }}>
              {approvalStatus.replaceAll("_", " ")}
            </strong>
          </div>

          <div
            style={{
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              background: "#f8fafc",
            }}
          >
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#64748b",
            }}>
              Last decision
            </div>
            <strong style={{ display: "block", marginTop: 7 }}>
              {selectedPeriod?.approvalDecidedAt
                ? date(selectedPeriod.approvalDecidedAt)
                : "No decision yet"}
            </strong>
          </div>
        </div>

        {canApprove && selectedPeriod && (
          <section aria-label="Read-only employee payroll review" style={{ marginBottom: 24 }}>
            <h3>Employee payroll review (read-only)</h3>
            <p>Review each employee's earnings and deductions before making an approval decision. This section does not permit changes.</p>
            {reviewQuery.isLoading && <p>Loading employee payroll review...</p>}
            {reviewQuery.isError && (
              <p role="alert">
                {reviewQuery.error instanceof ApiError
                  ? reviewQuery.error.message
                  : "Unable to load employee payroll review."}
              </p>
            )}
            {reviewQuery.data && (
              <>
                <div
                  aria-label="Payroll approval totals"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  {[
                    ["Employees", reviewQuery.data.summary.employeeCount.toLocaleString("en-NG")],
                    ["Total gross pay", money(reviewQuery.data.summary.totalGrossPay)],
                    ["Total deductions", money(reviewQuery.data.summary.totalDeductions)],
                    ["Total net pay", money(reviewQuery.data.summary.totalNetPay)],
                    ["Total paid", money(reviewQuery.data.summary.totalPaid)],
                    ["Outstanding", money(reviewQuery.data.summary.totalBalance)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        minWidth: 0,
                        padding: "13px 14px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                        {label}
                      </div>
                      <strong style={{ display: "block", marginTop: 6, fontSize: 18 }}>
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 14,
                    marginBottom: 16,
                    color: "#475569",
                    fontSize: 13,
                  }}
                >
                  <span>Paid: <strong>{reviewQuery.data.summary.paidCount}</strong></span>
                  <span>Partially paid: <strong>{reviewQuery.data.summary.partiallyPaidCount}</strong></span>
                  <span>Unpaid: <strong>{reviewQuery.data.summary.unpaidCount}</strong></span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Basic salary</th>
                        <th>Allowances</th>
                        <th>Bonuses</th>
                        <th>Gross pay</th>
                        <th>Deductions</th>
                        <th>Net pay</th>
                        <th>Paid</th>
                        <th>Outstanding</th>
                        <th>Payment status</th>
                        <th>Deduction details</th>
                        <th>Payment history</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewQuery.data.records.map((record) => (
                        <tr key={record.payrollRecordId}>
                          <td>
                            <strong>{record.employee.fullName}</strong>
                            {record.employee.email && (
                              <div style={{ color: "#64748b", fontSize: 12 }}>{record.employee.email}</div>
                            )}
                            {record.employee.role && (
                              <div style={{ color: "#64748b", fontSize: 12 }}>{record.employee.role}</div>
                            )}
                          </td>
                          <td>{money(record.basicSalary)}</td>
                          <td>{money(record.allowances)}</td>
                          <td>{money(record.bonuses)}</td>
                          <td>{money(record.grossPay)}</td>
                          <td>{money(record.totalDeductions)}</td>
                          <td>{money(record.netPay)}</td>
                          <td>{money(record.amountPaid)}</td>
                          <td>{money(record.balance)}</td>
                          <td>{record.paymentStatus.replaceAll("_", " ")}</td>
                          <td>
                            {record.deductions.length === 0
                              ? "None"
                              : record.deductions.map((deduction, index) => (
                                  <div key={deduction.id ?? `${deduction.type}-${index}`}>
                                    <strong>{deduction.type.replaceAll("_", " ")}: {money(deduction.amount)}</strong>
                                    {deduction.description ? <div>{deduction.description}</div> : null}
                                  </div>
                                ))}
                          </td>
                          <td>
                            {record.payments.length === 0
                              ? "No payments posted"
                              : record.payments.map((payment) => (
                                  <div key={payment.id} style={{ marginBottom: 6 }}>
                                    <strong>{money(payment.amount)} · {payment.method}</strong>
                                    <div style={{ color: "#64748b", fontSize: 12 }}>
                                      {date(payment.createdAt)} · {payment.status}
                                    </div>
                                    {payment.reference && <div>Ref: {payment.reference}</div>}
                                    {payment.note && <div>{payment.note}</div>}
                                  </div>
                                ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {selectedPeriod?.approvalReason && (
          <div
            style={{
              padding: 16,
              marginBottom: 20,
              borderRadius: 14,
              border: "1px solid #fed7aa",
              background: "#fff7ed",
            }}
          >
            <strong>Decision / decline reason</strong>
            <div style={{ marginTop: 6 }}>
              {selectedPeriod.approvalReason}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          {canSubmit && (
            <button
              type="button"
              onClick={() => actionMutation.mutate("submit")}
              disabled={actionMutation.isPending}
            >
              {approvalStatus === "DECLINED"
                ? "Resubmit for Approval"
                : "Submit for Approval"}
            </button>
          )}

          {canDecide && (
            <>
              <button
                type="button"
                onClick={() => actionMutation.mutate("approve")}
                disabled={actionMutation.isPending}
              >
                Approve Payroll
              </button>

              <input
                aria-label="Decline reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason for declining"
                maxLength={1000}
              />

              <button
                type="button"
                onClick={() => actionMutation.mutate("decline")}
                disabled={actionMutation.isPending || !reason.trim()}
              >
                Decline Payroll
              </button>
            </>
          )}

          {approvalStatus === "PENDING" &&
            canApprove &&
            selectedPeriod?.approvalSubmittedById === user?.id && (
              <span>
                You submitted this payroll. An independent authorized
                approver must decide it.
              </span>
            )}

          {approvalStatus === "APPROVED" && (
            <strong>
              Approved — payroll is ready for finalization.
            </strong>
          )}
        </div>

        {canApprove && (
          <div style={{ marginTop: 26 }}>
            <h3>Pending approval queue</h3>

            {query.isLoading ? (
              <p>Loading approval queue...</p>
            ) : pendingPeriods.length === 0 ? (
              <p>No payroll periods are currently waiting for approval.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Selected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPeriods.map((item: PayrollPeriod) => (
                      <tr key={item.id}>
                        <td>
                          {date(item.periodStart)} — {date(item.periodEnd)}
                        </td>
                        <td>{date(item.approvalSubmittedAt)}</td>
                        <td>PENDING</td>
                        <td>
                          {item.id === selectedPeriodId
                            ? "Current"
                            : "Choose from Payroll Periods"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
