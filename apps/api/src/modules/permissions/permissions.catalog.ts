import type { Role } from "@prisma/client";

export interface PermissionDefinition {
  code: string;
  module: string;
  action: string;
  description: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  { code: "branches.view", module: "branches", action: "view", description: "View branches" },
  { code: "branches.create", module: "branches", action: "create", description: "Create branches" },
  { code: "branches.update", module: "branches", action: "update", description: "Update branches" },
  { code: "branches.activate", module: "branches", action: "activate", description: "Activate branches" },
  { code: "branches.deactivate", module: "branches", action: "deactivate", description: "Deactivate branches" },
  { code: "branches.manage_users", module: "branches", action: "manage_users", description: "Manage branch users" },

  { code: "customers.view", module: "customers", action: "view", description: "View customers" },
  { code: "customers.create", module: "customers", action: "create", description: "Create customers" },
  { code: "customers.update", module: "customers", action: "update", description: "Update customers" },
  { code: "customers.change_status", module: "customers", action: "change_status", description: "Change customer status" },

  { code: "services.view", module: "services", action: "view", description: "View services" },
  { code: "services.create", module: "services", action: "create", description: "Create services" },
  { code: "services.update", module: "services", action: "update", description: "Update services" },
  { code: "services.change_status", module: "services", action: "change_status", description: "Change service status" },
  { code: "colors.view", module: "colors", action: "view", description: "View colour catalogue" },
  { code: "colors.manage", module: "colors", action: "manage", description: "Add and manage colours" },

  { code: "orders.view", module: "orders", action: "view", description: "View orders" },
  { code: "orders.create", module: "orders", action: "create", description: "Create orders" },
  { code: "orders.update", module: "orders", action: "update", description: "Update orders" },
  { code: "orders.change_status", module: "orders", action: "change_status", description: "Change order status" },

  { code: "garments.view", module: "garments", action: "view", description: "View garments" },
  { code: "garments.manage", module: "garments", action: "manage", description: "Manage garments" },

  { code: "invoices.view", module: "invoices", action: "view", description: "View invoices" },
  { code: "invoices.manage", module: "invoices", action: "manage", description: "Manage invoices" },

  { code: "payments.view", module: "payments", action: "view", description: "View payments" },
  { code: "payments.manage", module: "payments", action: "manage", description: "Manage payments" },

  { code: "inventory.view", module: "inventory", action: "view", description: "View inventory" },
  { code: "inventory.manage", module: "inventory", action: "manage", description: "Manage inventory" },
  { code: "reports.view", module: "reports", action: "view", description: "View reports" },
  { code: "reports.manage", module: "reports", action: "manage", description: "Manage financial reporting and statement delivery" },

  { code: "expenses.view", module: "expenses", action: "view", description: "View expenses" },
  { code: "expenses.manage", module: "expenses", action: "manage", description: "Create and manage expenses" },
  { code: "expenses.approve", module: "expenses", action: "approve", description: "Approve or reject expenses" },
  { code: "expenses.recognize", module: "expenses", action: "recognize", description: "Recognize expenses for accounting" },
  { code: "expenses.void", module: "expenses", action: "void", description: "Void expenses" },

  { code: "payroll.view", module: "payroll", action: "view", description: "View payroll" },
  { code: "payroll.manage", module: "payroll", action: "manage", description: "Manage payroll" },
  { code: "payroll.approve", module: "payroll", action: "approve", description: "Approve payroll transactions" },

  { code: "compensation.view", module: "compensation", action: "view", description: "View employee compensation" },
  { code: "compensation.manage", module: "compensation", action: "manage", description: "Manage employee compensation" },

  { code: "ious.view", module: "ious", action: "view", description: "View IOUs" },
  { code: "ious.manage", module: "ious", action: "manage", description: "Manage IOUs" },
  { code: "ious.approve", module: "ious", action: "approve", description: "Approve or reject IOUs" },
  { code: "ious.cancel", module: "ious", action: "cancel", description: "Cancel IOUs" },

  { code: "loans.view", module: "loans", action: "view", description: "View loans" },
  { code: "loans.manage", module: "loans", action: "manage", description: "Manage loans" },
  { code: "loans.approve", module: "loans", action: "approve", description: "Approve or reject loans" },
  { code: "loans.cancel", module: "loans", action: "cancel", description: "Cancel loans" },

  { code: "repayments.view", module: "repayments", action: "view", description: "View financial repayments" },
  { code: "repayments.manage", module: "repayments", action: "manage", description: "Manage financial repayments" },
  { code: "repayments.void", module: "repayments", action: "void", description: "Void financial repayments" },

  { code: "migrations.view", module: "migrations", action: "view", description: "View migration jobs" },
  { code: "migrations.manage", module: "migrations", action: "manage", description: "Manage migration jobs" },

  { code: "users.view", module: "users", action: "view", description: "View users" },
  { code: "users.create", module: "users", action: "create", description: "Create users" },
  { code: "users.update", module: "users", action: "update", description: "Update users" },
  { code: "users.delete", module: "users", action: "delete", description: "Delete users while preserving history" },
  { code: "users.manage_permissions", module: "users", action: "manage_permissions", description: "Manage user and role permissions" },

  { code: "business.view", module: "business", action: "view", description: "View business settings" },
  { code: "business.update", module: "business", action: "update", description: "Update business settings" },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  PLATFORM_ADMIN: PERMISSIONS.map((permission) => permission.code),
  BUSINESS_OWNER: PERMISSIONS.map((permission) => permission.code),
  BRANCH_MANAGER: PERMISSIONS.filter((permission) =>
    !permission.code.startsWith("business.") &&
    !permission.code.startsWith("users.manage_permissions") &&
    permission.code !== "branches.manage_users" &&
    permission.code !== "payroll.approve" &&
    permission.code !== "ious.approve" &&
    permission.code !== "ious.cancel" &&
    permission.code !== "loans.approve" &&
    permission.code !== "loans.cancel" &&
    permission.code !== "repayments.void" &&
    permission.code !== "expenses.approve" &&
    permission.code !== "expenses.recognize" &&
    permission.code !== "expenses.void"
  ).map((permission) => permission.code),
  STAFF: PERMISSIONS.filter((permission) =>
    [
      "branches.view",
      "customers.view",
      "customers.create",
      "customers.update",
      "services.view",
      "colors.view",
      "orders.view",
      "orders.create",
      "orders.update",
      "garments.view",
      "garments.manage",
      "invoices.view",
      "invoices.manage",
      "payments.view",
      "payments.manage",
      "inventory.view"
    ].includes(permission.code)
  ).map((permission) => permission.code),
};
