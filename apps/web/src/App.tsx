import { Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage.js";
import { LoginPage } from "./pages/auth/LoginPage.js";
import { BusinessRegistrationPage } from "./pages/auth/BusinessRegistrationPage.js";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage.js";
import { SetupPage } from "./pages/auth/SetupPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CustomersPage } from "./pages/customers/CustomersPage.js";
import { CustomerGroupsPage } from "./pages/customers/CustomerGroupsPage.js";
import { CustomerDetailsPage } from "./pages/customers/CustomerDetailsPage.js";
import { CustomerWorkstationPage } from "./pages/customers/CustomerWorkstationPage.js";
import { RequireAuth } from "./routes/RequireAuth.js";
import { DataManagementPage } from "./pages/DataManagementPage.js";
import { ServicesPage } from "./pages/services/ServicesPage.js";
import { ColorsPage } from "./pages/colors/ColorsPage.js";
import { OrdersPage } from "./pages/orders/OrdersPage.js";
import { OrderManagementPage } from "./pages/orders/OrderManagementPage.js";
import { InvoicesPage } from "./pages/invoices/InvoicesPage.js";
import { PaymentsPage } from "./pages/payments/PaymentsPage.js";
import { InventoryPage } from "./pages/inventory/InventoryPage.js";
import { UsersPage } from "./pages/users/UsersPage.js";
import { PermissionsPage } from "./pages/users/PermissionsPage.js";
import { ReportsPage } from "./pages/reports/ReportsPage.js";
import { FinancePage } from "./pages/finance/FinancePage.js";
import { PayrollPage } from "./pages/payroll/PayrollPage.js";
import { PayrollFinancialPage } from "./pages/payroll/PayrollFinancialPage.js";
import { SubscriptionPage } from "./pages/subscriptions/SubscriptionPage.js";
import { PlatformOwnerPage } from "./pages/platform/PlatformOwnerPage.js";
import { SuspiciousActivityPage } from "./pages/security/SuspiciousActivityPage.js";
import { BusinessSettingsPage } from "./pages/business/BusinessSettingsPage.js";
import { BranchesPage } from "./pages/branches/BranchesPage.js";
import { AccountPage } from "./pages/account/AccountPage.js";
import { HelpCentrePage } from "./pages/help/HelpCentrePage.js";
import { InboxPage } from "./pages/inbox/InboxPage.js";
import { CommunicationsPage } from "./pages/communications/CommunicationsPage.js";
import { AppShell } from "./components/layout/AppShell.js";
import { OfflineSyncManager } from "./components/offline-sync/OfflineSyncManager.js";
import { OfflineSubscriptionPaymentManager } from "./components/offline-sync/OfflineSubscriptionPaymentManager.js";
import { SensitiveAuthorizationManager } from "./components/auth/SensitiveAuthorizationManager.js";
import { SensitiveAuthorizationProvider } from "./components/auth/SensitiveAuthorizationProvider.js";

function AuthenticatedLayout() {
  return (
    <RequireAuth>
      <SensitiveAuthorizationProvider>
        <OfflineSyncManager />
        <OfflineSubscriptionPaymentManager />
        <SensitiveAuthorizationManager />
        <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/data-management" element={<DataManagementPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/groups" element={<CustomerGroupsPage />} />
          <Route path="/customers/:id" element={<CustomerDetailsPage />} />
          <Route path="/customer-workstation" element={<CustomerWorkstationPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/communications" element={<CommunicationsPage />} />
          <Route path="/colors" element={<ColorsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/order-management" element={<OrderManagementPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/payroll/financial" element={<PayrollFinancialPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/platform" element={<PlatformOwnerPage />} />
          <Route path="/security/suspicious-activity" element={<SuspiciousActivityPage />} />
          <Route path="/business/settings" element={<BusinessSettingsPage />} />
          <Route path="/branches" element={<BranchesPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/help" element={<HelpCentrePage />} />
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
        </AppShell>
      </SensitiveAuthorizationProvider>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register-business" element={<BusinessRegistrationPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="*" element={<AuthenticatedLayout />} />
    </Routes>
  );
}
