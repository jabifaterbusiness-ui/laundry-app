import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { hasPermission } from "../../lib/permissions.js";
import { listSuspiciousActivity } from "../../lib/audit-api.js";
import {
  loadSuspiciousActivityReadState,
  loadSuspiciousActivityCategoryOrder,
  saveSuspiciousActivityCategoryOrder,
  loadSuspiciousActivityEventOrder,
  saveSuspiciousActivityEventOrder,
  markSuspiciousActivityEventSeen,
} from "../../lib/suspicious-activity-persistence.js";
import { useAuthStore } from "../../state/auth-store.js";

type ActivityRisk = "High" | "Critical";

type ActivityDefinition = {
  id: string;
  label: string;
  actions: readonly string[];
  operationNames?: readonly string[];
  risk: ActivityRisk;
  description: string;
};

const ACTIVITY_DEFINITIONS: readonly ActivityDefinition[] = [
  {
    id: "authentication-password-reset-requested",
    label: "Password Reset Requested",
    actions: ["user.password_reset_requested"],
    risk: "High",
    description: "Password reset requests.",
  },
  {
    id: "authentication-password-reset-completed",
    label: "Password Reset Completed",
    actions: ["user.password_reset_completed"],
    risk: "High",
    description: "Completed password reset events.",
  },
  {
    id: "login-history",
    label: "Login History",
    actions: ["user.login", "user.logout"],
    risk: "High",
    description: "User login and logout activity.",
  },
  {
    id: "user-created",
    label: "User Created",
    actions: ["user.created"],
    risk: "High",
    description: "New user accounts created.",
  },
  {
    id: "user-updated",
    label: "User Updated",
    actions: ["user.updated"],
    risk: "High",
    description: "User account information changed.",
  },
  {
    id: "user-disabled",
    label: "User Disabled",
    actions: ["user.deleted"],
    risk: "Critical",
    description: "User accounts disabled through the protected user lifecycle.",
  },
  {
    id: "user-deactivated",
    label: "User Deactivated",
    actions: ["user.deactivated"],
    risk: "Critical",
    description: "User accounts deactivated.",
  },
  {
    id: "permission-role-updated",
    label: "Permission Role Updated",
    actions: ["permission.role.updated"],
    risk: "Critical",
    description: "A role's permissions were updated.",
  },
  {
    id: "permission-role-removed",
    label: "Permission Role Removed",
    actions: ["permission.role.removed"],
    risk: "Critical",
    description: "A role's permissions were removed.",
  },
  {
    id: "permission-user-allow-all",
    label: "Allow All Permissions",
    actions: ["permission.user.allow_all"],
    risk: "Critical",
    description: "All permissions were granted to an individual user.",
  },
  {
    id: "permission-user-disallow-all",
    label: "Disallow All Permissions",
    actions: ["permission.user.disallow_all"],
    risk: "Critical",
    description: "All permissions were removed from an individual user.",
  },
  {
    id: "permission-user-updated",
    label: "Permission User Updated",
    actions: ["permission.user.updated"],
    risk: "Critical",
    description: "Individual user permissions were updated.",
  },
  {
    id: "permission-user-removed",
    label: "Permission User Removed",
    actions: ["permission.user.removed"],
    risk: "Critical",
    description: "Individual user permissions were removed.",
  },
  {
    id: "payment-voided",
    label: "Payment Voided",
    actions: ["payment.voided"],
    risk: "Critical",
    description: "Payments that have been voided.",
  },
  {
    id: "invoice-updated",
    label: "Invoice Updated",
    actions: ["invoice.updated", "order.invoice_edited"],
    risk: "High",
    description: "Controlled invoice corrections.",
  },
  {
    id: "invoice-deleted",
    label: "Invoice Deleted",
    actions: ["invoice.deleted"],
    risk: "Critical",
    description: "Controlled invoice deletion actions.",
  },
  {
    id: "invoice-transferred",
    label: "Invoice Transferred",
    actions: ["invoice.transferred"],
    risk: "Critical",
    description: "Invoices transferred to another customer.",
  },
  {
    id: "invoice-voided",
    label: "Invoice Voided",
    actions: ["invoice.voided"],
    risk: "Critical",
    description: "Invoices voided through the controlled correction workflow.",
  },
  {
    id: "customer-transferred",
    label: "Customer Transferred",
    actions: ["order.customer_transferred"],
    risk: "Critical",
    description: "Orders or customer ownership transferred.",
  },
  {
    id: "customer-ownership-assigned",
    label: "Customer Branch Ownership Assigned",
    actions: ["customer.legacy_owner_assigned", "customer.legacy_owner_bulk_assigned"],
    risk: "High",
    description: "Legacy customer records assigned to a verified business branch.",
  },
  {
    id: "stock-adjusted",
    label: "Stock Adjusted",
    actions: ["inventory.stock_adjusted"],
    risk: "High",
    description: "Manual inventory stock adjustments.",
  },
  {
    id: "backup-exported",
    label: "Backup Exported",
    actions: ["backup.exported"],
    risk: "High",
    description: "Business data exported as a backup.",
  },
  {
    id: "backup-restored",
    label: "Backup Restored",
    actions: ["backup.restored"],
    risk: "Critical",
    description: "Business data restored from a backup.",
  },
  {
    id: "quick-manual-update",
    label: "Manual Update",
    actions: ["quick_operation.executed"],
    operationNames: ["Manual Update"],
    risk: "Critical",
    description: "Protected manual update executed by an authorized user.",
  },
  {
    id: "quick-transfer-invoice",
    label: "Transfer Order",
    actions: ["quick_operation.executed"],
    operationNames: ["Transfer Order"],
    risk: "Critical",
    description: "Order transfer executed through a protected quick operation.",
  },
  {
    id: "quick-transfer-customer",
    label: "Transfer Customer",
    actions: ["quick_operation.executed"],
    operationNames: ["Transfer Customer"],
    risk: "Critical",
    description: "Customer transfer executed through a protected quick operation.",
  },
  {
    id: "quick-merge-account",
    label: "Merge Customer",
    actions: ["quick_operation.executed"],
    operationNames: ["Merge Customer"],
    risk: "Critical",
    description: "Customer account merge executed through a protected quick operation.",
  },
  {
    id: "quick-void-operation",
    label: "Void Operation",
    actions: ["quick_operation.executed"],
    operationNames: ["Void Operation"],
    risk: "Critical",
    description: "Void operation executed through a protected quick operation.",
  },
  {
    id: "quick-refund",
    label: "Refund",
    actions: ["quick_operation.executed"],
    operationNames: ["Refund"],
    risk: "Critical",
    description: "Refund executed through a protected quick operation.",
  },
  {
    id: "quick-reprint",
    label: "Reprint Invoice / Receipt",
    actions: ["quick_operation.executed"],
    operationNames: ["Reprint Invoice / Receipt"],
    risk: "High",
    description: "Invoice or receipt reprint activity.",
  },
  {
    id: "quick-resend-receipt",
    label: "Resend Receipt",
    actions: ["quick_operation.executed"],
    operationNames: ["Resend Receipt"],
    risk: "High",
    description: "Receipt resend activity.",
  },
  {
    id: "quick-reconcile",
    label: "Reconcile",
    actions: ["quick_operation.executed"],
    operationNames: ["Reconcile"],
    risk: "Critical",
    description: "Protected reconciliation activity.",
  },
  {
    id: "quick-stock-issue",
    label: "Stock Issue",
    actions: ["quick_operation.executed"],
    operationNames: ["Stock Issue"],
    risk: "High",
    description: "Inventory stock issue activity.",
  },
  {
    id: "quick-stock-receipt",
    label: "Stock Receipt",
    actions: ["quick_operation.executed"],
    operationNames: ["Stock Receipt"],
    risk: "High",
    description: "Inventory stock receipt activity.",
  },
  {
    id: "quick-switch-order",
    label: "Switch Order",
    actions: ["quick_operation.executed"],
    operationNames: ["Switch Order"],
    risk: "High",
    description: "Order workspace switch activity.",
  },
  {
    id: "quick-switch-customer",
    label: "Switch Customer",
    actions: ["quick_operation.executed"],
    operationNames: ["Switch Customer"],
    risk: "High",
    description: "Customer workspace switch activity.",
  },
  {
    id: "quick-safe-stop",
    label: "Safe Stop / Safe Exit",
    actions: ["quick_operation.executed"],
    operationNames: ["Safe Stop / Safe Exit"],
    risk: "Critical",
    description: "Protected safe-stop or safe-exit activity.",
  },
  {
    id: "subscription-payment-verified",
    label: "Subscription Payment Verified",
    actions: ["subscription.payment.verified"],
    risk: "High",
    description: "Subscription payments verified.",
  },
  {
    id: "subscription-reconciled",
    label: "Subscription Reconciled",
    actions: ["subscription.payment_intent.reconciled"],
    risk: "High",
    description: "Subscription payment intents reconciled.",
  },
  {
    id: "migration-analyzed",
    label: "Migration Analyzed",
    actions: ["migration.analyzed"],
    risk: "High",
    description: "Database migration analysis events.",
  },
];

