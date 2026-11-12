import { useEffect, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { getCustomer, listCustomers } from "../../lib/customers-api.js";
import { getOrder } from "../../lib/orders-api.js";
import { saveOrderWorkspaceState } from "../../lib/order-workspace-persistence.js";
import { listOfflineSyncOperations } from "../../lib/offline-sync-queue.js";
import {
  createCloudBackupRun,
  getCloudBackupSettings,
  listCloudBackupConnections,
} from "../../lib/data-management-api.js";
import { publishCloudBackupNotification } from "../../lib/cloud-backup-notifications.js";
import { useSensitiveAuthorization } from "../auth/SensitiveAuthorizationProvider.js";
import { createManualLocalBackup } from "../data-management/LocalBackupManager.js";
import {
  executeQuickOperation,
} from "../../lib/quick-operations-api.js";
import type { QuickOperationDefinition } from "../../lib/quick-operations-catalog.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useOrderWorkspaceStore } from "../../state/order-workspace-store.js";

interface Props {
  operation: QuickOperationDefinition | null;
  initialRecordId?: string;
  onClose: () => void;
}

const IMPLEMENTED_OPERATIONS = [
  "MCB",
  "MLB",
  "MU",
  "TO",
  "TC",
  "MC",
  "VO",
  "RF",
  "RI",
  "RS",
  "RC",
  "SI",
  "SR",
  "SO",
  "SC",
  "SOS",
] as const;

function isImplemented(code: string) {
  return IMPLEMENTED_OPERATIONS.includes(
    code as (typeof IMPLEMENTED_OPERATIONS)[number],
  );
}

function fieldLabel(code: string) {
  switch (code) {
    case "MU":
    case "TO":
    case "SO":
      return "Order ID";
    case "TC":
    case "MC":
    case "SC":
      return "Customer ID";
    case "VO":
    case "RF":
      return "Payment ID";
    case "RI":
    case "RS":
    case "RC":
      return "Invoice ID";
    case "SI":
    case "SR":
      return "Inventory Item ID";
    default:
      return "Record ID";
  }
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: 7,
  fontSize: 14,
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
};

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  min,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input
        aria-label={label}
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
      />
    </div>
  );
}

