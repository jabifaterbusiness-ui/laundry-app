import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  approveIOU,
  approveLoan,
  cancelIOU,
  cancelLoan,
  createIOU,
  createLoan,
  createRepayment,
  listIOUs,
  listLoans,
  listRepayments,
  listRepaymentSources,
  rejectIOU,
  rejectLoan,
  voidRepayment,
  type RepaymentMethod,
  type RepaymentType,
} from "../../lib/payroll-financial-api.js";
import { listBranchUsers } from "../../lib/users-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";

type Section = "ious" | "loans" | "repayments";

function money(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-NG", { dateStyle: "medium" });
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function PayrollFinancialPage() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const branchId = useAuthStore((s) => s.activeBranchId);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const queryClient = useQueryClient();

  const canViewIOUs = hasPermission(user, "ious.view");
  const canManageIOUs = hasPermission(user, "ious.manage");
  const canApproveIOUs = hasPermission(user, "ious.approve");
  const canCancelIOUs = hasPermission(user, "ious.cancel");

  const canViewLoans = hasPermission(user, "loans.view");
  const canManageLoans = hasPermission(user, "loans.manage");
  const canApproveLoans = hasPermission(user, "loans.approve");
  const canCancelLoans = hasPermission(user, "loans.cancel");

  const canViewRepayments = hasPermission(user, "repayments.view");
  const canManageRepayments = hasPermission(user, "repayments.manage");
  const canVoidRepayments = hasPermission(user, "repayments.void");

  const allowedSections = useMemo(
    () =>
      [
        ...(canViewIOUs ? (["ious"] as const) : []),
        ...(canViewLoans ? (["loans"] as const) : []),
        ...(canViewRepayments ? (["repayments"] as const) : []),
      ],
    [canViewIOUs, canViewLoans, canViewRepayments],
  );

  const [section, setSection] = useState<Section>("ious");
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [repaymentType, setRepaymentType] = useState<RepaymentType>("IOU");
  const [sourceId, setSourceId] = useState("");
  const [method, setMethod] = useState<RepaymentMethod>("TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const auth = { accessToken };

  const employeesQuery = useQuery({
    queryKey: ["payroll-financial", "employees", branchId],
    queryFn: () => listBranchUsers(branchId!, accessToken!),
    enabled: Boolean(
      branchId &&
      accessToken &&
      (canManageIOUs || canManageLoans || canManageRepayments),
    ),
  });

  const iousQuery = useQuery({
    queryKey: ["payroll-financial", "ious", branchId],
    queryFn: () => listIOUs(branchId!, auth),
    enabled: Boolean(branchId && accessToken && canViewIOUs),
  });

  const loansQuery = useQuery({
    queryKey: ["payroll-financial", "loans", branchId],
    queryFn: () => listLoans(branchId!, auth),
    enabled: Boolean(branchId && accessToken && canViewLoans),
  });

  const repaymentsQuery = useQuery({
    queryKey: ["payroll-financial", "repayments", branchId],
    queryFn: () => listRepayments(branchId!, auth),
    enabled: Boolean(branchId && accessToken && canViewRepayments),
  });

  const repaymentSourcesQuery = useQuery({
    queryKey: ["payroll-financial", "repayment-sources", branchId, employeeId, repaymentType],
    queryFn: () => listRepaymentSources(branchId!, auth, employeeId, repaymentType),
    enabled: Boolean(
      canManageRepayments && branchId && accessToken && employeeId,
    ),
  });

  const employees = (employeesQuery.data ?? [])
    .filter((employee) => employee.isActive)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const ious = iousQuery.data ?? [];
  const loans = loansQuery.data ?? [];
  const repayments = repaymentsQuery.data ?? [];

  const repaymentSources = repaymentSourcesQuery.data ?? [];
  const selectedSource = repaymentSources.find((item) => item.id === sourceId);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["payroll-financial"] });
  };

  async function runAction(
    action: (authorization: string) => Promise<unknown>,
    success: string,
  ) {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) {
        throw new Error("Sensitive authorization was cancelled.");
      }
      await action(authorization);
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitIOU(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchId || !employeeId || !Number.isSafeInteger(Number(amount)) ||
        Number(amount) <= 0 || reason.length > 500) {
      setError("Choose an employee, enter a positive whole-number amount, and keep the reason within 500 characters.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");
      await createIOU(branchId, { ...auth, sensitiveAuthorization: authorization }, {
        employeeId, amount: Number(amount), reason: reason.trim() || undefined,
      });
      setAmount("");
      setReason("");
      await refresh();
      setNotice("IOU request created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create IOU.");
    } finally {
      setBusy(false);
    }
  }

  async function submitLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchId || !employeeId || !Number.isSafeInteger(Number(amount)) ||
        Number(amount) <= 0 || reason.length > 500) {
      setError("Choose an employee, enter a positive whole-number amount, and keep the reason within 500 characters.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");
      await createLoan(branchId, { ...auth, sensitiveAuthorization: authorization }, {
        employeeId, principalAmount: Number(amount), reason: reason.trim() || undefined,
      });
      setAmount("");
      setReason("");
      await refresh();
      setNotice("Loan request created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create loan.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRepayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchId || !employeeId || !sourceId ||
        !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 ||
        reference.length > 200 || note.length > 500) {
      setError("Complete the employee, source, positive whole-number amount, and valid reference/note fields.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const authorization = await requestSensitiveAuthorization();
      if (!authorization) throw new Error("Sensitive authorization was cancelled.");
      await createRepayment(branchId, { ...auth, sensitiveAuthorization: authorization }, {
        employeeId,
        type: repaymentType,
        ...(repaymentType === "IOU" ? { iouId: sourceId } : { loanId: sourceId }),
        amount: Number(amount),
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      setAmount("");
      setReference("");
      setNote("");
      setSourceId("");
      await refresh();
      setNotice("Repayment recorded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record repayment.");
    } finally {
      setBusy(false);
    }
  }

  async function askReason(promptText: string) {
    const value = window.prompt(promptText)?.trim();
    if (!value) return "";
    if (value.length > 500) {
      setError("Reason must not exceed 500 characters.");
      return "";
    }
    return value;
  }

  async function approveOrReject(
    kind: "iou" | "loan",
    id: string,
    action: "approve" | "reject",
  ) {
    const rejectionReason = action === "reject"
      ? await askReason("Enter the reason for rejection:")
      : "";
    if (action === "reject" && !rejectionReason) return;

    await runAction(async (authorization) => {
      const actionAuth = { ...auth, sensitiveAuthorization: authorization };
      if (kind === "iou") {
        return action === "approve"
          ? approveIOU(id, branchId!, actionAuth)
          : rejectIOU(id, branchId!, actionAuth, rejectionReason);
      }
      return action === "approve"
        ? approveLoan(id, branchId!, actionAuth)
        : rejectLoan(id, branchId!, actionAuth, rejectionReason);
    }, `${kind.toUpperCase()} ${action === "approve" ? "approved" : "rejected"}.`);
  }

  async function cancelRequest(kind: "iou" | "loan", id: string) {
    const why = await askReason("Enter the reason for cancellation:");
    if (!why) return;

    await runAction(async (authorization) => {
      const actionAuth = { ...auth, sensitiveAuthorization: authorization };
      return kind === "iou"
        ? cancelIOU(id, branchId!, actionAuth)
        : cancelLoan(id, branchId!, actionAuth);
    }, `${kind.toUpperCase()} cancelled.`);
  }

  async function handleVoid(id: string) {
    const why = await askReason("Enter the reason for voiding this repayment:");
    if (!why) return;

    await runAction(async (authorization) => {
      return voidRepayment(id, branchId!, {
        ...auth, sensitiveAuthorization: authorization,
      }, why);
    }, "Repayment voided.");
  }

  if (!allowedSections.length) {
    return (
      <main>
        <h1>Staff Finance</h1>
        <p role="alert">You do not have permission to view IOUs, loans, or repayments.</p>
      </main>
    );
  }

  const currentSection = allowedSections.includes(section) ? section : allowedSections[0];

  return (
    <main style={{ display: "grid", gap: 20, paddingBottom: 32 }}>
      <header>
        <p style={{ color: "#64748b", marginBottom: 4 }}>PAYROLL & STAFF FINANCE</p>
        <h1 style={{ margin: "0 0 8px" }}>Staff Finance</h1>
        <p style={{ color: "#64748b", margin: 0 }}>
          Manage staff IOUs, loans and repayments for the selected branch.
        </p>
      </header>

      {!branchId ? (
        <p role="alert">Select an active branch before managing staff finance.</p>
      ) : null}

      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
      {notice ? <p role="status" style={{ color: "#166534" }}>{notice}</p> : null}

      <nav aria-label="Staff finance sections" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {allowedSections.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={currentSection === item}
            onClick={() => setSection(item)}
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 9,
              padding: "10px 16px",
              background: currentSection === item ? "#0f172a" : "#fff",
              color: currentSection === item ? "#fff" : "#0f172a",
              cursor: "pointer",
            }}
          >
            {item === "ious" ? "IOUs" : item === "loans" ? "Loans" : "Repayments"}
          </button>
        ))}
      </nav>

      {currentSection === "ious" && canViewIOUs ? (
        <section style={{ display: "grid", gap: 16 }}>
          {canManageIOUs ? (
            <form onSubmit={submitIOU} style={panelStyle}>
              <h2>New IOU request</h2>
              <div style={formGridStyle}>
                <label>Employee
                  <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                    <option value="">Select employee</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
                  </select>
                </label>
                <label>Amount (₦)
                  <input required type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>Reason
                  <input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </div>
              <button disabled={busy || !branchId}>Create IOU</button>
            </form>
          ) : null}

          <section style={panelStyle}>
            <h2>IOU requests</h2>
            {iousQuery.isLoading ? <p>Loading IOUs…</p> : null}
            {iousQuery.isError ? <p role="alert">Unable to load IOUs. Refresh and try again.</p> : null}
            {!iousQuery.isLoading && !ious.length ? <p>No IOU requests found for this branch.</p> : null}
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th>Employee</th><th>Amount</th><th>Outstanding</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {ious.map((item) => (
                    <tr key={item.id}>
                      <td>{item.employee?.fullName ?? employees.find((e) => e.id === item.employeeId)?.fullName ?? item.employeeId}</td>
                      <td>{money(item.amount)}</td><td>{money(item.outstandingAmount)}</td>
                      <td>{label(item.status)}</td><td>{date(item.createdAt)}</td>
                      <td><div style={actionStyle}>
                        {canApproveIOUs && item.status === "PENDING" ? <>
                          <button disabled={busy} onClick={() => void approveOrReject("iou", item.id, "approve")}>Approve</button>
                          <button disabled={busy} onClick={() => void approveOrReject("iou", item.id, "reject")}>Reject</button>
                        </> : null}
                        {canCancelIOUs && ["PENDING", "APPROVED"].includes(item.status) ?
                          <button disabled={busy} onClick={() => void cancelRequest("iou", item.id)}>Cancel</button> : null}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {currentSection === "loans" && canViewLoans ? (
        <section style={{ display: "grid", gap: 16 }}>
          {canManageLoans ? (
            <form onSubmit={submitLoan} style={panelStyle}>
              <h2>New loan request</h2>
              <div style={formGridStyle}>
                <label>Employee
                  <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                    <option value="">Select employee</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
                  </select>
                </label>
                <label>Principal amount (₦)
                  <input required type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>Reason
                  <input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </div>
              <button disabled={busy || !branchId}>Create loan</button>
            </form>
          ) : null}

          <section style={panelStyle}>
            <h2>Loan requests</h2>
            {loansQuery.isLoading ? <p>Loading loans…</p> : null}
            {loansQuery.isError ? <p role="alert">Unable to load loans. Refresh and try again.</p> : null}
            {!loansQuery.isLoading && !loans.length ? <p>No loan requests found for this branch.</p> : null}
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th>Employee</th><th>Principal</th><th>Outstanding</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {loans.map((item) => (
                    <tr key={item.id}>
                      <td>{item.employee?.fullName ?? employees.find((e) => e.id === item.employeeId)?.fullName ?? item.employeeId}</td>
                      <td>{money(item.principalAmount)}</td><td>{money(item.outstandingAmount)}</td>
                      <td>{label(item.status)}</td><td>{date(item.createdAt)}</td>
                      <td><div style={actionStyle}>
                        {canApproveLoans && item.status === "PENDING" ? <>
                          <button disabled={busy} onClick={() => void approveOrReject("loan", item.id, "approve")}>Approve</button>
                          <button disabled={busy} onClick={() => void approveOrReject("loan", item.id, "reject")}>Reject</button>
                        </> : null}
                        {canCancelLoans && ["PENDING", "APPROVED"].includes(item.status) ?
                          <button disabled={busy} onClick={() => void cancelRequest("loan", item.id)}>Cancel</button> : null}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {currentSection === "repayments" && canViewRepayments ? (
        <section style={{ display: "grid", gap: 16 }}>
          {canManageRepayments ? (
            <form onSubmit={submitRepayment} style={panelStyle}>
              <h2>Record repayment</h2>
              <div style={formGridStyle}>
                <label>Employee
                  <select required value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setSourceId(""); }}>
                    <option value="">Select employee</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
                  </select>
                </label>
                <label>Repayment type
                  <select value={repaymentType} onChange={(e) => { setRepaymentType(e.target.value as RepaymentType); setSourceId(""); }}>
                    <option value="IOU">IOU</option><option value="LOAN">Loan</option>
                  </select>
                </label>
                <label>Outstanding source
                  <select required value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                    <option value="">
                      {repaymentSourcesQuery.isLoading
                        ? "Loading outstanding sources…"
                        : repaymentSources.length
                          ? "Select source"
                          : "No outstanding sources available"}
                    </option>
                    {repaymentSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.type === "IOU" ? "IOU" : "Loan"} · {money(source.outstandingAmount)} · {label(source.status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>Amount (₦)
                  <input required type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label>Method
                  <select value={method} onChange={(e) => setMethod(e.target.value as RepaymentMethod)}>
                    <option value="CASH">Cash</option><option value="TRANSFER">Transfer</option><option value="POS">POS</option>
                  </select>
                </label>
                <label>Reference
                  <input maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>Note
                  <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {repaymentSourcesQuery.isError ? (
                <p role="alert">Unable to load outstanding sources. Refresh and try again.</p>
              ) : null}
              {selectedSource ? (
                <p style={{ color: "#64748b" }}>
                  Selected {selectedSource.type === "IOU" ? "IOU" : "loan"} outstanding: {money(selectedSource.outstandingAmount)}
                </p>
              ) : null}
              <button disabled={busy || !branchId}>Record repayment</button>
            </form>
          ) : null}

          <section style={panelStyle}>
            <h2>Repayment history</h2>
            {repaymentsQuery.isLoading ? <p>Loading repayments…</p> : null}
            {repaymentsQuery.isError ? <p role="alert">Unable to load repayments. Refresh and try again.</p> : null}
            {!repaymentsQuery.isLoading && !repayments.length ? <p>No repayments found for this branch.</p> : null}
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th>Employee</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {repayments.map((item) => (
                    <tr key={item.id}>
                      <td>{item.employee?.fullName ?? employees.find((e) => e.id === item.employeeId)?.fullName ?? item.employeeId}</td>
                      <td>{item.type}</td><td>{money(item.amount)}</td><td>{item.method}</td>
                      <td>{item.reference || "—"}</td><td>{item.status}</td><td>{date(item.createdAt)}</td>
                      <td>{canVoidRepayments && item.status === "POSTED" ?
                        <button disabled={busy} onClick={() => void handleVoid(item.id)}>Void</button> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 20,
  background: "#fff",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.05)",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const actionStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};