const DEFAULT_ACTIVITY_CATEGORY_ORDER = [
  "backup",
  "inventory",
  "security",
  "users",
  "permissions",
  "financial",
  "invoices",
  "customers",
  "operations",
  "system",
];

const DEFAULT_ACTIVITY_EVENT_ORDER = ACTIVITY_DEFINITIONS.map((definition) => definition.id);

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatMetadata(metadata: unknown) {
  if (metadata === null || metadata === undefined) {
    return "—";
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

type AuditRecord = Record<string, unknown>;

const AUDIT_FIELD_LABELS: Record<string, string> = {
  action: "Action",
  actionType: "Action type",
  actorName: "Actor",
  actorUserId: "Actor user ID",
  afterStatus: "Status after",
  approvalStatus: "Approval status",
  balance: "Balance",
  branchId: "Branch ID",
  businessId: "Business ID",
  cancelledAt: "Cancelled at",
  colors: "Colours",
  companyAddress: "Company address",
  companyEmail: "Company email",
  companyName: "Company name",
  companyPhone: "Company phone",
  companyWebsite: "Company website",
  completedAt: "Completed at",
  createdAt: "Created at",
  customerAgreement: "Customer agreement",
  customerId: "Customer ID",
  customerName: "Customer",
  expectedReadyAt: "Expected ready at",
  garmentNote: "Garment notes",
  historyId: "History record ID",
  internalNote: "Internal notes",
  invoiceNumber: "Invoice number",
  itemName: "Item / service",
  lineTotal: "Line total",
  newCustomerId: "New customer ID",
  notes: "Notes",
  operationCode: "Operation code",
  operationName: "Operation",
  orderNumber: "Order number",
  orderTotal: "Order total",
  paidAmount: "Amount paid",
  paymentId: "Payment ID",
  piecesPerUnit: "Pieces per unit",
  previousCustomerId: "Previous customer ID",
  quantity: "Quantity",
  reason: "Reason",
  reference: "Reference",
  resultingQuantity: "Resulting quantity",
  status: "Status",
  submittedById: "Submitted by user ID",
  totalAmount: "Invoice total",
  totalPieces: "Total pieces",
  totalPrice: "Line total",
  unitPrice: "Unit price",
  updatedAt: "Last updated",
};

const AUDIT_TECHNICAL_KEYS = new Set([
  "id",
  "businessId",
  "branchId",
  "branchIds",
  "ownerBranchId",
  "previousOwnerBranchId",
  "ownerBranchIds",
  "userId",
  "roleId",
  "permissionId",
  "serviceId",
  "inventoryItemId",
  "supplierId",
  "purchaseOrderId",
  "stockMovementId",
  "transferId",
  "paymentIntentId",
  "subscriptionId",
  "accountId",
  "customerId",
  "customerIds",
  "userIds",
  "orderIds",
  "serviceIds",
  "createdById",
  "updatedById",
  "deletedById",
  "assignedToId",
  "targetUserId",
  "actorId",
  "referenceId",
  "orderId",
  "invoiceId",
  "paymentId",
  "actorUserId",
  "submittedById",
  "newCustomerId",
  "previousCustomerId",
  "createdAt",
  "updatedAt",
  "historyId",
  "correlationId",
  "logoUrl",
  "receiptPrimaryColor",
  "receiptAccentColor",
  "receiptBackgroundColor",
  "receiptTextColor",
  "receiptHeaderStyle",
]);

const AUDIT_MONEY_KEYS = new Set([
  "amount",
  "balance",
  "lineTotal",
  "orderTotal",
  "paidAmount",
  "totalAmount",
  "totalPrice",
  "unitPrice",
  "subtotal",
  "discountAmount",
  "outstandingBalance",
]);

function asAuditRecord(value: unknown): AuditRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AuditRecord;
}

function auditFieldLabel(key: string): string {
  if (AUDIT_FIELD_LABELS[key]) return AUDIT_FIELD_LABELS[key];

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function formatAuditValue(value: unknown, key = ""): string {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (typeof value === "number") {
    if (AUDIT_MONEY_KEYS.has(key)) {
      return `₦${value.toLocaleString("en-NG")}`;
    }
    return value.toLocaleString("en-NG");
  }

  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())) {
      return "linked record";
    }
    if (/(At|Date|Timestamp)$/.test(key) && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry))) {
      return value.map((entry) => formatAuditValue(entry)).join(", ") || "None";
    }
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  return "Structured details available";
}

