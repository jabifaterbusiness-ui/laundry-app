-- Synchronize the database permission catalogue with the application
-- permission catalogue.
--
-- SECURITY:
-- - Permission IDs are preserved for existing rows.
-- - Existing user permission overrides are not modified.
-- - Existing business role permission records are not modified.
-- - Missing permissions are inserted.
-- - Existing permission metadata is synchronized by unique code.

INSERT INTO "permissions" ("id", "code", "module", "action", "description")
VALUES
    (gen_random_uuid(), 'branches.view', 'branches', 'view', 'View branches'),
    (gen_random_uuid(), 'branches.create', 'branches', 'create', 'Create branches'),
    (gen_random_uuid(), 'branches.update', 'branches', 'update', 'Update branches'),
    (gen_random_uuid(), 'branches.activate', 'branches', 'activate', 'Activate branches'),
    (gen_random_uuid(), 'branches.deactivate', 'branches', 'deactivate', 'Deactivate branches'),
    (gen_random_uuid(), 'branches.manage_users', 'branches', 'manage_users', 'Manage branch users'),

    (gen_random_uuid(), 'customers.view', 'customers', 'view', 'View customers'),
    (gen_random_uuid(), 'customers.create', 'customers', 'create', 'Create customers'),
    (gen_random_uuid(), 'customers.update', 'customers', 'update', 'Update customers'),
    (gen_random_uuid(), 'customers.change_status', 'customers', 'change_status', 'Change customer status'),

    (gen_random_uuid(), 'services.view', 'services', 'view', 'View services'),
    (gen_random_uuid(), 'services.create', 'services', 'create', 'Create services'),
    (gen_random_uuid(), 'services.update', 'services', 'update', 'Update services'),
    (gen_random_uuid(), 'services.change_status', 'services', 'change_status', 'Change service status'),
    (gen_random_uuid(), 'colors.view', 'colors', 'view', 'View colour catalogue'),
    (gen_random_uuid(), 'colors.manage', 'colors', 'manage', 'Add and manage colours'),

    (gen_random_uuid(), 'orders.view', 'orders', 'view', 'View orders'),
    (gen_random_uuid(), 'orders.create', 'orders', 'create', 'Create orders'),
    (gen_random_uuid(), 'orders.update', 'orders', 'update', 'Update orders'),
    (gen_random_uuid(), 'orders.change_status', 'orders', 'change_status', 'Change order status'),

    (gen_random_uuid(), 'garments.view', 'garments', 'view', 'View garments'),
    (gen_random_uuid(), 'garments.manage', 'garments', 'manage', 'Manage garments'),

    (gen_random_uuid(), 'invoices.view', 'invoices', 'view', 'View invoices'),
    (gen_random_uuid(), 'invoices.manage', 'invoices', 'manage', 'Manage invoices'),

    (gen_random_uuid(), 'payments.view', 'payments', 'view', 'View payments'),
    (gen_random_uuid(), 'payments.manage', 'payments', 'manage', 'Manage payments'),
    (gen_random_uuid(), 'customer_accounts.view', 'customer_accounts', 'view', 'View customer account balances and history'),
    (gen_random_uuid(), 'customer_accounts.manage', 'customer_accounts', 'manage', 'Fund, debit and manage customer accounts'),

    (gen_random_uuid(), 'inventory.view', 'inventory', 'view', 'View inventory'),
    (gen_random_uuid(), 'inventory.manage', 'inventory', 'manage', 'Manage inventory'),
    (gen_random_uuid(), 'reports.view', 'reports', 'view', 'View reports'),
    (gen_random_uuid(), 'reports.manage', 'reports', 'manage', 'Manage financial reporting and statement delivery'),

    (gen_random_uuid(), 'expenses.view', 'expenses', 'view', 'View expenses'),
    (gen_random_uuid(), 'expenses.manage', 'expenses', 'manage', 'Create and manage expenses'),
    (gen_random_uuid(), 'expenses.approve', 'expenses', 'approve', 'Approve or reject expenses'),
    (gen_random_uuid(), 'expenses.recognize', 'expenses', 'recognize', 'Recognize expenses for accounting'),
    (gen_random_uuid(), 'expenses.void', 'expenses', 'void', 'Void expenses'),

    (gen_random_uuid(), 'payroll.view', 'payroll', 'view', 'View payroll'),
    (gen_random_uuid(), 'payroll.manage', 'payroll', 'manage', 'Manage payroll'),
    (gen_random_uuid(), 'payroll.approve', 'payroll', 'approve', 'Approve payroll transactions'),

    (gen_random_uuid(), 'compensation.view', 'compensation', 'view', 'View employee compensation'),
    (gen_random_uuid(), 'compensation.manage', 'compensation', 'manage', 'Manage employee compensation'),

    (gen_random_uuid(), 'ious.view', 'ious', 'view', 'View IOUs'),
    (gen_random_uuid(), 'ious.manage', 'ious', 'manage', 'Manage IOUs'),
    (gen_random_uuid(), 'ious.approve', 'ious', 'approve', 'Approve or reject IOUs'),
    (gen_random_uuid(), 'ious.cancel', 'ious', 'cancel', 'Cancel IOUs'),

    (gen_random_uuid(), 'loans.view', 'loans', 'view', 'View loans'),
    (gen_random_uuid(), 'loans.manage', 'loans', 'manage', 'Manage loans'),
    (gen_random_uuid(), 'loans.approve', 'loans', 'approve', 'Approve or reject loans'),
    (gen_random_uuid(), 'loans.cancel', 'loans', 'cancel', 'Cancel loans'),

    (gen_random_uuid(), 'repayments.view', 'repayments', 'view', 'View financial repayments'),
    (gen_random_uuid(), 'repayments.manage', 'repayments', 'manage', 'Manage financial repayments'),
    (gen_random_uuid(), 'repayments.void', 'repayments', 'void', 'Void financial repayments'),

    (gen_random_uuid(), 'migrations.view', 'migrations', 'view', 'View migration jobs'),
    (gen_random_uuid(), 'migrations.manage', 'migrations', 'manage', 'Manage migration jobs'),

    (gen_random_uuid(), 'users.view', 'users', 'view', 'View users'),
    (gen_random_uuid(), 'users.create', 'users', 'create', 'Create users'),
    (gen_random_uuid(), 'users.update', 'users', 'update', 'Update users'),
    (gen_random_uuid(), 'users.delete', 'users', 'delete', 'Delete users while preserving history'),
    (gen_random_uuid(), 'users.manage_permissions', 'users', 'manage_permissions', 'Manage user and role permissions'),

    (gen_random_uuid(), 'business.view', 'business', 'view', 'View business settings'),
    (gen_random_uuid(), 'business.update', 'business', 'update', 'Update business settings'),
    (gen_random_uuid(), 'security.suspicious_activity.view', 'security', 'suspicious_activity_view', 'View suspicious and high-risk activity')
ON CONFLICT ("code") DO UPDATE
SET
    "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";
