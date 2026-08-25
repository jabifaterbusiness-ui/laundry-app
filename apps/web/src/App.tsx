import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/auth/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CustomersPage } from "./pages/customers/CustomersPage.js";
import { RequireAuth } from "./routes/RequireAuth.js";
import { DataManagementPage } from "./pages/DataManagementPage.js";
import { ServicesPage } from "./pages/services/ServicesPage.js";

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
      {/* Future module routes (orders, invoices, payments, inventory,
          reports) are intentionally not wired up yet. */}
    </Routes>
  );
}