function auditScalarFields(
  record: AuditRecord,
  excluded: Set<string> = new Set(),
) {
  return Object.entries(record).filter(([key, value]) =>
    !excluded.has(key)
    && !AUDIT_TECHNICAL_KEYS.has(key)
    && value !== undefined
    && value !== null
    && (["string", "number", "boolean"].includes(typeof value)
      || (Array.isArray(value)
        && value.every((entry) => entry === null
          || ["string", "number", "boolean"].includes(typeof entry)))),
  );
}

function AuditFieldList({ data }: { data: AuditRecord }) {
  const fields = auditScalarFields(data);

  if (!fields.length) return null;

  return (
    <dl className="suspicious-activity-detail-fields">
      {fields.map(([key, value]) => (
        <div key={key}>
          <dt>{auditFieldLabel(key)}</dt>
          <dd>{formatAuditValue(value, key)}</dd>
        </div>
      ))}
    </dl>
  );
}

function AuditLineItems({
  title,
  items,
}: {
  title: string;
  items: unknown;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const rows = items.flatMap((item, index) => {
    const record = asAuditRecord(item);
    return record ? [{ item: record, index }] : [];
  });

  if (!rows.length) {
    return (
      <section className="suspicious-activity-detail-subsection">
        <h4>{title}</h4>
        <p>{formatAuditValue(items)}</p>
      </section>
    );
  }

  return (
    <section className="suspicious-activity-detail-subsection">
      <h4>{title}</h4>
      <div className="suspicious-activity-detail-table-wrap">
        <table className="suspicious-activity-detail-table">
          <thead>
            <tr>
              <th>Item / service</th>
              <th>Quantity</th>
              <th>Pieces / unit</th>
              <th>Total pieces</th>
              <th>Colours</th>
              <th>Unit price</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, index }) => (
              <tr key={String(item.id ?? index)}>
                <td>{formatAuditValue(item.itemName ?? item.serviceName ?? item.name)}</td>
                <td>{formatAuditValue(item.quantity, "quantity")}</td>
                <td>{formatAuditValue(item.piecesPerUnit, "piecesPerUnit")}</td>
                <td>{formatAuditValue(item.totalPieces, "totalPieces")}</td>
                <td>{formatAuditValue(item.colors ?? item.colours)}</td>
                <td>{formatAuditValue(item.unitPrice, "unitPrice")}</td>
                <td>{formatAuditValue(item.totalPrice ?? item.lineTotal, "totalPrice")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditSnapshot({
  title,
  snapshot,
}: {
  title: string;
  snapshot: unknown;
}) {
  const record = asAuditRecord(snapshot);
  if (!record) return null;

  const invoice = asAuditRecord(record.invoice);
  const combined = invoice ? { ...record, ...invoice } : record;
  const items = invoice?.items ?? record.items;

  return (
    <section className="suspicious-activity-detail-snapshot">
      <h3>{title}</h3>
      <AuditFieldList data={Object.fromEntries(
        Object.entries(combined).filter(([key]) => !["items", "garments", "invoice"].includes(key)),
      )} />
      <AuditLineItems title="Items and services" items={items} />
    </section>
  );
}

function collectAuditChanges(
  before: unknown,
  after: unknown,
  path = "",
  changes: Array<{ path: string; before: unknown; after: unknown }> = [],
): Array<{ path: string; before: unknown; after: unknown }> {
  if (changes.length >= 40) return changes;
  if (Object.is(before, after)) return changes;

  const beforeRecord = asAuditRecord(before);
  const afterRecord = asAuditRecord(after);

  if (beforeRecord || afterRecord) {
    const left = beforeRecord ?? {};
    const right = afterRecord ?? {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
      if (AUDIT_TECHNICAL_KEYS.has(key)) continue;
      if (key === "items" && path.endsWith(".invoice")) continue;
      collectAuditChanges(
        left[key],
        right[key],
        path ? `${path}.${key}` : key,
        changes,
      );
      if (changes.length >= 40) break;
    }
    return changes;
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    const left = Array.isArray(before) ? before : [];
    const right = Array.isArray(after) ? after : [];
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
      collectAuditChanges(
        left[index],
        right[index],
        `${path}[${index + 1}]`,
        changes,
      );
      if (changes.length >= 40) break;
    }
    return changes;
  }

  changes.push({ path, before, after });
  return changes;
}

function formatChangePath(path: string): string {
  return path
    .replace(/items\[(\d+)\]/g, "item $1")
    .split(".")
    .map((part) => auditFieldLabel(part))
    .join(" · ");
}

function activityRecordLabel(activity: {
  entityType: string;
  metadata: unknown;
}) {
  const metadata = asAuditRecord(activity.metadata) ?? {};
  const invoiceNumber = metadata.invoiceNumber;
  const orderNumber = metadata.orderNumber;
  const customerName = metadata.customerName;
  const name = metadata.name;
  if (typeof invoiceNumber === "string" && invoiceNumber) return `Invoice #${invoiceNumber}`;
  if (typeof orderNumber === "string" && orderNumber) return `Order #${orderNumber}`;
  if (typeof customerName === "string" && customerName) return customerName;
  if (typeof name === "string" && name) return name;
  if (typeof metadata.permissionCode === "string" && metadata.permissionCode) {
    const target = [metadata.targetUserName, metadata.userName, metadata.reference]
      .find((value) => typeof value === "string" && value.trim());
    if (typeof target === "string") return `User ${target.trim()}`;
    if (typeof metadata.userId === "string") return "Affected user";
  }
  return activity.entityType.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function activitySummary(
  activity: { entityType: string; metadata: unknown },
  definition: ActivityDefinition,
  branchNames: Map<string, string> = new Map(),
) {
  const metadata = asAuditRecord(activity.metadata) ?? {};
  const before = metadata.before ?? (
    metadata.beforeStatus !== undefined ? { status: metadata.beforeStatus } : undefined
  );
  const after = metadata.after ?? (
    metadata.afterStatus !== undefined ? { status: metadata.afterStatus } : undefined
  );
  const beforeRecord = asAuditRecord(before) ?? {};
  const afterRecord = asAuditRecord(after) ?? {};
  const changes = before !== undefined || after !== undefined
    ? collectAuditChanges(before, after)
    : [];
  const recordTitle = activityRecordLabel(activity);
  const reason = typeof metadata.reason === "string" && metadata.reason.trim()
    ? metadata.reason.trim()
    : null;

  if (definition.id === "permission-user-updated") {
    const rawPermission = typeof metadata.permissionName === "string"
      ? metadata.permissionName
      : typeof metadata.permissionCode === "string"
        ? metadata.permissionCode
        : "Permission";
    const permissionLabel = rawPermission.replace(/[._-]+/g, " ").replace(/\\s+/g, " ").trim();
    const targetUser = [metadata.targetUserName, metadata.userName, metadata.reference]
      .find((value) => typeof value === "string" && value.trim());
    const targetLabel = typeof targetUser === "string" ? targetUser.trim() : "the affected user";
    if (typeof beforeRecord.allowed === "boolean" && typeof afterRecord.allowed === "boolean") {
      return `${permissionLabel} access for ${targetLabel} changed from ${beforeRecord.allowed ? "allowed" : "not allowed"} to ${afterRecord.allowed ? "allowed" : "not allowed"}.`;
    }
    return `${permissionLabel} access was updated for ${targetLabel}.`;
  }

  if (definition.id === "customer-ownership-assigned") {
    const assignedCount = typeof metadata.assignedCount === "number" ? metadata.assignedCount : 1;
    const branchName = typeof metadata.ownerBranchName === "string" && metadata.ownerBranchName.trim()
      ? metadata.ownerBranchName.trim()
      : "the selected branch";
    if (assignedCount > 1) {
      return `${assignedCount.toLocaleString("en-NG")} legacy customers assigned to ${branchName}.`;
    }
    return `${recordTitle} assigned to ${branchName}.`;
  }

  const beforeBranchIds = Array.isArray(beforeRecord.branchIds) ? beforeRecord.branchIds : null;
  const afterBranchIds = Array.isArray(afterRecord.branchIds) ? afterRecord.branchIds : null;
  if (beforeBranchIds || afterBranchIds) {
    const branchLabels = (value: unknown): string[] => Array.isArray(value)
      ? value.map((entry) => {
          if (typeof entry === "string") return branchNames.get(entry) ?? entry;
          const branch = asAuditRecord(entry);
          return typeof branch?.name === "string" ? branch.name : "";
        }).filter((name): name is string => Boolean(name) && !/^[0-9a-f-]{36}$/i.test(name))
      : [];
    const beforeNames = branchLabels(
      beforeRecord.branchNames ?? beforeRecord.branches ?? metadata.beforeBranchNames ?? beforeBranchIds,
    );
    const afterNames = branchLabels(
      afterRecord.branchNames ?? afterRecord.branches ?? metadata.afterBranchNames ?? afterBranchIds,
    );
    if (beforeNames.length || afterNames.length) {
      const removed = beforeNames.filter((name) => !afterNames.includes(name));
      const added = afterNames.filter((name) => !beforeNames.includes(name));
      const retained = beforeNames.filter((name) => afterNames.includes(name));
      const changes = [
        removed.length ? `removed access to ${removed.join(", ")}` : "",
        added.length ? `granted access to ${added.join(", ")}` : "",
        retained.length ? `retained access to ${retained.join(", ")}` : "",
      ].filter(Boolean);
      if (changes.length) return `${recordTitle} branch access changed: ${changes.join("; ")}.`;
    }
    const beforeCount = beforeBranchIds?.length ?? beforeNames.length;
    const afterCount = afterBranchIds?.length ?? afterNames.length;
    return `${recordTitle} branch access changed from ${beforeCount} to ${afterCount} assigned branches.`;
  }

  const totalChange = changes.find((change) =>
    /(^|\.)(totalAmount|orderTotal|totalPrice|amount)$/.test(change.path),
  );
  const quantityChange = changes.find((change) => /(^|\.)quantity$/.test(change.path));
  const statusChange = changes.find((change) => /(^|\.)status$/.test(change.path));
  const highlights = [quantityChange, totalChange, statusChange]
    .filter((change): change is NonNullable<typeof change> => Boolean(change))
    .slice(0, 2)
    .map((change) =>
      `${formatChangePath(change.path)}: ${formatAuditValue(change.before, change.path.split(".").pop())} → ${formatAuditValue(change.after, change.path.split(".").pop())}`,
    );
  const conciseChanges = highlights.length
    ? highlights
    : changes.slice(0, 2).map((change) =>
      `${formatChangePath(change.path)}: ${formatAuditValue(change.before, change.path.split(".").pop())} → ${formatAuditValue(change.after, change.path.split(".").pop())}`,
    );

  if (conciseChanges.length) return `${recordTitle} changed. ${conciseChanges.join(". ")}.`;
  if (reason) return `${recordTitle}. Reason: ${reason}`;
  return definition.description;
}

function AuditMetadataDetails({ metadata }: { metadata: unknown }) {
  const record = asAuditRecord(metadata);

  if (!record) {
    return (
      <section className="suspicious-activity-detail-section">
        <details className="suspicious-activity-technical-details">
          <summary>Event details</summary>
          <p>{metadata === null || metadata === undefined
            ? "No additional event details were recorded."
            : formatAuditValue(metadata)}</p>
        </details>
        <details className="suspicious-activity-technical-details">
          <summary>Technical details (raw event data)</summary>
          <pre>{formatMetadata(metadata)}</pre>
        </details>
      </section>
    );
  }

  const before = record.before ?? (
    record.beforeStatus !== undefined ? { status: record.beforeStatus } : undefined
  );
  const after = record.after ?? (
    record.afterStatus !== undefined ? { status: record.afterStatus } : undefined
  );
  const hasSnapshots = before !== undefined || after !== undefined;
  const contextKeys = new Set([
    "reason", "before", "after", "beforeStatus", "afterStatus",
    "historyId", "correlationId", "businessId", "branchId",
  ]);
  const context = Object.fromEntries(
    Object.entries(record).filter(([key]) => !contextKeys.has(key)),
  );
  const changes = hasSnapshots ? collectAuditChanges(before, after) : [];

  return (
    <section className="suspicious-activity-detail-section">
      <details className="suspicious-activity-technical-details">
        <summary>Event details</summary>
        {Object.keys(context).length ? (
          <details className="suspicious-activity-technical-details suspicious-activity-nested-details">
            <summary>Key details</summary>
            <AuditFieldList data={context} />
          </details>
        ) : (
          <p>No additional event details were recorded.</p>
        )}

        {hasSnapshots ? (
          <details className="suspicious-activity-technical-details suspicious-activity-nested-details">
            <summary>Recorded change</summary>
            {changes.length ? (
              <ul className="suspicious-activity-change-list">
                {changes.map((change, index) => (
                  <li key={`${change.path}-${index}`}>
                    <strong>{formatChangePath(change.path)}</strong>
                    <span>
                      <small>Before</small>
                      <span>{formatAuditValue(change.before, change.path.split(".").pop())}</span>
                    </span>
                    <span>
                      <small>After</small>
                      <span>{formatAuditValue(change.after, change.path.split(".").pop())}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No field-level differences were detected in the available snapshots.</p>
            )}
            {changes.length >= 40 ? <p>Change list limited to the first 40 differences.</p> : null}
            <details className="suspicious-activity-technical-details suspicious-activity-nested-details">
              <summary>View full before-and-after snapshots</summary>
              <div className="suspicious-activity-detail-snapshot-grid">
                <AuditSnapshot title="Before the change" snapshot={before} />
                <AuditSnapshot title="After the change" snapshot={after} />
              </div>
            </details>
          </details>
        ) : (
          <p className="suspicious-activity-detail-hint">
            No before-and-after snapshot was recorded for this event.
          </p>
        )}
      </details>

      <details className="suspicious-activity-technical-details">
        <summary>Technical details (raw event data)</summary>
        <pre>{formatMetadata(metadata)}</pre>
      </details>
    </section>
  );
}

function getReason(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const reason = record.reason;

  return typeof reason === "string" && reason.trim()
    ? reason.trim()
    : null;
}

function getActivityCategory(definition: ActivityDefinition) {
  const action = definition.actions[0] ?? "";

  if (action.startsWith("user.password") || action.startsWith("user.login")) {
    return "security";
  }

  if (action.startsWith("user.")) {
    return "users";
  }

  if (action.startsWith("permission.")) {
    return "permissions";
  }

  if (action.startsWith("payment.") || action.startsWith("subscription.")) {
    return "financial";
  }

  if (action.startsWith("invoice.")) {
    return "invoices";
  }

  if (action.startsWith("customer.") || action.startsWith("order.customer_")) {
    return "customers";
  }

  if (action.startsWith("inventory.")) {
    return "inventory";
  }

  if (action.startsWith("backup.")) {
    return "backup";
  }

  if (action.startsWith("quick_operation.")) {
    return "operations";
  }

  if (action.startsWith("migration.")) {
    return "system";
  }

  return "security";
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "security":
      return "Security & authentication";
    case "users":
      return "User activity";
    case "permissions":
      return "Permissions";
    case "financial":
      return "Financial";
    case "invoices":
      return "Invoices";
    case "customers":
      return "Customers";
    case "inventory":
      return "Inventory";
    case "backup":
      return "Backup & recovery";
    case "operations":
      return "Quick operations";
    case "system":
      return "System";
    default:
      return "Security";
  }
}

export function SuspiciousActivityPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    null,
  );
  const [readState, setReadState] = useState(() => {
    if (typeof window === "undefined" || !user?.id || !activeBranchId) {
      return {};
    }

    return loadSuspiciousActivityReadState(
      user.id,
      activeBranchId,
    ).lastSeenEventIds;
  });

  const [categoryOrder, setCategoryOrder] = useState(() => {
    if (typeof window === "undefined" || !user?.id || !activeBranchId) {
      return [...DEFAULT_ACTIVITY_CATEGORY_ORDER];
    }
    return loadSuspiciousActivityCategoryOrder(
      user.id,
      activeBranchId,
      DEFAULT_ACTIVITY_CATEGORY_ORDER,
    );
  });
  const [draftCategoryOrder, setDraftCategoryOrder] = useState(categoryOrder);
  const [eventOrder, setEventOrder] = useState(() => {
    if (typeof window === "undefined" || !user?.id || !activeBranchId) {
      return [...DEFAULT_ACTIVITY_EVENT_ORDER];
    }
    return loadSuspiciousActivityEventOrder(user.id, activeBranchId, DEFAULT_ACTIVITY_EVENT_ORDER);
  });
  const [draftEventOrder, setDraftEventOrder] = useState(eventOrder);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);
  const [isCustomizingOrder, setIsCustomizingOrder] = useState(false);

  useEffect(() => {
    if (!draggingEventId) return;

    const finishPointerDrag = () => {
      setDraggingEventId(null);
      setDragOverEventId(null);
    };

    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", finishPointerDrag);
    return () => {
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
    };
  }, [draggingEventId]);

  const canView = hasPermission(
    user,
    "security.suspicious_activity.view",
  );

  const activityQuery = useQuery({
    queryKey: ["audit", "suspicious-activity"],
    queryFn: () => listSuspiciousActivity(accessToken ?? "", 100),
    enabled: Boolean(accessToken && canView),
  });

  const activities = useMemo(
    () =>
      (activityQuery.data ?? []).map((activity) => ({
        ...activity,
        reason: getReason(activity.metadata),
      })),
    [activityQuery.data],
  );

  const branchNameMap = useMemo(
    () => new Map((user?.branches ?? []).map((branch) => [branch.id, branch.name] as const)),
    [user?.branches],
  );

  const selectedDefinition = useMemo(
    () =>
      ACTIVITY_DEFINITIONS.find(
        (definition) => definition.id === selectedEventId,
      ) ?? null,
    [selectedEventId],
  );

  const selectedActivities = useMemo(() => {
    if (!selectedDefinition) {
      return [];
    }

    return activities.filter((activity) => {
      if (!selectedDefinition.actions.includes(activity.action)) {
        return false;
      }

      if (!selectedDefinition.operationNames) {
        return true;
      }

      if (!activity.metadata || typeof activity.metadata !== "object") {
        return false;
      }

      const operationName = (activity.metadata as Record<string, unknown>)
        .operationName;

      return (
        typeof operationName === "string" &&
        selectedDefinition.operationNames.includes(operationName)
      );
    });
  }, [activities, selectedDefinition]);

  useEffect(() => {
    if (!user?.id || !activeBranchId) {
      setReadState({});
      return;
    }

    setReadState(
      loadSuspiciousActivityReadState(
        user.id,
        activeBranchId,
      ).lastSeenEventIds,
    );
  }, [user?.id, activeBranchId]);

  useEffect(() => {
    if (!draggingEventId) return;
    const stopDragging = () => {
      setDraggingEventId(null);
      setDragOverEventId(null);
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [draggingEventId]);

  const orderedDefinitions = useMemo(() => {
    const selectedOrder = isCustomizingOrder ? draftEventOrder : eventOrder;
    const positions = new Map(selectedOrder.map((id, index) => [id, index] as const));
    return [...ACTIVITY_DEFINITIONS].sort(
      (left, right) => (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [eventOrder, draftEventOrder, isCustomizingOrder]);

  useEffect(() => {
    if (!user?.id || !activeBranchId) {
      setCategoryOrder([...DEFAULT_ACTIVITY_CATEGORY_ORDER]);
      setDraftCategoryOrder([...DEFAULT_ACTIVITY_CATEGORY_ORDER]);
      setEventOrder([...DEFAULT_ACTIVITY_EVENT_ORDER]);
      setDraftEventOrder([...DEFAULT_ACTIVITY_EVENT_ORDER]);
      setDraggingEventId(null);
      setDragOverEventId(null);
      setIsCustomizingOrder(false);
      return;
    }
    const savedOrder = loadSuspiciousActivityCategoryOrder(
      user.id,
      activeBranchId,
      DEFAULT_ACTIVITY_CATEGORY_ORDER,
    );
    setCategoryOrder(savedOrder);
    setDraftCategoryOrder(savedOrder);
    const savedEventOrder = loadSuspiciousActivityEventOrder(
      user.id,
      activeBranchId,
      DEFAULT_ACTIVITY_EVENT_ORDER,
    );
    setEventOrder(savedEventOrder);
    setDraftEventOrder(savedEventOrder);
    setDraggingEventId(null);
    setDragOverEventId(null);
    setIsCustomizingOrder(false);
  }, [user?.id, activeBranchId]);

  function moveEventToEdge(eventId: string, edge: "top" | "bottom") {
    setDraftEventOrder((current) => {
      const remaining = current.filter((id) => id !== eventId);
      return edge === "top" ? [eventId, ...remaining] : [...remaining, eventId];
    });
  }

  function moveEventToPosition(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return;
    setDraftEventOrder((current) => {
      const remaining = current.filter((id) => id !== sourceId);
      const targetIndex = remaining.indexOf(targetId);
      if (targetIndex < 0) return current;
      remaining.splice(targetIndex, 0, sourceId);
      return remaining;
    });
  }

  function saveCategoryOrder() {
    if (!user?.id || !activeBranchId) return;
    saveSuspiciousActivityCategoryOrder(user.id, activeBranchId, draftCategoryOrder);
    saveSuspiciousActivityEventOrder(user.id, activeBranchId, draftEventOrder);
    setCategoryOrder(draftCategoryOrder);
    setEventOrder(draftEventOrder);
    setDraggingEventId(null);
    setDragOverEventId(null);
    setIsCustomizingOrder(false);
  }

  const activityCounts = useMemo(() => {
    return new Map(
      ACTIVITY_DEFINITIONS.map((definition) => {
        const matching = activities.filter((activity) => {
          if (!definition.actions.includes(activity.action)) {
            return false;
          }

          if (!definition.operationNames) {
            return true;
          }

          if (!activity.metadata || typeof activity.metadata !== "object") {
            return false;
          }

          const operationName = (
            activity.metadata as Record<string, unknown>
          ).operationName;

          return (
            typeof operationName === "string" &&
            definition.operationNames.includes(operationName)
          );
        });

        const latest = matching.reduce<(typeof matching)[number] | null>(
          (current, activity) => {
            if (!current) {
              return activity;
            }

            return new Date(activity.timestamp).getTime() >
              new Date(current.timestamp).getTime()
              ? activity
              : current;
          },
          null,
        );

        return [
          definition.id,
          {
            count: matching.length,
            latestActivityId: latest?.id ?? null,
          },
        ];
      }),
    );
  }, [activities]);

  const markEventAsSeen = (definition: ActivityDefinition) => {
    if (!user?.id || !activeBranchId) {
      return;
    }

    const latestActivityId =
      activityCounts.get(definition.id)?.latestActivityId;

    if (!latestActivityId) {
      return;
    }

    markSuspiciousActivityEventSeen(
      user.id,
      activeBranchId,
      definition.id,
      latestActivityId,
    );

    setReadState((current) => ({
      ...current,
      [definition.id]: latestActivityId,
    }));
  };

  const criticalCount = activities.filter((activity) =>
    ACTIVITY_DEFINITIONS.some((definition) => {
      if (!definition.actions.includes(activity.action)) {
        return false;
      }

      if (definition.risk !== "Critical") {
        return false;
      }

      if (!definition.operationNames) {
        return true;
      }

      if (!activity.metadata || typeof activity.metadata !== "object") {
        return false;
      }

      const operationName = (
        activity.metadata as Record<string, unknown>
      ).operationName;

      return (
        typeof operationName === "string" &&
        definition.operationNames.includes(operationName)
      );
    }),
  ).length;

  if (!canView) {
    return (
      <main>
        <h1>Suspicious / Unusual Activity</h1>
        <p>
          You do not have permission to view suspicious or high-risk
          activity.
        </p>
      </main>
    );
  }

  return (
    <main className="suspicious-activity-page">
      <header className="suspicious-activity-page-header">
        <div>
          <p className="dashboard-panel-eyebrow">Security centre</p>
          <h1>Suspicious / Unusual Activity</h1>
        <p>
          Select an event type to view only that event&apos;s records.
          Security, authentication, login history, users, permissions,
          financial events, invoices, backups and other sensitive
          activities remain separately organized.
        </p>
        </div>
      </header>

      {activityQuery.isLoading ? (
        <p>Loading suspicious activity...</p>
      ) : activityQuery.isError ? (
        <p role="alert">
          Unable to load suspicious activity. Please try again.
        </p>
      ) : (
        <>
          <section
            className="suspicious-activity-summary-grid"
            aria-label="Activity summary"
          >
            <article className="suspicious-activity-summary-card suspicious-activity-summary-card-primary">
              <div>
                <p className="dashboard-panel-eyebrow">Activity volume</p>
                <h2>Total events</h2>
                <strong>{activities.length}</strong>
              </div>
              <span className="suspicious-activity-summary-icon">◉</span>
            </article>

            <article className="suspicious-activity-summary-card suspicious-activity-summary-card-critical">
              <div>
                <p className="dashboard-panel-eyebrow">Risk level</p>
                <h2>Critical events</h2>
                <strong>{criticalCount}</strong>
              </div>
              <span className="suspicious-activity-summary-icon">!</span>
            </article>

            <article className="suspicious-activity-summary-card suspicious-activity-summary-card-types">
              <div>
                <p className="dashboard-panel-eyebrow">Monitoring</p>
                <h2>Event types</h2>
                <strong>{ACTIVITY_DEFINITIONS.length}</strong>
              </div>
              <span className="suspicious-activity-summary-icon">⌁</span>
            </article>
          </section>

          <section
            className="suspicious-activity-events"
            aria-label="Activity event types"
          >
            <div className="suspicious-activity-section-heading">
              <div>
                <p className="dashboard-panel-eyebrow">Event centre</p>
                <h2>Unusual activity</h2>
              </div>
              <div className="suspicious-activity-order-actions">
                <span>{ACTIVITY_DEFINITIONS.length} event types</span>
                {!isCustomizingOrder ? (
                  <button type="button" onClick={() => {
                    setDraftCategoryOrder(categoryOrder);
                    setDraftEventOrder(eventOrder);
                    setDraggingEventId(null);
                    setDragOverEventId(null);
                    setIsCustomizingOrder(true);
                  }}>
                    Customize activity order
                  </button>
                ) : (
                  <>
                    <span>Move any activity to the top or bottom, or drag it to an exact position anywhere in this list.</span>
                    <button type="button" onClick={saveCategoryOrder}>Save order</button>
                    <button type="button" onClick={() => {
                      setDraftCategoryOrder(categoryOrder);
                      setDraftEventOrder(eventOrder);
                      setDraggingEventId(null);
                      setDragOverEventId(null);
                      setIsCustomizingOrder(false);
                    }}>Cancel</button>
                  </>
                )}
              </div>
            </div>

            <div className="suspicious-activity-category-list">
              <div className="suspicious-activity-event-grid">
                {orderedDefinitions.map((definition, definitionIndex) => {
                  const category = getActivityCategory(definition);
                  const activitySummary = activityCounts.get(definition.id);
                  const count = activitySummary?.count ?? 0;
                  const latestActivityId = activitySummary?.latestActivityId ?? null;
                  const lastSeenActivityId = readState[definition.id];
                  const unread = Boolean(latestActivityId) && latestActivityId !== lastSeenActivityId;
                  const selected = definition.id === selectedEventId;
                  const isDropTarget = dragOverEventId === definition.id && draggingEventId !== definition.id;
                  return (
                    <div
                      key={definition.id}
                      className={[
                        "suspicious-activity-event-card-wrapper",
                        isDropTarget ? "suspicious-activity-event-card-drop-target" : "",
                        draggingEventId === definition.id ? "suspicious-activity-event-card-dragging" : "",
                      ].filter(Boolean).join(" ")}
                      data-activity-sort-id={definition.id}
                      onPointerEnter={() => {
                        if (isCustomizingOrder && draggingEventId && draggingEventId !== definition.id) {
                          setDragOverEventId(definition.id);
                          moveEventToPosition(draggingEventId, definition.id);
                        }
                      }}
                      onPointerMove={(event) => {
                        if (!isCustomizingOrder || !draggingEventId) return;
                        const edge = 96;
                        if (event.clientY < edge) window.scrollBy({ top: -18, behavior: "auto" });
                        else if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: 18, behavior: "auto" });
                      }}
                      onPointerUp={() => {
                        if (draggingEventId && definitionIndex === orderedDefinitions.length - 1) {
                          moveEventToEdge(draggingEventId, "bottom");
                        }
                        setDraggingEventId(null);
                        setDragOverEventId(null);
                      }}
                      onDragOver={(event) => {
                        if (isCustomizingOrder && draggingEventId && draggingEventId !== definition.id) {
                          event.preventDefault();
                          setDragOverEventId(definition.id);
                          moveEventToPosition(draggingEventId, definition.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggingEventId && definitionIndex === orderedDefinitions.length - 1) {
                          moveEventToEdge(draggingEventId, "bottom");
                        }
                        setDraggingEventId(null);
                        setDragOverEventId(null);
                      }}
                    >
                      <button
                        type="button"
                        className={[
                          "suspicious-activity-event-card",
                          `suspicious-activity-event-card-${category}`,
                          definition.risk === "Critical"
                            ? "suspicious-activity-event-card-critical"
                            : "suspicious-activity-event-card-high",
                          selected ? "suspicious-activity-event-card-selected" : "",
                        ].filter(Boolean).join(" ")}
                        aria-pressed={selected}
                        onClick={() => {
                          if (isCustomizingOrder) return;
                          markEventAsSeen(definition);
                          setSelectedEventId((current) =>
                            current === definition.id ? null : definition.id,
                          );
                        }}
                      >
                        <div className="suspicious-activity-event-card-top">
                          <span className="suspicious-activity-event-icon">
                            {definition.risk === "Critical" ? "!" : "•"}
                          </span>
                          <span
                            className={[
                              "suspicious-activity-event-badge",
                              unread ? "suspicious-activity-event-badge-unread" : "",
                            ].filter(Boolean).join(" ")}
                            aria-label={unread ? `${count} new ${definition.label} events` : `${count} ${definition.label} events`}
                          >
                            {count}
                          </span>
                        </div>
                        <div className="suspicious-activity-event-card-body">
                          <strong>{definition.label}</strong>
                          <span>{definition.description}</span>
                          <small className="suspicious-activity-event-category">{getCategoryLabel(category)}</small>
                        </div>
                        <div className="suspicious-activity-event-card-footer">
                          <span>{definition.risk}</span>
                          <span>{selected ? "Viewing" : isCustomizingOrder ? "Rearrange" : "View records"}</span>
                        </div>
                      </button>
                      {isCustomizingOrder ? (
                        <div className="suspicious-activity-event-reorder-actions">
                          <button
                            type="button"
                            aria-label={`Move ${definition.label} to top`}
                            disabled={definitionIndex === 0}
                            onClick={() => moveEventToEdge(definition.id, "top")}
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${definition.label} to bottom`}
                            disabled={definitionIndex === orderedDefinitions.length - 1}
                            onClick={() => moveEventToEdge(definition.id, "bottom")}
                          >
                            Move down
                          </button>
                          <button
                            type="button"
                            className="suspicious-activity-drag-handle"
                            aria-label={`Drag ${definition.label} to reposition`}
                            onPointerDown={() => {
                              setDraggingEventId(definition.id);
                              setDragOverEventId(definition.id);
                            }}
                            onPointerCancel={() => {
                              setDraggingEventId(null);
                              setDragOverEventId(null);
                            }}
                            onDragStart={() => {
                              setDraggingEventId(definition.id);
                              setDragOverEventId(definition.id);
                            }}
                            onDragEnd={() => {
                              setDraggingEventId(null);
                              setDragOverEventId(null);
                            }}
                            draggable
                          >
                            Drag to position
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {selectedDefinition ? (
            <section
              aria-label={`${selectedDefinition.label} records`}
            >
              <header>
                <h2>{selectedDefinition.label}</h2>
                <p>{selectedDefinition.description}</p>
                <span>
                  {selectedActivities.length} event
                  {selectedActivities.length === 1 ? "" : "s"}
                </span>
              </header>

              {selectedActivities.length === 0 ? (
                <p>
                  No {selectedDefinition.label.toLowerCase()} activity
                  has been recorded.
                </p>
              ) : (
                <div>
                  {selectedActivities.map((activity) => (
                    <article className="suspicious-activity-record" key={activity.id}>
                      <header className="suspicious-activity-record-header">
                        <h3>{selectedDefinition.label}</h3>
                        <span>{selectedDefinition.risk}</span>
                      </header>
                      <p className="suspicious-activity-record-summary">
                        {activitySummary(activity, selectedDefinition, branchNameMap)}
                      </p>

                      <dl className="suspicious-activity-record-meta">
                        <div>
                          <dt>Date & time</dt>
                          <dd>{formatTimestamp(activity.timestamp)}</dd>
                        </div>

                        <div>
                          <dt>Changed by</dt>
                          <dd>{activity.actorName ?? "System"}</dd>
                        </div>

                        <div>
                          <dt>Affected record</dt>
                          <dd>
                            {activity.entityId ? (
                              activity.entityType.toLowerCase() === "customer" ? (
                                <button type="button" onClick={() => navigate(`/customer-workstation?customerId=${encodeURIComponent(activity.entityId!)}`)}>
                                  {activityRecordLabel(activity)}
                                </button>
                              ) : activity.entityType.toLowerCase() === "order" ? (
                                <button type="button" onClick={() => navigate(`/orders?orderId=${encodeURIComponent(activity.entityId!)}`)}>
                                  {activityRecordLabel(activity)}
                                </button>
                              ) : activity.entityType.toLowerCase() === "invoice" ? (
                                <button type="button" onClick={() => navigate(`/invoices?invoiceId=${encodeURIComponent(activity.entityId!)}`)}>
                                  {activityRecordLabel(activity)}
                                </button>
                              ) : activity.entityType.toLowerCase() === "payment" ? (
                                <button type="button" onClick={() => navigate(`/payments?paymentId=${encodeURIComponent(activity.entityId!)}`)}>
                                  {activityRecordLabel(activity)}
                                </button>
                              ) : activity.entityType.toLowerCase() === "migrationjob" ? (
                                <button type="button" onClick={() => navigate(`/data-management?jobId=${encodeURIComponent(activity.entityId!)}`)}>
                                  {activityRecordLabel(activity)}
                                </button>
                              ) : activityRecordLabel(activity)
                            ) : activityRecordLabel(activity)}
                          </dd>
                        </div>

                        {activity.reason ? (
                          <div>
                            <dt>Reason</dt>
                            <dd>{activity.reason}</dd>
                          </div>
                        ) : null}
                      </dl>

                      <details className="suspicious-activity-technical-details">
                        <summary>Technical event information</summary>
                        <dl>
                          <div><dt>Action type</dt><dd>{activity.action}</dd></div>
                          <div><dt>Record ID</dt><dd>{activity.entityId ?? "Not recorded"}</dd></div>
                          <div><dt>Correlation ID</dt><dd>{activity.correlationId ?? "Not recorded"}</dd></div>
                        </dl>
                      </details>

                      <AuditMetadataDetails metadata={activity.metadata} />
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <p>
              Select an event button above to view its records.
            </p>
          )}
        </>
      )}
    </main>
  );
}
