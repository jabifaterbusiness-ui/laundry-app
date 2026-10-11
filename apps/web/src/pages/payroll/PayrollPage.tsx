import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import { PayrollCompensationSection } from "./PayrollCompensationSection.js";
import { PayrollApprovalSection } from "./PayrollApprovalSection.js";
import {
  createPayrollPayment,
  createOtherPayrollDeduction,
  createPayrollPeriod,
  finalizePayroll,
  generatePayroll,
  getPayrollStatus,
  listPayrollPeriods,
  processPayrollDeductions,
  voidPayrollPayment,
  updatePayrollEarnings,
  type PayrollPaymentMethod,
  type PayrollPeriodStatus,
} from "../../lib/payroll-api.js";

function money(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-NG", {
    dateStyle: "medium",
  });
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function PayrollPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const queryClient = useQueryClient();

  const canView = hasPermission(user, "payroll.view");
  const canManage = hasPermission(user, "payroll.manage");

  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [paymentRecordId, setPaymentRecordId] = useState("");
  const [paymentEmployeeId, setPaymentEmployeeId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PayrollPaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [editingRecordId, setEditingRecordId] = useState("");
  const [earningsBasicSalary, setEarningsBasicSalary] = useState("");
  const [earningsAllowances, setEarningsAllowances] = useState("");
  const [earningsBonuses, setEarningsBonuses] = useState("");
  const [deductionRecordId, setDeductionRecordId] = useState("");
  const [otherDeductionAmount, setOtherDeductionAmount] = useState("");
  const [otherDeductionReason, setOtherDeductionReason] = useState("");
  const [error, setError] = useState("");

  const periodsQuery = useQuery({
    queryKey: ["payroll", "periods", activeBranchId],
    queryFn: () =>
      listPayrollPeriods({ accessToken }, activeBranchId),
    enabled: Boolean(accessToken && activeBranchId && canView),
  });

  const periods = periodsQuery.data ?? [];

  useEffect(() => {
    const firstPeriod = periods[0];
    if (!selectedPeriodId && firstPeriod) {
      setSelectedPeriodId(firstPeriod.id);
    }
  }, [periods, selectedPeriodId]);

  const statusQuery = useQuery({
    queryKey: ["payroll", "status", selectedPeriodId, activeBranchId],
    queryFn: () =>
      getPayrollStatus(
        selectedPeriodId,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken && activeBranchId && canView && selectedPeriodId,
    ),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["payroll"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createPayrollPeriod(
        { periodStart: start, periodEnd: end },
        { accessToken },
        activeBranchId,
      ),
    onSuccess: async (period) => {
      setStart("");
      setEnd("");
      setSelectedPeriodId(period.id);
      setError("");
      await refresh();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Unable to create payroll period."),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "generate" | "deductions" | "finalize") => {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");

      const auth = {
        accessToken,
        sensitiveAuthorization: authorization,
      };

      if (action === "generate") {
        return generatePayroll(selectedPeriodId, auth, activeBranchId);
      }
      if (action === "deductions") {
        return processPayrollDeductions(selectedPeriodId, auth, activeBranchId);
      }
      return finalizePayroll(selectedPeriodId, auth, activeBranchId);
    },
    onSuccess: refresh,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Payroll action failed."),
  });

  const earningsMutation = useMutation({
    mutationFn: async () => {
      if (!editingRecordId) throw new Error("Select a payroll record first.");
      const values = [
        earningsBasicSalary,
        earningsAllowances,
        earningsBonuses,
      ];
      if (values.some((value) => value.trim() === "" ||
          !Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
        throw new Error("Salary, allowances and bonuses must be non-negative whole numbers.");
      }

      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");

      return updatePayrollEarnings(
        editingRecordId,
        {
          basicSalary: Number(earningsBasicSalary),
          allowances: Number(earningsAllowances),
          bonuses: Number(earningsBonuses),
        },
        { accessToken, sensitiveAuthorization: authorization },
        activeBranchId,
      );
    },
    onSuccess: async () => {
      setEditingRecordId("");
      setError("");
      await refresh();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to update earnings."),
  });

  const otherDeductionMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(otherDeductionAmount);
      const reason = otherDeductionReason.trim();
      if (!deductionRecordId) throw new Error("Select a payroll record first.");
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("Deduction amount must be a positive whole number.");
      }
      if (!reason || reason.length > 1000) {
        throw new Error("Enter a deduction reason of 1–1000 characters.");
      }

      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");

      return createOtherPayrollDeduction(
        deductionRecordId,
        { amount, reason },
        { accessToken, sensitiveAuthorization: authorization },
        activeBranchId,
      );
    },
    onSuccess: async () => {
      setDeductionRecordId("");
      setOtherDeductionAmount("");
      setOtherDeductionReason("");
      setError("");
      await refresh();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to add deduction."),
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");

      return createPayrollPayment(
        {
          payrollRecordId: paymentRecordId,
          employeeId: paymentEmployeeId,
          amount: Number(paymentAmount),
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
          note: paymentNote.trim() || undefined,
        },
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
        activeBranchId,
      );
    },
    onSuccess: async () => {
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentNote("");
      setPaymentRecordId("");
      setPaymentEmployeeId("");
      setError("");
      await refresh();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "Unable to record payroll payment."),
  });

  if (!canView) {
    return (
      <main>
        <h1>Payroll</h1>
        <p>You do not have permission to view payroll.</p>
      </main>
    );
  }

  const status = statusQuery.data;
  const period = status?.payrollPeriod;
  const summary = status?.summary;

  function voidPayment(paymentId: string, amount: number) {
    if (!window.confirm(`Void this payroll payment of ${money(amount)}?`)) {
      return;
    }

    const reason = window.prompt("Enter the reason for voiding this payment:")?.trim();
    if (!reason) return;

    void (async () => {
      try {
        const authorization = await requestSensitiveAuthorization();
        if (!authorization) return;

        await voidPayrollPayment(
          paymentId,
          reason,
          { accessToken, sensitiveAuthorization: authorization },
          activeBranchId,
        );

        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Unable to void payment.");
      }
    })();
  }

  return (
    <main>
      <h1>Payroll</h1>
      <p>Manage payroll periods, deductions, employee payments and payment history.</p>

      {error && <p role="alert">{error}</p>}

      <PayrollCompensationSection
        accessToken={accessToken}
        branchId={activeBranchId}
      />

      <PayrollApprovalSection
        accessToken={accessToken}
        branchId={activeBranchId}
        selectedPeriodId={selectedPeriodId}
      />

      <section>
        <h2>Create Payroll Period</h2>
        {canManage ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <label>
              Start
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>

            <label>
              End
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>

            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Period"}
            </button>
          </form>
        ) : (
          <p>Payroll management permission is required to create periods.</p>
        )}
      </section>

      <section>
        <h2>Payroll Periods</h2>

        {periodsQuery.isLoading && <p>Loading payroll periods...</p>}

        {periods.length === 0 && !periodsQuery.isLoading && (
          <p>No payroll periods found.</p>
        )}

        {periods.length > 0 && (
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
          >
            {periods.map((item) => (
              <option key={item.id} value={item.id}>
                {date(item.periodStart)} — {date(item.periodEnd)} — {item.status}
              </option>
            ))}
          </select>
        )}
      </section>

      {statusQuery.isLoading && <p>Loading payroll...</p>}

      {statusQuery.isError && (
        <p role="alert">
          {statusQuery.error instanceof ApiError
            ? statusQuery.error.message
            : "Unable to load payroll status."}
        </p>
      )}

      {status && period && summary && (
        <>
          <section>
            <h2>Payroll Overview</h2>
            <p>
              <strong>Period:</strong> {date(period.periodStart)} —{" "}
              {date(period.periodEnd)}
            </p>
            <p>
              <strong>Status:</strong> {label(period.status)}
            </p>

            <div>
              <strong>Employees:</strong> {summary.employeeCount}
              {" | "}
              <strong>Gross pay:</strong> {money(summary.totalGrossPay)}
              {" | "}
              <strong>Total deductions:</strong> {money(summary.totalDeductions)}
              {" | "}
              <strong>Net payroll:</strong> {money(summary.totalNetPay)}
              {" | "}
              <strong>Paid:</strong> {money(summary.totalPaid)}
              {" | "}
              <strong>Balance:</strong> {money(summary.totalBalance)}
            </div>

            {canManage && (
              <div>
                {period.status === "OPEN" && (
                  <button
                    type="button"
                    onClick={() => actionMutation.mutate("generate")}
                    disabled={actionMutation.isPending}
                  >
                    Generate Payroll
                  </button>
                )}

                {period.status === "PROCESSING" && (
                  <>
                    {period.approvalStatus !== "PENDING" &&
                      period.approvalStatus !== "APPROVED" && (
                        <button
                          type="button"
                          onClick={() => actionMutation.mutate("deductions")}
                          disabled={actionMutation.isPending}
                        >
                          Process Deductions
                        </button>
                      )}

                    {period.approvalStatus === "APPROVED" ? (
                      <button
                        type="button"
                        onClick={() => actionMutation.mutate("finalize")}
                        disabled={actionMutation.isPending}
                      >
                        Finalize Payroll
                      </button>
                    ) : (
                      <span>
                        Finalization is locked until payroll is approved.
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          <section>
            <h2>Employee Payroll</h2>

            {status.records.length === 0 ? (
              <p>No payroll records.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Gross</th>
                    <th>Deductions</th>
                    <th>Net Pay</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Breakdown / Adjustments</th>
                    {canManage && <th>Payment</th>}
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {status.records.map((record) => (
                    <tr key={record.payrollRecordId}>
                      <td>{record.employee.fullName}</td>
                      <td>{money(record.grossPay)}</td>
                      <td>{money(record.totalDeductions)}</td>
                      <td>{money(record.netPay)}</td>
                      <td>{money(record.amountPaid)}</td>
                      <td>{money(record.balance)}</td>
                      <td>{label(record.paymentStatus)}</td>
                      <td>
                        <details>
                          <summary>View breakdown</summary>
                          <dl>
                            <dt>Basic salary</dt>
                            <dd>{money(record.basicSalary)}</dd>
                            <dt>Allowances</dt>
                            <dd>{money(record.allowances)}</dd>
                            <dt>Bonuses</dt>
                            <dd>{money(record.bonuses)}</dd>
                            <dt>Gross pay</dt>
                            <dd>{money(record.grossPay)}</dd>
                            <dt>Total deductions</dt>
                            <dd>{money(record.totalDeductions)}</dd>
                            <dt>Net pay</dt>
                            <dd>{money(record.netPay)}</dd>
                          </dl>

                          <h4>Deduction details</h4>
                          {record.deductions.length === 0 ? (
                            <p>No deductions recorded.</p>
                          ) : (
                            <ul>
                              {record.deductions.map((deduction, index) => (
                                <li key={deduction.id ?? `${deduction.type}-${index}`}>
                                  {label(deduction.type)} — {money(deduction.amount)}
                                  {deduction.description ? ` · ${deduction.description}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}

                          {canManage &&
                            period.status === "PROCESSING" &&
                            period.approvalStatus !== "PENDING" &&
                            period.approvalStatus !== "APPROVED" &&
                            record.amountPaid === 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRecordId(record.payrollRecordId);
                                    setEarningsBasicSalary(String(record.basicSalary));
                                    setEarningsAllowances(String(record.allowances));
                                    setEarningsBonuses(String(record.bonuses));
                                    setDeductionRecordId("");
                                  }}
                                >
                                  Edit earnings
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeductionRecordId(record.payrollRecordId);
                                    setEditingRecordId("");
                                    setOtherDeductionAmount("");
                                    setOtherDeductionReason("");
                                  }}
                                >
                                  Add other deduction
                                </button>
                              </>
                            )}

                          {editingRecordId === record.payrollRecordId && (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                earningsMutation.mutate();
                              }}
                            >
                              <h4>Edit earnings</h4>
                              <label>
                                Basic salary
                                <input type="number" min="0" step="1" required
                                  value={earningsBasicSalary}
                                  onChange={(e) => setEarningsBasicSalary(e.target.value)} />
                              </label>
                              <label>
                                Allowances
                                <input type="number" min="0" step="1" required
                                  value={earningsAllowances}
                                  onChange={(e) => setEarningsAllowances(e.target.value)} />
                              </label>
                              <label>
                                Bonuses
                                <input type="number" min="0" step="1" required
                                  value={earningsBonuses}
                                  onChange={(e) => setEarningsBonuses(e.target.value)} />
                              </label>
                              <button type="submit" disabled={earningsMutation.isPending}>
                                {earningsMutation.isPending ? "Saving..." : "Save earnings"}
                              </button>
                              <button type="button" onClick={() => setEditingRecordId("")}>
                                Cancel
                              </button>
                            </form>
                          )}

                          {deductionRecordId === record.payrollRecordId && (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                otherDeductionMutation.mutate();
                              }}
                            >
                              <h4>Manual deduction</h4>
                              <label>
                                Amount
                                <input type="number" min="1" step="1" required
                                  value={otherDeductionAmount}
                                  onChange={(e) => setOtherDeductionAmount(e.target.value)} />
                              </label>
                              <label>
                                Reason
                                <textarea required maxLength={1000}
                                  value={otherDeductionReason}
                                  onChange={(e) => setOtherDeductionReason(e.target.value)} />
                              </label>
                              <button type="submit" disabled={otherDeductionMutation.isPending}>
                                {otherDeductionMutation.isPending ? "Saving..." : "Add deduction"}
                              </button>
                              <button type="button" onClick={() => setDeductionRecordId("")}>
                                Cancel
                              </button>
                            </form>
                          )}
                        </details>
                      </td>

                      {canManage && (
                        <td>
                          {record.balance > 0 && period.status === "FINALIZED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentRecordId(record.payrollRecordId);
                                setPaymentEmployeeId(record.employee.id);
                                setPaymentAmount(String(record.balance));
                              }}
                            >
                              Pay
                            </button>
                          )}
                        </td>
                      )}

                      <td>
                        {record.payments.length === 0 ? (
                          "—"
                        ) : (
                          record.payments.map((payment) => (
                            <div key={payment.id}>
                              {money(payment.amount)} · {payment.method} ·{" "}
                              {payment.status}
                              {canManage && payment.status === "POSTED" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    voidPayment(payment.id, payment.amount)
                                  }
                                >
                                  Void
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {canManage &&
            paymentRecordId &&
            period.status === "FINALIZED" && (
              <section>
                <h2>Record Payroll Payment</h2>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    paymentMutation.mutate();
                  }}
                >
                  <label>
                    Amount
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Method
                    <select
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(
                          e.target.value as PayrollPaymentMethod,
                        )
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="TRANSFER">Transfer</option>
                      <option value="POS">POS</option>
                    </select>
                  </label>

                  <label>
                    Reference
                    <input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      maxLength={200}
                    />
                  </label>

                  <label>
                    Note
                    <textarea
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      maxLength={1000}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={paymentMutation.isPending}
                  >
                    {paymentMutation.isPending
                      ? "Recording..."
                      : "Record Payment"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentRecordId("");
                      setPaymentEmployeeId("");
                    }}
                  >
                    Cancel
                  </button>
                </form>
              </section>
            )}
        </>
      )}
    </main>
  );
}
