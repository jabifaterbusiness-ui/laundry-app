import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api-client.js";
import {
  executeQuickOperation,
} from "../../lib/quick-operations-api.js";
import type { QuickOperationDefinition } from "../../lib/quick-operations-catalog.js";
import { useAuthStore } from "../../state/auth-store.js";

interface Props {
  operation: QuickOperationDefinition | null;
  onClose: () => void;
}

function isImplemented(code: string) {
  return ["TI", "VO", "SI", "SR"].includes(code);
}

function fieldLabel(code: string) {
  switch (code) {
    case "TI":
      return "Order ID";
    case "VO":
      return "Payment ID";
    case "SI":
    case "SR":
      return "Inventory Item ID";
    default:
      return "Record ID";
  }
}

export function QuickOperationLauncher({
  operation,
  onClose,
}: Props) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore(
    (state) => state.activeBranchId,
  );

  const [recordId, setRecordId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setRecordId("");
    setCustomerId("");
    setQuantity("1");
    setReason("");
    setReference("");
    setConfirmed(false);
    setIsSubmitting(false);
    setError(null);
    setSuccess(null);
  }, [operation]);

  useEffect(() => {
    if (!operation) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [operation, isSubmitting, onClose]);

  if (!operation) {
    return null;
  }

  const activeOperation = operation;
  const implemented = isImplemented(activeOperation.code);

  function validate(): Record<string, unknown> | null {
    if (!recordId.trim()) {
      setError(`${fieldLabel(activeOperation.code)} is required.`);
      return null;
    }

    switch (activeOperation.code) {
      case "TI":
        if (!customerId.trim()) {
          setError("Customer ID is required.");
          return null;
        }

        return {
          orderId: recordId.trim(),
          customerId: customerId.trim(),
        };

      case "VO":
        return {
          paymentId: recordId.trim(),
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
          ...(reason.trim()
            ? { reason: reason.trim() }
            : {}),
          ...(reference.trim()
            ? { reference: reference.trim() }
            : {}),
        };
      }

      default:
        return null;
    }
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

    if (
      activeOperation.requiresConfirmation &&
      !confirmed
    ) {
      setError(
        "Please confirm that you want to perform this operation.",
      );
      return;
    }

    const input = validate();

    if (!input) {
      return;
    }

    setIsSubmitting(true);

    try {
      await executeQuickOperation(
        {
          code: activeOperation.code,
          input,
          confirmed,
        },
        { accessToken },
        activeBranchId,
      );

      setSuccess(
        `${activeOperation.name} completed successfully.`,
      );
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : "The operation could not be completed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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
        aria-label={`${operation.code} ${operation.name}`}
        style={{
          width: "100%",
          maxWidth: 520,
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
              {operation.code}
            </span>

            <h2
              style={{
                margin: 0,
                fontSize: 20,
              }}
            >
              {operation.name}
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
            {operation.description}
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
              This operation is already part of the Quick
              Operations catalog, but its backend workflow has
              not been implemented yet. It cannot be executed
              from this launcher.
            </div>
          ) : (
            <>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                {fieldLabel(operation.code)}
              </label>

              <input
                aria-label={fieldLabel(operation.code)}
                value={recordId}
                onChange={(event) =>
                  setRecordId(event.target.value)
                }
                placeholder="Enter ID"
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #ccc",
                  borderRadius: 7,
                  fontSize: 14,
                }}
              />

              {operation.code === "TI" ? (
                <div style={{ marginTop: 14 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    New Customer ID
                  </label>

                  <input
                    aria-label="New Customer ID"
                    value={customerId}
                    onChange={(event) =>
                      setCustomerId(event.target.value)
                    }
                    placeholder="Enter customer ID"
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 12px",
                      border: "1px solid #ccc",
                      borderRadius: 7,
                      fontSize: 14,
                    }}
                  />
                </div>
              ) : null}

              {operation.code === "SI" ||
              operation.code === "SR" ? (
                <>
                  <div style={{ marginTop: 14 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      Quantity
                    </label>

                    <input
                      aria-label="Quantity"
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(event.target.value)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        border: "1px solid #ccc",
                        borderRadius: 7,
                        fontSize: 14,
                      }}
                    />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      Reason
                    </label>

                    <input
                      aria-label="Reason"
                      value={reason}
                      onChange={(event) =>
                        setReason(event.target.value)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        border: "1px solid #ccc",
                        borderRadius: 7,
                        fontSize: 14,
                      }}
                    />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      Reference
                    </label>

                    <input
                      aria-label="Reference"
                      value={reference}
                      onChange={(event) =>
                        setReference(event.target.value)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        border: "1px solid #ccc",
                        borderRadius: 7,
                        fontSize: 14,
                      }}
                    />
                  </div>
                </>
              ) : null}

              {operation.requiresConfirmation ? (
                <label
                  style={{
                    display: "flex",
                    gap: 9,
                    alignItems: "flex-start",
                    marginTop: 18,
                    fontSize: 13,
                    lineHeight: 1.45,
                    cursor: isSubmitting
                      ? "default"
                      : "pointer",
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
                    I confirm that I am authorized to perform
                    this operation and want to continue.
                  </span>
                </label>
              ) : null}
            </>
          )}

          {error ? (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 7,
                background: "#fff1f1",
                color: "#a00000",
                fontSize: 13,
                lineHeight: 1.45,
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
                borderRadius: 7,
                background: "#f0fff4",
                color: "#176b35",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              {success}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "14px 20px",
            borderTop: "1px solid #eee",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: "9px 15px",
              border: "1px solid #ccc",
              borderRadius: 7,
              background: "#fff",
              cursor: isSubmitting
                ? "default"
                : "pointer",
            }}
          >
            Close
          </button>

          {implemented ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isSubmitting}
              style={{
                padding: "9px 15px",
                border: 0,
                borderRadius: 7,
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                cursor: isSubmitting
                  ? "default"
                  : "pointer",
              }}
            >
              {isSubmitting
                ? "Processing..."
                : operation.requiresConfirmation
                  ? "Confirm & Execute"
                  : "Execute"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
