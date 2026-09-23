import { useEffect, useState } from "react";
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
  getFinancialStatementConfig,
  updateFinancialStatementConfig,
  listFinancialStatementRecipients,
  createFinancialStatementRecipient,
  updateFinancialStatementRecipient,
  removeFinancialStatementRecipient,
  type FinancialStatementConfig,
} from "../../lib/finance-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { getCurrentUser } from "../../lib/auth-api.js";
import { ApiError } from "../../lib/api-client.js";
import { listUsers } from "../../lib/users-api.js";
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
  const { accessToken, activeBranchId, user, setUser } = useAuthStore();

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
  const [permissionsRefreshing, setPermissionsRefreshing] = useState(
    Boolean(accessToken),
  );

  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [deliveryDay, setDeliveryDay] = useState("1");
  const [deliveryHour, setDeliveryHour] = useState("8");
  const [deliveryMinute, setDeliveryMinute] = useState("0");
  const [deliveryEmailEnabled, setDeliveryEmailEnabled] = useState(true);
  const [deliveryWhatsappEnabled, setDeliveryWhatsappEnabled] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState("");

  const [dailyDeliveryEnabled, setDailyDeliveryEnabled] = useState(false);
  const [dailyDeliveryHour, setDailyDeliveryHour] = useState("8");
  const [dailyDeliveryMinute, setDailyDeliveryMinute] = useState("0");
  const [dailyDeliveryEmailEnabled, setDailyDeliveryEmailEnabled] = useState(true);
  const [dailyDeliveryWhatsappEnabled, setDailyDeliveryWhatsappEnabled] = useState(false);

  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipientUserId, setSelectedRecipientUserId] = useState("");
  const [recipientWhatsapp, setRecipientWhatsapp] = useState("");
  const [recipientMessage, setRecipientMessage] = useState("");

  const canViewReports = hasPermission(user, "reports.view");
  const canViewExpenses = hasPermission(user, "expenses.view");
  const canCreateExpense = hasPermission(user, "expenses.manage");
  const canApproveExpense = hasPermission(user, "expenses.approve");
  const canRecognizeExpense = hasPermission(user, "expenses.recognize");
  const canVoidExpense = hasPermission(user, "expenses.void");
  const canManageReports = hasPermission(user, "reports.manage");

  useEffect(() => {
    let cancelled = false;

    if (!accessToken) {
      return;
    }

    setPermissionsRefreshing(true);

    getCurrentUser(accessToken)
      .then((currentUser) => {
        if (!cancelled) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        // Keep the existing session if the refresh cannot be completed.
        // Server-side authorization remains authoritative.
      })
      .finally(() => {
        if (!cancelled) {
          setPermissionsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, setUser]);

  const statementQuery = useQuery({
    queryKey: ["finance", "statement", activeBranchId, from, to],
enabled: Boolean(accessToken && activeBranchId && canViewReports && !permissionsRefreshing),
    queryFn: () =>
      getFinancialStatement(
        { from, to },
        { accessToken },
        activeBranchId,
      ),
  });

  const expensesQuery = useQuery({
    queryKey: ["finance", "expenses", activeBranchId, expenseFilterCategory, status],
enabled: Boolean(accessToken && activeBranchId && canViewExpenses && !permissionsRefreshing),
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

  const deliveryConfigQuery = useQuery({
    queryKey: ["finance", "delivery-config"],
enabled: Boolean(accessToken && canViewReports && !permissionsRefreshing),
    queryFn: () => getFinancialStatementConfig({ accessToken }),
  });

  const deliveryRecipientsQuery = useQuery({
    queryKey: ["finance", "delivery-recipients"],
enabled: Boolean(accessToken && canViewReports && !permissionsRefreshing),
    queryFn: () => listFinancialStatementRecipients({ accessToken }),
  });

  const recipientUsersQuery = useQuery({
    queryKey: ["finance", "delivery-users", recipientSearch],
enabled: Boolean(accessToken && canManageReports && !permissionsRefreshing),
    queryFn: () =>
      listUsers({
        accessToken: accessToken as string,
        status: "active",
        search: recipientSearch,
      }),
  });

  const invalidateFinance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance", "statement"] }),
      queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] }),
    ]);
  };

  const deliveryConfigMutation = useMutation({
    mutationFn: () => {
      if (
        deliveryEnabled &&
        !deliveryEmailEnabled &&
        !deliveryWhatsappEnabled
      ) {
        throw new Error(
          "At least one delivery channel must be enabled when statements are enabled.",
        );
      }

      if (
        dailyDeliveryEnabled &&
        !dailyDeliveryEmailEnabled &&
        !dailyDeliveryWhatsappEnabled
      ) {
        throw new Error(
          "At least one daily delivery channel must be enabled when daily statements are enabled.",
        );
      }

      return updateFinancialStatementConfig(
        {
          enabled: deliveryEnabled,
          dayOfMonth: Number(deliveryDay),
          hour: Number(deliveryHour),
          minute: Number(deliveryMinute),
          emailEnabled: deliveryEmailEnabled,
          whatsappEnabled: deliveryWhatsappEnabled,
          dailyEnabled: dailyDeliveryEnabled,
          dailyHour: Number(dailyDeliveryHour),
          dailyMinute: Number(dailyDeliveryMinute),
          dailyEmailEnabled: dailyDeliveryEmailEnabled,
          dailyWhatsappEnabled: dailyDeliveryWhatsappEnabled,
        },
        { accessToken },
      );
    },
    onSuccess: async (config: FinancialStatementConfig) => {
      setDeliveryEnabled(config.enabled);
      setDeliveryDay(String(config.dayOfMonth));
      setDeliveryHour(String(config.hour));
      setDeliveryMinute(String(config.minute));
      setDeliveryEmailEnabled(config.emailEnabled);
      setDeliveryWhatsappEnabled(config.whatsappEnabled);
      setDailyDeliveryEnabled(config.dailyEnabled);
      setDailyDeliveryHour(String(config.dailyHour));
      setDailyDeliveryMinute(String(config.dailyMinute));
      setDailyDeliveryEmailEnabled(config.dailyEmailEnabled);
      setDailyDeliveryWhatsappEnabled(config.dailyWhatsappEnabled);
      setDeliveryMessage("Delivery settings saved.");
      await queryClient.invalidateQueries({
        queryKey: ["finance", "delivery-config"],
      });
    },
    onError: (error) => {
      setDeliveryMessage(
        error instanceof Error
          ? error.message
          : "Failed to save delivery settings.",
      );
    },
  });

  const createRecipientMutation = useMutation({
    mutationFn: () => {
      if (!selectedRecipientUserId) {
        throw new Error("Select a user to add as a recipient.");
      }

      if (
        recipientWhatsapp &&
        !/^\+[1-9]\d{7,14}$/.test(recipientWhatsapp)
      ) {
        throw new Error(
          "WhatsApp number must use E.164 format, for example +2348012345678.",
        );
      }

      return createFinancialStatementRecipient(
        {
          userId: selectedRecipientUserId,
          ...(recipientWhatsapp
            ? { whatsappNumber: recipientWhatsapp }
            : {}),
        },
        { accessToken },
      );
    },
    onSuccess: async () => {
      setSelectedRecipientUserId("");
      setRecipientWhatsapp("");
      setRecipientMessage("Recipient added.");
      await queryClient.invalidateQueries({
        queryKey: ["finance", "delivery-recipients"],
      });
    },
    onError: (error) => {
      setRecipientMessage(
        error instanceof Error ? error.message : "Failed to add recipient.",
      );
    },
  });

  const updateRecipientMutation = useMutation({
    mutationFn: ({
      recipientId,
      whatsappNumber,
      enabled,
    }: {
      recipientId: string;
      whatsappNumber?: string | null;
      enabled?: boolean;
    }) =>
      updateFinancialStatementRecipient(
        recipientId,
        {
          ...(whatsappNumber !== undefined ? { whatsappNumber } : {}),
          ...(enabled !== undefined ? { enabled } : {}),
        },
        { accessToken },
      ),
    onSuccess: async () => {
      setRecipientMessage("Recipient updated.");
      await queryClient.invalidateQueries({
        queryKey: ["finance", "delivery-recipients"],
      });
    },
    onError: (error) => {
      setRecipientMessage(
        error instanceof Error
          ? error.message
          : "Failed to update recipient.",
      );
    },
  });

  const removeRecipientMutation = useMutation({
    mutationFn: (recipientId: string) =>
      removeFinancialStatementRecipient(recipientId, { accessToken }),
    onSuccess: async () => {
      setRecipientMessage("Recipient removed.");
      await queryClient.invalidateQueries({
        queryKey: ["finance", "delivery-recipients"],
      });
    },
    onError: (error) => {
      setRecipientMessage(
        error instanceof Error
          ? error.message
          : "Failed to remove recipient.",
      );
    },
  });

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
  const deliveryConfig = deliveryConfigQuery.data;
  const deliveryRecipients = deliveryRecipientsQuery.data ?? [];
  const recipientUsers = recipientUsersQuery.data ?? [];

  useEffect(() => {
    if (!deliveryConfig || deliveryConfigMutation.isPending) {
      return;
    }

    setDeliveryEnabled(deliveryConfig.enabled);
    setDeliveryDay(String(deliveryConfig.dayOfMonth));
    setDeliveryHour(String(deliveryConfig.hour));
    setDeliveryMinute(String(deliveryConfig.minute));
    setDeliveryEmailEnabled(deliveryConfig.emailEnabled);
    setDeliveryWhatsappEnabled(deliveryConfig.whatsappEnabled);
    setDailyDeliveryEnabled(deliveryConfig.dailyEnabled);
    setDailyDeliveryHour(String(deliveryConfig.dailyHour));
    setDailyDeliveryMinute(String(deliveryConfig.dailyMinute));
    setDailyDeliveryEmailEnabled(deliveryConfig.dailyEmailEnabled);
    setDailyDeliveryWhatsappEnabled(deliveryConfig.dailyWhatsappEnabled);
  }, [deliveryConfig, deliveryConfigMutation.isPending]);

  if (!canViewReports && !canViewExpenses) {
    return (
      <main className="page-container finance-page">
        <h1>Finance</h1>
        <p>You do not have permission to view financial information.</p>
      </main>
    );
  }

  return (
    <main className="page-container finance-page">
      <header>
        <h1>Finance</h1>
        <p>
          Financial performance, recognized expenses, and expense approvals for
          the selected branch.
        </p>
      </header>

      <section className="finance-section finance-period-section" aria-labelledby="finance-period-heading">
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
        <section className="finance-section finance-overview-section" aria-labelledby="finance-overview-heading">
          <h2 id="finance-overview-heading">Financial overview</h2>

          <div className="finance-kpi-grid">
            <article className="finance-kpi finance-kpi-revenue">
              <h3>Gross invoiced</h3>
              <strong>{formatMoney(statement.revenue.grossInvoiced)}</strong>
            </article>

            <article className="finance-kpi finance-kpi-refunds">
              <h3>Refunds</h3>
              <strong>{formatMoney(statement.revenue.refunds)}</strong>
            </article>

            <article className="finance-kpi finance-kpi-net">
              <h3>Net revenue</h3>
              <strong>{formatMoney(statement.revenue.netRevenue)}</strong>
            </article>

            <article className="finance-kpi finance-kpi-expenses">
              <h3>Total expenses</h3>
              <strong>{formatMoney(statement.expenses.total)}</strong>
            </article>

            <article className="finance-kpi finance-kpi-profit">
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
        <section className="finance-section finance-breakdown-section" aria-labelledby="finance-breakdown-heading">
          <h2 id="finance-breakdown-heading">Expense breakdown</h2>

          <div className="finance-table-wrap">
            <table className="finance-table">
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
          </div>
        </section>
      )}

      {canViewReports && (
        <section className="finance-section finance-delivery-section" aria-labelledby="financial-statement-delivery-heading">
          <h2 id="financial-statement-delivery-heading">
            Automatic financial statement delivery
          </h2>

          {deliveryConfigQuery.isLoading && (
            <p>Loading delivery settings…</p>
          )}

          {deliveryConfigQuery.error instanceof Error && (
            <p role="alert">{deliveryConfigQuery.error.message}</p>
          )}

          {deliveryConfig && (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();

                  if (
                    deliveryEnabled &&
                    !deliveryEmailEnabled &&
                    !deliveryWhatsappEnabled
                  ) {
                    setDeliveryMessage(
                      "At least one delivery channel must be enabled when statements are enabled.",
                    );
                    return;
                  }

                  const day = Number(deliveryDay);
                  const hour = Number(deliveryHour);
                  const minute = Number(deliveryMinute);

                  if (
                    !Number.isInteger(day) ||
                    day < 1 ||
                    day > 28 ||
                    !Number.isInteger(hour) ||
                    hour < 0 ||
                    hour > 23 ||
                    !Number.isInteger(minute) ||
                    minute < 0 ||
                    minute > 59
                  ) {
                    setDeliveryMessage(
                      "Enter a valid schedule: day 1–28, hour 0–23, and minute 0–59.",
                    );
                    return;
                  }

                  deliveryConfigMutation.mutate();
                }}
              >
                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={deliveryEnabled}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDeliveryEnabled(event.target.checked)
                      }
                    />{" "}
                    Automatically send the monthly financial statement
                  </label>
                </p>

                <p>
                  The statement is generated for the previous month and
                  delivered to enabled recipients on the scheduled day.
                </p>

                <p>
                  <label>
                    Day of month{" "}
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={deliveryDay}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDeliveryDay(event.target.value)
                      }
                    />
                  </label>
                </p>

                <p>
                  <label>
                    Hour{" "}
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={deliveryHour}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDeliveryHour(event.target.value)
                      }
                    />
                  </label>{" "}
                  <label>
                    Minute{" "}
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={deliveryMinute}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDeliveryMinute(event.target.value)
                      }
                    />
                  </label>
                </p>

                <fieldset disabled={!canManageReports}>
                  <legend>Delivery channels</legend>

                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={deliveryEmailEnabled}
                        onChange={(event) =>
                          setDeliveryEmailEnabled(event.target.checked)
                        }
                      />{" "}
                      Email
                    </label>
                  </p>

                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={deliveryWhatsappEnabled}
                        onChange={(event) =>
                          setDeliveryWhatsappEnabled(event.target.checked)
                        }
                      />{" "}
                      WhatsApp
                    </label>
                  </p>
                </fieldset>

                <hr />

                <h3>Daily financial statement delivery</h3>

                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={dailyDeliveryEnabled}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDailyDeliveryEnabled(event.target.checked)
                      }
                    />{" "}
                    Automatically send the daily financial statement
                  </label>
                </p>

                <p>
                  The statement is generated for the previous local calendar
                  day and delivered at the scheduled time.
                </p>

                <p>
                  <label>
                    <span>Daily hour</span>{" "}
                    <input
                      aria-label="Daily hour"
                      type="number"
                      min="0"
                      max="23"
                      value={dailyDeliveryHour}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDailyDeliveryHour(event.target.value)
                      }
                    />
                  </label>{" "}
                  <label>
                    <span>Daily minute</span>{" "}
                    <input
                      aria-label="Daily minute"
                      type="number"
                      min="0"
                      max="59"
                      value={dailyDeliveryMinute}
                      disabled={!canManageReports}
                      onChange={(event) =>
                        setDailyDeliveryMinute(event.target.value)
                      }
                    />
                  </label>
                </p>

                <fieldset disabled={!canManageReports}>
                  <legend>Daily delivery channels</legend>

                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={dailyDeliveryEmailEnabled}
                        aria-label="Daily Email"
                        onChange={(event) =>
                          setDailyDeliveryEmailEnabled(event.target.checked)
                        }
                      />{" "}
                      Email
                    </label>
                  </p>

                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={dailyDeliveryWhatsappEnabled}
                        aria-label="Daily WhatsApp"
                        onChange={(event) =>
                          setDailyDeliveryWhatsappEnabled(event.target.checked)
                        }
                      />{" "}
                      WhatsApp
                    </label>
                  </p>
                </fieldset>

                {canManageReports && (
                  <button
                    type="submit"
                    disabled={deliveryConfigMutation.isPending}
                  >
                    {deliveryConfigMutation.isPending
                      ? "Saving…"
                      : "Save delivery settings"}
                  </button>
                )}
              </form>

              {deliveryMessage && <p role="status">{deliveryMessage}</p>}
            </>
          )}

          <section className="finance-subsection finance-recipients-section" aria-labelledby="financial-statement-recipients-heading">
            <h3 id="financial-statement-recipients-heading">
              Authorized recipients
            </h3>

            <p>
              Only enabled recipients receive scheduled financial statements.
              The active Business Owner must remain a recipient.
            </p>

            {canManageReports && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  createRecipientMutation.mutate();
                }}
              >
                <p>
                  <label>
                    Search active users{" "}
                    <input
                      value={recipientSearch}
                      onChange={(event) =>
                        setRecipientSearch(event.target.value)
                      }
                      placeholder="Name or email"
                    />
                  </label>
                </p>

                <p>
                  <label>
                    Recipient{" "}
                    <select
                      value={selectedRecipientUserId}
                      onChange={(event) =>
                        setSelectedRecipientUserId(event.target.value)
                      }
                      required
                    >
                      <option value="">Select a user</option>
                      {recipientUsers
                        .filter(
                          (candidate) =>
                            !deliveryRecipients.some(
                              (recipient) =>
                                recipient.userId === candidate.id,
                            ),
                        )
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.fullName} — {candidate.email}
                          </option>
                        ))}
                    </select>
                  </label>
                </p>

                <p>
                  <label>
                    WhatsApp number{" "}
                    <input
                      value={recipientWhatsapp}
                      onChange={(event) =>
                        setRecipientWhatsapp(event.target.value)
                      }
                      placeholder="+2348012345678"
                      inputMode="tel"
                    />
                  </label>
                </p>

                <button
                  type="submit"
                  disabled={
                    createRecipientMutation.isPending ||
                    !selectedRecipientUserId
                  }
                >
                  {createRecipientMutation.isPending
                    ? "Adding…"
                    : "Add recipient"}
                </button>
              </form>
            )}

            {recipientUsersQuery.isLoading && canManageReports && (
              <p>Loading active users…</p>
            )}

            {deliveryRecipientsQuery.isLoading && (
              <p>Loading recipients…</p>
            )}

            {deliveryRecipientsQuery.error instanceof Error && (
              <p role="alert">{deliveryRecipientsQuery.error.message}</p>
            )}

            {deliveryRecipients.length === 0 ? (
              <p>No financial statement recipients configured.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>WhatsApp</th>
                    <th>Status</th>
                    {canManageReports && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {deliveryRecipients.map((recipient) => {
                    const isActiveBusinessOwner =
                      recipient.user.role === "BUSINESS_OWNER" &&
                      recipient.user.isActive;

                    return (
                      <tr key={recipient.id}>
                        <td>{recipient.user.fullName}</td>
                        <td>{recipient.user.email}</td>
                        <td>{label(recipient.user.role)}</td>
                        <td>{recipient.whatsappNumber || "—"}</td>
                        <td>
                          {recipient.enabled ? "Enabled" : "Disabled"}
                        </td>

                        {canManageReports && (
                          <td>
                            <button
                              type="button"
                              disabled={
                                updateRecipientMutation.isPending ||
                                isActiveBusinessOwner
                              }
                              onClick={() =>
                                updateRecipientMutation.mutate({
                                  recipientId: recipient.id,
                                  enabled: !recipient.enabled,
                                })
                              }
                            >
                              {recipient.enabled ? "Disable" : "Enable"}
                            </button>{" "}

                            <button
                              type="button"
                              disabled={
                                removeRecipientMutation.isPending ||
                                isActiveBusinessOwner
                              }
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `Remove ${recipient.user.fullName} as a financial statement recipient?`,
                                );

                                if (!confirmed) {
                                  return;
                                }

                                removeRecipientMutation.mutate(recipient.id);
                              }}
                            >
                              Remove
                            </button>

                            {isActiveBusinessOwner && (
                              <span>
                                {" "}
                                Business Owner must remain a recipient
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {recipientMessage && <p role="status">{recipientMessage}</p>}
          </section>
        </section>
      )}

      {canCreateExpense && (
        <section className="finance-section finance-record-section" aria-labelledby="create-expense-heading">
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
        <section className="finance-section finance-expenses-section" aria-labelledby="expense-management-heading">
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

          <div className="finance-table-wrap">
            <table className="finance-table finance-expense-table">
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
          </div>
        </section>
      )}

      {actionError && <p role="alert">{actionError}</p>}
    </main>
  );
}
