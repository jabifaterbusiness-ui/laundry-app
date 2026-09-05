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

  { code: "payroll.view", module: "payroll", action: "view", description: "View payroll" },
  { code: "payroll.manage", module: "payroll", action: "manage", description: "Manage payroll" },
  { code: "payroll.approve", module: "payroll", action: "approve", description: "Approve payroll transactions" },

  { code: "migrations.view", module: "migrations", action: "view", description: "View migration jobs" },
  { code: "migrations.manage", module: "migrations", action: "manage", description: "Manage migration jobs" },

  { code: "users.view", module: "users", action: "view", description: "View users" },
  { code: "users.create", module: "users", action: "create", description: "Create users" },
  { code: "users.update", module: "users", action: "update", description: "Update users" },
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
    permission.code !== "payroll.approve"
  ).map((permission) => permission.code),
  STAFF: PERMISSIONS.filter((permission) =>
    [
      "branches.view",
      "customers.view",
      "customers.create",
      "customers.update",
      "services.view",
      "orders.view",
      "orders.create",
      "orders.update",
      "garments.view",
      "garments.manage",
      "invoices.view",
      "payments.view",
      "payments.manage",
      "inventory.view"
    ].includes(permission.code)
  ).map((permission) => permission.code),
};
