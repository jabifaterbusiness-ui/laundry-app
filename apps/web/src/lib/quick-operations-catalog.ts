export interface QuickOperationDefinition {
  code: string;
  name: string;
  description: string;
  permission: string;
  requiresConfirmation: boolean;
  sensitive: boolean;
}

export const QUICK_OPERATIONS: QuickOperationDefinition[] = [
  {
    code: "MCB",
    name: "Manual Cloud Backup",
    description: "Create an encrypted backup immediately using the last verified cloud destination.",
    permission: "migrations.manage",
    requiresConfirmation: false,
    sensitive: false,
  },
  {
    code: "MLB",
    name: "Manual Local Backup",
    description: "Create an encrypted backup immediately and download it to this device.",
    permission: "migrations.manage",
    requiresConfirmation: false,
    sensitive: false,
  },
  {
    code: "MU",
    name: "Manual Update",
    description: "Make an authorized manual update to a supported business record.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "TO",
    name: "Transfer Order",
    description: "Transfer the selected order to another customer account.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "TC",
    name: "Transfer Customer",
    description: "Transfer supported customer records to another customer account.",
    permission: "customers.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "MC",
    name: "Merge Customer",
    description: "Merge duplicate customer accounts within the active branch while preserving transaction history.",
    permission: "customers.update",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "VO",
    name: "Void Operation",
    description: "Void a supported financial or operational record without deleting its history.",
    permission: "payments.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "RF",
    name: "Refund",
    description: "Process an authorized refund for a supported payment.",
    permission: "payments.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "RI",
    name: "Reprint Invoice / Receipt",
    description: "Open or print an existing invoice or receipt.",
    permission: "invoices.view",
    requiresConfirmation: false,
    sensitive: false,
  },
  {
    code: "RS",
    name: "Resend Receipt",
    description: "Resend an existing digital receipt through a supported delivery channel.",
    permission: "invoices.view",
    requiresConfirmation: true,
    sensitive: false,
  },
  {
    code: "RC",
    name: "Reconcile",
    description: "Run an authorized reconciliation for supported business records.",
    permission: "invoices.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "SI",
    name: "Stock Issue",
    description: "Record an inventory issue against the active branch.",
    permission: "inventory.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "SR",
    name: "Stock Receipt",
    description: "Record an inventory receipt against the active branch.",
    permission: "inventory.manage",
    requiresConfirmation: true,
    sensitive: true,
  },
  {
    code: "SO",
    name: "Switch Order",
    description: "Switch the active workspace to another order.",
    permission: "orders.view",
    requiresConfirmation: false,
    sensitive: false,
  },
  {
    code: "SC",
    name: "Switch Customer",
    description: "Switch the active workspace to another customer.",
    permission: "customers.view",
    requiresConfirmation: false,
    sensitive: false,
  },
  {
    code: "SOS",
    name: "Safe Stop / Safe Exit",
    description: "Safely stop the current workflow while protecting unsaved and pending business state.",
    permission: "orders.update",
    requiresConfirmation: true,
    sensitive: true,
  },
];

export function searchQuickOperations(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return QUICK_OPERATIONS.filter((operation) =>
    [
      operation.code,
      operation.name,
      operation.description,
    ].some((value) => value.toLowerCase().includes(normalized)),
  );
}