export function QuickOperationLauncher({
  operation,
  initialRecordId = "",
  onClose,
}: Props) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const user = useAuthStore((state) => state.user);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  const workspaces = useOrderWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useOrderWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const openWorkspace = useOrderWorkspaceStore(
    (state) => state.openWorkspace,
  );
  const switchWorkspace = useOrderWorkspaceStore(
    (state) => state.switchWorkspace,
  );
  const clearWorkspaces = useOrderWorkspaceStore(
    (state) => state.clearWorkspaces,
  );

  const pendingOrderMutations = useIsMutating({
    mutationKey: ["orders"],
  });

  const [recordId, setRecordId] = useState(initialRecordId);
  const [customerId, setCustomerId] = useState("");
  const [targetCustomerSearch, setTargetCustomerSearch] = useState("");
  const [targetCustomers, setTargetCustomers] = useState<Array<{ id: string; name: string; phone: string; ownerBranchId: string | null }>>([]);
  const [targetCustomersLoading, setTargetCustomersLoading] = useState(false);
  const [targetCustomersError, setTargetCustomersError] = useState<string | null>(null);
  const [sourceOrderCustomerId, setSourceOrderCustomerId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("RECEIVED");
  const [method, setMethod] = useState("CASH");
  const [receiptType, setReceiptType] = useState("CUSTOMER");
  const [channel, setChannel] = useState("EMAIL");
  const [backupPassword, setBackupPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setRecordId(initialRecordId);
    setCustomerId("");
    setTargetCustomerSearch("");
    setTargetCustomers([]);
    setTargetCustomersError(null);
    setSourceOrderCustomerId(null);
    setQuantity("1");
    setAmount("");
    setReason("");
    setReference("");
    setNote("");
    setStatus("RECEIVED");
    setMethod("CASH");
    setReceiptType("CUSTOMER");
    setChannel("EMAIL");
    setBackupPassword("");
    setConfirmed(false);
    setIsSubmitting(false);
    setError(null);
    setSuccess(null);
  }, [operation, initialRecordId]);

  useEffect(() => {
    if (!operation || (operation.code !== "MC" && operation.code !== "TO") || !accessToken || !activeBranchId) {
      setTargetCustomers([]);
      setTargetCustomersLoading(false);
      return;
    }

    let active = true;
    setTargetCustomersLoading(true);
    setTargetCustomersError(null);
    listCustomers({
      page: 1,
      pageSize: 100,
      search: targetCustomerSearch.trim() || undefined,
      status: "all",
    }, { accessToken })
      .then((response) => {
        if (!active) return;
        const sourceCustomerId = operation.code === "MC" ? recordId : sourceOrderCustomerId;
        setTargetCustomers(response.data
          .filter((customer) => customer.lifecycleStatus !== "MERGED" && customer.ownerBranchId === activeBranchId && customer.id !== sourceCustomerId)
          .map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone, ownerBranchId: customer.ownerBranchId })));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setTargetCustomersError(error instanceof Error ? error.message : "Unable to load destination customers.");
      })
      .finally(() => {
        if (active) setTargetCustomersLoading(false);
      });

    return () => { active = false; };
  }, [operation?.code, accessToken, activeBranchId, targetCustomerSearch, recordId, sourceOrderCustomerId]);

  useEffect(() => {
    if (operation?.code !== "TO" || !recordId.trim() || !accessToken || !activeBranchId) {
      setSourceOrderCustomerId(null);
      return;
    }
    let active = true;
    getOrder(recordId.trim(), { accessToken }, activeBranchId)
      .then((order) => { if (active) setSourceOrderCustomerId(order.customerId); })
      .catch(() => { if (active) setSourceOrderCustomerId(null); });
    return () => { active = false; };
  }, [operation?.code, recordId, accessToken, activeBranchId]);

  useEffect(() => {
    if (!operation) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [operation, isSubmitting, onClose]);

  if (!operation) {
    return null;
  }

  const activeOperation = operation;
  const implemented = isImplemented(activeOperation.code);

  function validate(): Record<string, unknown> | null {
    if (activeOperation.code === "MCB" || activeOperation.code === "MLB" || activeOperation.code === "SOS") {
      return {};
    }

    if (!recordId.trim()) {
      setError(`${fieldLabel(activeOperation.code)} is required.`);
      return null;
    }

    switch (activeOperation.code) {
      case "MU":
        return {
          orderId: recordId.trim(),
          status,
        };

      case "TO":
        if (!customerId.trim()) {
          setError("Target Customer ID is required.");
          return null;
        }

        return {
          orderId: recordId.trim(),
          customerId: customerId.trim(),
        };

      case "TC":
      case "MC":
        if (!customerId.trim()) {
          setError("Target Customer ID is required.");
          return null;
        }

        return {
          customerId: recordId.trim(),
          targetCustomerId: customerId.trim(),
        };

      case "VO":
        return {
          paymentId: recordId.trim(),
        };

      case "RF": {
        const parsedAmount = Number(amount);

        if (
          !Number.isInteger(parsedAmount) ||
          parsedAmount <= 0
        ) {
          setError("Refund amount must be a positive whole number.");
          return null;
        }

        return {
          paymentId: recordId.trim(),
          amount: parsedAmount,
          method,
          ...(reference.trim()
            ? { reference: reference.trim() }
            : {}),
          ...(note.trim()
            ? { note: note.trim() }
            : {}),
        };
      }

      case "RI":
        return {
          invoiceId: recordId.trim(),
          receiptType,
        };

      case "RS":
        return {
          invoiceId: recordId.trim(),
          channel,
        };

      case "RC":
        return {
          invoiceId: recordId.trim(),
        };

      case "SO":
        return {
          orderId: recordId.trim(),
        };

      case "SC":
        return {
          customerId: recordId.trim(),
        };

      case "SI":
      case "SR": {
        const parsedQuantity = Number(quantity);

        if (
          !Number.isInteger(parsedQuantity) ||
          parsedQuantity < 1
        ) {
          setError("Quantity must be a positive whole number.");
          return null;
        }

        return {
          inventoryItemId: recordId.trim(),
          quantity: parsedQuantity,
          ...(reference.trim()
            ? { reference: reference.trim() }
            : {}),
        };
      }

      default:
        setError("This Quick Operation is not supported.");
        return null;
    }
  }

  async function switchToOrder(orderId: string) {
    const order = await getOrder(
      orderId,
      { accessToken },
      activeBranchId,
    );

    const existingWorkspace = workspaces.find(
      (workspace) => workspace.activeOrder?.id === order.id,
    );

    if (existingWorkspace) {
      switchWorkspace(existingWorkspace.id);
      return;
    }

    const customer = await getCustomer(order.customerId, {
      accessToken,
    });

    const workspaceId = openWorkspace(customer, {
      order,
      draft: {
        customerId: customer.id,
      },
    });

    switchWorkspace(workspaceId);
  }

  async function switchToCustomer(customerIdToSwitch: string) {
    const customer = await getCustomer(customerIdToSwitch, {
      accessToken,
    });

    const existingWorkspace = workspaces.find(
      (workspace) => workspace.customer.id === customer.id,
    );

    if (existingWorkspace) {
      switchWorkspace(existingWorkspace.id);
      return;
    }

    openWorkspace(customer);
  }

  async function submit() {
    setError(null);
    setSuccess(null);

    if (!implemented) {
      setError(
        `Quick operation ${activeOperation.code} is not implemented yet.`,
      );
      return;
    }

    if (activeOperation.code === "MLB" && backupPassword.length < 12) {
      setError("Use an encryption password of at least 12 characters for this local backup.");
      return;
    }

    if (
      activeOperation.sensitive &&
      !reason.trim()
    ) {
      setError("A reason is required for this sensitive operation.");
      return;
    }

    if (
      activeOperation.requiresConfirmation &&
      !confirmed
    ) {
      setError(
        "Please confirm that you want to perform this operation.",
      );
      return;
    }

    if (
      activeOperation.code === "SOS" &&
      pendingOrderMutations > 0
    ){
      setError(
        "SOS is temporarily blocked while an order operation is still in progress. Please wait and try again.",
      );
      return;
    }

    const input = validate();

    if (!input) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (activeOperation.code === "MLB" || activeOperation.code === "MCB") {
        if (user?.securityRole !== "BUSINESS_OWNER") {
          throw new Error("Only the Business Owner can run manual backups.");
        }
      }

      if (activeOperation.code === "MLB") {
        if (!user?.businessId) {
          throw new Error("A business account is required to create a local backup.");
        }
        const backup = await createManualLocalBackup(
          user.businessId,
          backupPassword,
          { accessToken },
        );
        setSuccess(`Encrypted local backup saved as ${backup.fileName} in ${backup.destination}.`);
        return;
      }

      if (activeOperation.code === "MCB") {
        publishCloudBackupNotification({
          status: "progress",
          title: "Manual cloud backup",
          message: "Preparing your encrypted backup and checking the configured cloud destination.",
          source: "manual",
        });
        const [connections, settings] = await Promise.all([
          listCloudBackupConnections({ accessToken }),
          getCloudBackupSettings({ accessToken }),
        ]);
        const verified = connections.filter(
          (connection) => connection.status === "CONNECTED" && Boolean(connection.verifiedAt),
        );
        const destination =
          verified.find((connection) => connection.id === settings.destinationConnectionId) ??
          verified[0];
        if (!destination) {
          throw new Error("No verified cloud destination is available. Connect and verify a cloud provider in Backup & Data Management before using MCB.");
        }
        const authorization = await requestSensitiveAuthorization();
        if (!authorization) {
          throw new Error("Sensitive authorization was cancelled. No cloud backup was started.");
        }
        const run = await createCloudBackupRun(destination.id, {
          accessToken,
          sensitiveAuthorization: authorization,
        });
        if (run.status !== "SUCCEEDED") {
          throw new Error(run.errorMessage || "The cloud backup did not complete successfully.");
        }
        publishCloudBackupNotification({
          status: "success",
          title: "Manual cloud backup",
          message: `Encrypted backup saved successfully to ${destination.displayName}.`,
          source: "manual",
          runId: run.id,
        });
        setSuccess(`Cloud backup completed successfully using ${destination.displayName}.`);
        return;
      }

      if (activeOperation.code === "SOS") {
        if (!user?.businessId || !activeBranchId) {
          throw new Error(
            "A valid business, user, and active branch are required to safely stop the application.",
          );
        }

        saveOrderWorkspaceState(
          user.businessId,
          user.id,
          activeBranchId,
          workspaces,
          activeWorkspaceId,
        );

        const pendingOfflineOperations =
          await listOfflineSyncOperations(
            user.businessId,
            activeBranchId,
            "PENDING",
          );

        await executeQuickOperation(
          {
            code: activeOperation.code === "TO" ? "TI" : activeOperation.code === "MC" ? "MA" : activeOperation.code,
            input: {
              pendingOfflineOperationCount:
                pendingOfflineOperations.length,
            },
            confirmed,
            reason: reason.trim(),
          },
          { accessToken },
          activeBranchId,
        );

        clearWorkspaces();

        setSuccess(
          "Safe stop completed. Your active order workspace has been safely saved.",
        );

        onClose();
        return;
      }

      if (activeOperation.code === "SO") {
        await executeQuickOperation(
          {
            code: activeOperation.code === "TO" ? "TI" : activeOperation.code === "MC" ? "MA" : activeOperation.code,
            input,
            confirmed,
          },
          { accessToken },
          activeBranchId,
        );

        await switchToOrder(recordId.trim());

        setSuccess("Order workspace switched successfully.");
        onClose();
        return;
      }

      if (activeOperation.code === "SC") {
        await executeQuickOperation(
          {
            code: activeOperation.code === "TO" ? "TI" : activeOperation.code === "MC" ? "MA" : activeOperation.code,
            input,
            confirmed,
          },
          { accessToken },
          activeBranchId,
        );

        await switchToCustomer(recordId.trim());

        setSuccess("Customer workspace switched successfully.");
        onClose();
        return;
      }

      const response = await executeQuickOperation(
        {
          code: activeOperation.code === "TO" ? "TI" : activeOperation.code === "MC" ? "MA" : activeOperation.code,
          input,
          confirmed,
          ...(reason.trim()
            ? { reason: reason.trim() }
            : {}),
        },
        { accessToken },
        activeBranchId,
      );

      if (activeOperation.code === "RI") {
        const result = response.result as {
          receiptType?: string;
        };

        setSuccess(
          `${result.receiptType ?? receiptType} receipt loaded successfully.`,
        );
      } else if (activeOperation.code === "RC") {
        const result = response.result as {
          reconciled?: boolean;
          issueCount?: number;
        };

        setSuccess(
          result.reconciled
            ? "Reconciliation completed successfully with no outstanding issues."
            : `Reconciliation completed with ${result.issueCount ?? 0} issue(s).`,
        );
      } else {
        setSuccess(
          `${activeOperation.name} completed successfully.`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "The operation could not be completed. Please try again.";
      if (activeOperation.code === "MCB") {
        publishCloudBackupNotification({
          status: "error",
          title: "Manual cloud backup",
          message,
          source: "manual",
        });
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const showRecordId = activeOperation.code !== "SOS" && activeOperation.code !== "MCB" && activeOperation.code !== "MLB";

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.38)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${activeOperation.code} ${activeOperation.name}`}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.22)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid #eee",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 42,
                height: 30,
                padding: "0 8px",
                borderRadius: 7,
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {activeOperation.code}
            </span>

            <h2 style={{ margin: 0, fontSize: 20 }}>
              {activeOperation.name}
            </h2>
          </div>

          <p
            style={{
              margin: "10px 0 0",
              color: "#555",
              lineHeight: 1.5,
              fontSize: 14,
            }}
          >
            {activeOperation.description}
          </p>
        </div>

        <div style={{ padding: 20 }}>
          {!implemented ? (
            <div
              style={{
                padding: 14,
                borderRadius: 8,
                background: "#f6f6f6",
                color: "#555",
                lineHeight: 1.5,
              }}
            >
              This operation is not currently available.
            </div>
          ) : (
            <>
              {activeOperation.code === "MLB" ? (
        <Field
          label="Backup encryption password (minimum 12 characters)"
          value={backupPassword}
          onChange={setBackupPassword}
          type="password"
          placeholder="Enter a strong backup password"
          disabled={isSubmitting}
        />
      ) : null}

      {activeOperation.code === "MCB" ? (
        <div style={{ padding: 14, borderRadius: 8, background: "#eef6ff", color: "#174a78", lineHeight: 1.5, fontSize: 13 }}>
          LaundryAngel will use your last selected verified cloud destination, or the first verified destination if none is selected. Your backup remains encrypted before upload.
        </div>
      ) : null}

      {showRecordId ? (
                <Field
                  label={fieldLabel(activeOperation.code)}
                  value={recordId}
                  onChange={setRecordId}
                  placeholder="Enter ID"
                  disabled={isSubmitting}
                />
              ) : null}

              {activeOperation.code === "MU" ? (
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>New Order Status</label>
                  <select
                    aria-label="New Order Status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    disabled={isSubmitting}
                    style={inputStyle}
                  >
                    <option value="RECEIVED">Received</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              ) : null}

              {activeOperation.code === "TO" || activeOperation.code === "MC" ? (
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>Find destination customer</label>
                  <input
                    aria-label="Find destination customer"
                    value={targetCustomerSearch}
                    onChange={(event) => setTargetCustomerSearch(event.target.value)}
                    placeholder="Search by customer name, phone or email"
                    disabled={isSubmitting}
                    style={inputStyle}
                  />
                  <label style={{ ...labelStyle, marginTop: 12 }}>Target Customer</label>
                  <select
                    aria-label="Target Customer ID"
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    disabled={isSubmitting || targetCustomersLoading}
                    style={inputStyle}
                  >
                    <option value="">Select a customer in this branch</option>
                    {targetCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} — {customer.phone}
                      </option>
                    ))}
                  </select>
                  {targetCustomersLoading ? <p role="status">Loading branch customers…</p> : null}
                  {targetCustomersError ? <p role="alert">{targetCustomersError}</p> : null}
                  {!targetCustomersLoading && !targetCustomersError && targetCustomers.length === 0 ? (
                    <p>No other eligible customers found in this branch.</p>
                  ) : null}
                </div>
              ) : activeOperation.code === "TC" ? (
                <Field
                  label="Target Customer ID"
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Enter target customer ID"
                  disabled={isSubmitting}
                />
              ) : null}

              {activeOperation.code === "RF" ? (
                <>
                  <Field
                    label="Refund Amount"
                    value={amount}
                    onChange={setAmount}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Enter amount"
                    disabled={isSubmitting}
                  />

                  <div style={{ marginTop: 14 }}>
                    <label style={labelStyle}>Refund Method</label>
                    <select
                      aria-label="Refund Method"
                      value={method}
                      onChange={(event) => setMethod(event.target.value)}
                      disabled={isSubmitting}
                      style={inputStyle}
                    >
                      <option value="CASH">Cash</option>
                      <option value="TRANSFER">Transfer</option>
                      <option value="POS">POS</option>
                    </select>
                  </div>

                  <Field
                    label="Reference"
                    value={reference}
                    onChange={setReference}
                    placeholder="Optional reference"
                    disabled={isSubmitting}
                  />

                  <Field
                    label="Note"
                    value={note}
                    onChange={setNote}
                    placeholder="Optional note"
                    disabled={isSubmitting}
                  />
                </>
              ) : null}

              {activeOperation.code === "RI" ? (
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>Receipt Type</label>
                  <select
                    aria-label="Receipt Type"
                    value={receiptType}
                    onChange={(event) =>
                      setReceiptType(event.target.value)
                    }
                    disabled={isSubmitting}
                    style={inputStyle}
                  >
                    <option value="CUSTOMER">Customer Copy</option>
                    <option value="COMPANY">Company Copy</option>
                  </select>
                </div>
              ) : null}

              {activeOperation.code === "RS" ? (
                <div style={{ marginTop: 14 }}>
                  <label style={labelStyle}>Delivery Channel</label>
                  <select
                    aria-label="Delivery Channel"
                    value={channel}
                    onChange={(event) => setChannel(event.target.value)}
                    disabled={isSubmitting}
                    style={inputStyle}
                  >
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </select>
                </div>
              ) : null}

              {activeOperation.code === "SI" ||
              activeOperation.code === "SR" ? (
                <>
                  <Field
                    label="Quantity"
                    value={quantity}
                    onChange={setQuantity}
                    type="number"
                    min="1"
                    step="1"
                    disabled={isSubmitting}
                  />

                  <Field
                    label="Reference"
                    value={reference}
                    onChange={setReference}
                    disabled={isSubmitting}
                  />
                </>
              ) : null}

              {activeOperation.sensitive ? (
                <Field
                  label="Reason"
                  value={reason}
                  onChange={setReason}
                  disabled={isSubmitting}
                />
              ) : null}

              {activeOperation.requiresConfirmation ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    marginTop: 18,
                    fontSize: 13,
                    lineHeight: 1.4,
                    cursor: isSubmitting ? "default" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) =>
                      setConfirmed(event.target.checked)
                    }
                    disabled={isSubmitting}
                  />
                  <span>
                    I confirm that I want to perform this operation.
                  </span>
                </label>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  style={{
                    marginTop: 16,
                    padding: 12,
                    borderRadius: 8,
                    background: "#fff1f1",
                    color: "#a00000",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  role="status"
                  style={{
                    marginTop: 16,
                    padding: 12,
                    borderRadius: 8,
                    background: "#effaf0",
                    color: "#176b24",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {success}
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 16px",
                    border: "1px solid #ccc",
                    borderRadius: 7,
                    background: "#fff",
                    cursor: isSubmitting ? "default" : "pointer",
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={submit}
                  disabled={isSubmitting}
                  style={{
                    padding: "10px 16px",
                    border: 0,
                    borderRadius: 7,
                    background: "#111",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: isSubmitting ? "default" : "pointer",
                  }}
                >
                  {isSubmitting ? "Processing..." : "Execute"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
