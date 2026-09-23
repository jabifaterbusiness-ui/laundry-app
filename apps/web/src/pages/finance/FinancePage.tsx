import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseStatus,
  approveExpense,
  createExpense,
  getFinancialStatement,
  listExpenses,
  recognizeExpense,
  rejectExpense,
  voidExpense,
} from "../../lib/finance-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfCurrentMonth(): string {
  const now = new Date();
  return dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function label(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function FinancePage() {
  const queryClient = useQueryClient();
  const { accessToken, activeBranchId, user } = useAuthStore();

  const [from, setFrom] = useState(startOfCurrentMonth);
  const [to, setTo] = useState(() => dateInputValue(new Date()));
  const [newExpenseCategory, setNewExpenseCategory] =
    useState<ExpenseCategory | "">("");
  const [expenseFilterCategory, setExpenseFilterCategory] =
    useState<ExpenseCategory | "">("");
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(() =>
    dateInputValue(new Date()),
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");

  const canViewReports = hasPermission(user, "reports.view");
  const canViewExpenses = hasPermission(user, "expenses.view");
  const canCreateExpense = hasPermission(user, "expenses.manage");
  const canApproveExpense = hasPermission(user, "expenses.approve");
  const canRecognizeExpense = hasPermission(user, "expenses.recognize");
  const canVoidExpense = hasPermission(user, "expenses.void");

  const statementQuery = useQuery({
    queryKey: ["finance", "statement", activeBranchId, from, to],
    enabled: Boolean(accessToken && activeBranchId && canViewReports),
    queryFn: () =>
      getFinancialStatement(
        { from, to },
        { accessToken },
        activeBranchId,
      ),
  });

  const expensesQuery = useQuery({
    queryKey: ["finance", "expenses", activeBranchId, expenseFilterCategory, status],
    enabled: Boolean(accessToken && activeBranchId && canViewExpenses),
    queryFn: () =>
      listExpenses(
        {
          category: expenseFilterCategory || undefined,
          status: status || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
  });

  const invalidateFinance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance", "statement"] }),
      queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createExpense(
        {
          category: newExpenseCategory || "OTHER",
          description: description.trim(),
          amount: Number(amount),
          incurredAt,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
    onSuccess: async () => {
      setDescription("");
      setAmount("");
      setReference("");
      setNote("");
      setActionError("");
      await invalidateFinance();
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Failed to create expense.",
      );
    },
  });

  const expenseAction = async (
    action: () => Promise<unknown>,
    successMessage?: string,
  ) => {
    try {
      setActionError("");
      await action();
      await invalidateFinance();
      if (successMessage) {
        setActionError(successMessage);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The expense action failed.",
      );
    }
  };

  const statement = statementQuery.data;
  const expenses = expensesQuery.data ?? [];

  if (!canViewReports && !canViewExpenses) {
    return (
      <main className="page-container">
        <h1>Finance</h1>
        <p>You do not have permission to view financial information.</p>
      </main>
    );
  }

  return (
    <main className="page-container">
      <header>
        <h1>Finance</h1>
        <p>
          Financial performance, recognized expenses, and expense approvals for
          the selected branch.
        </p>
      </header>

      <section aria-labelledby="finance-period-heading">
        <h2 id="finance-period-heading">Statement period</h2>
        <div>
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>{" "}
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      {statementQuery.isLoading && <p>Loading financial statement…</p>}
      {statementQuery.error instanceof Error && (
        <p role="alert">{statementQuery.error.message}</p>
      )}

      {statement && canViewReports && (
        <section aria-labelledby="finance-overview-heading">
          <h2 id="finance-overview-heading">Financial overview</h2>

          <div>
            <article>
              <h3>Gross invoiced</h3>
              <strong>{formatMoney(statement.revenue.grossInvoiced)}</strong>
            </article>

            <article>
              <h3>Refunds</h3>
              <strong>{formatMoney(statement.revenue.refunds)}</strong>
            </article>

            <article>
              <h3>Net revenue</h3>
              <strong>{formatMoney(statement.revenue.netRevenue)}</strong>
            </article>

            <article>
              <h3>Total expenses</h3>
              <strong>{formatMoney(statement.expenses.total)}</strong>
            </article>

            <article>
              <h3>Profit / Loss</h3>
              <strong>
                {formatMoney(statement.profitOrLoss.amount)}{" "}
                {label(statement.profitOrLoss.type)}
              </strong>
            </article>
          </div>

          <p>
            Period: {formatDate(statement.period.from)} to{" "}
            {formatDate(statement.period.to)}
          </p>
        </section>
      )}

      {statement && canViewReports && (
        <section aria-labelledby="finance-breakdown-heading">
          <h2 id="finance-breakdown-heading">Expense breakdown</h2>

          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(statement.expenses.byCategory).length === 0 ? (
                <tr>
                  <td colSpan={2}>No recognized expenses in this period.</td>
                </tr>
              ) : (
                Object.entries(statement.expenses.byCategory).map(
                  ([key, value]) => (
                    <tr key={key}>
                      <td>{label(key)}</td>
                      <td>{formatMoney(value)}</td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </section>
      )}

      {canCreateExpense && (
        <section aria-labelledby="create-expense-heading">
          <h2 id="create-expense-heading">Record expense</h2>

          <form
            onSubmit={(event) => {
              event.preventDefault();

              if (!description.trim() || !amount || Number(amount) <= 0) {
                setActionError(
                  "Enter a description and a valid positive amount.",
                );
                return;
              }

              createMutation.mutate();
            }}
          >
            <p>
              <label>
                Category{" "}
                <select
                  value={newExpenseCategory}
                  onChange={(event) =>
                    setNewExpenseCategory(
                      event.target.value as ExpenseCategory | "",
                    )
                  }
                >
                  <option value="">Other</option>
                  {EXPENSE_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </select>
              </label>
            </p>

            <p>
              <label>
                Description{" "}
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  required
                />
              </label>
            </p>

            <p>
              <label>
                Amount (NGN){" "}
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </label>
            </p>

            <p>
              <label>
                Incurred date{" "}
                <input
                  type="date"
                  value={incurredAt}
                  onChange={(event) => setIncurredAt(event.target.value)}
                  required
                />
              </label>
            </p>

            <p>
              <label>
                Reference{" "}
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  maxLength={200}
                />
              </label>
            </p>

            <p>
              <label>
                Note{" "}
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                />
              </label>
            </p>

            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Record expense"}
            </button>
          </form>
        </section>
      )}

      {canViewExpenses && (
        <section aria-labelledby="expense-management-heading">
          <h2 id="expense-management-heading">Expense management</h2>

          <div>
            <label>
              Category{" "}
              <select
                value={expenseFilterCategory}
                onChange={(event) =>
                  setExpenseFilterCategory(
                    event.target.value as ExpenseCategory | "",
                  )
                }
              >
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>{" "}
            <label>
              Status{" "}
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ExpenseStatus | "")
                }
              >
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="VOID">Void</option>
              </select>
            </label>
          </div>

          {expensesQuery.isLoading && <p>Loading expenses…</p>}

          {expensesQuery.error instanceof Error && (
            <p role="alert">{expensesQuery.error.message}</p>
          )}

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Recognized</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.slice(0, 100).map((expense) => (
                <tr key={expense.id}>
                  <td>{formatDate(expense.incurredAt)}</td>
                  <td>{label(expense.category)}</td>
                  <td>{expense.description}</td>
                  <td>{formatMoney(expense.amount)}</td>
                  <td>{label(expense.status)}</td>
                  <td>{formatDateTime(expense.recognizedAt)}</td>
                  <td>
                    {expense.status === "PENDING" && canApproveExpense && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void expenseAction(() =>
                              approveExpense(
                                expense.id,
                                { accessToken },
                                activeBranchId,
                              ),
                            )
                          }
                        >
                          Approve
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() => {
                            const reason = window.prompt(
                              "Optional rejection reason:",
                            );

                            void expenseAction(() =>
                              rejectExpense(
                                expense.id,
                                reason || undefined,
                                { accessToken },
                                activeBranchId,
                              ),
                            );
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {expense.status === "APPROVED" &&
                      !expense.recognizedAt &&
                      canRecognizeExpense && (
                        <button
                          type="button"
                          onClick={() =>
                            void expenseAction(() =>
                              recognizeExpense(
                                expense.id,
                                { accessToken },
                                activeBranchId,
                              ),
                            )
                          }
                        >
                          Recognize
                        </button>
                      )}

                    {expense.status !== "VOID" && canVoidExpense && (
                      <button
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Void this expense of ${formatMoney(expense.amount)}? This action cannot be undone.`,
                          );

                          if (!confirmed) {
                            return;
                          }

                          void expenseAction(() =>
                            voidExpense(
                              expense.id,
                              { accessToken },
                              activeBranchId,
                            ),
                          );
                        }}
                      >
                        Void
                      </button>
                    )}

                    {expense.status !== "PENDING" &&
                      expense.status !== "APPROVED" &&
                      expense.status !== "VOID" &&
                      !canVoidExpense && <span>—</span>}
                  </td>
                </tr>
              ))}

              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7}>No expenses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}
