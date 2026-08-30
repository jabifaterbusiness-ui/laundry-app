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

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/data-management"
        element={
          <RequireAuth>
            <DataManagementPage />
          </RequireAuth>
        }
      />
      <Route
        path="/customers"
        element={
          <RequireAuth>
            <CustomersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/services"
        element={
          <RequireAuth>
            <ServicesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/orders"
        element={
          <RequireAuth>
            <OrdersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/invoices"
        element={
          <RequireAuth>
            <InvoicesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/payments"
        element={
          <RequireAuth>
            <PaymentsPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
