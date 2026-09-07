import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/auth/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CustomersPage } from "./pages/customers/CustomersPage.js";
import { RequireAuth } from "./routes/RequireAuth.js";
import { DataManagementPage } from "./pages/DataManagementPage.js";
import { ServicesPage } from "./pages/services/ServicesPage.js";
import { OrdersPage } from "./pages/orders/OrdersPage.js";
import { InvoicesPage } from "./pages/invoices/InvoicesPage.js";
import { PaymentsPage } from "./pages/payments/PaymentsPage.js";
import { InventoryPage } from "./pages/inventory/InventoryPage.js";
import { UsersPage } from "./pages/users/UsersPage.js";
import { AppShell } from "./components/layout/AppShell.js";

function AuthenticatedLayout() {
  return (
    <RequireAuth>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/data-management" element={<DataManagementPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<AuthenticatedLayout />} />
    </Routes>
  );
}
