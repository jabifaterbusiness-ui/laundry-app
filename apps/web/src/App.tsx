import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/auth/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CustomersPage } from "./pages/customers/CustomersPage.js";
import { RequireAuth } from "./routes/RequireAuth.js";

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
        path="/customers"
        element={
          <RequireAuth>
            <CustomersPage />
          </RequireAuth>
        }
      />
      {/* Future module routes (orders, invoices, payments, inventory,
          reports) are intentionally not wired up yet. */}
    </Routes>
  );
}
