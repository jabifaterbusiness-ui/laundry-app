import { Link } from "react-router-dom";
import { useAuthStore } from "../state/auth-store.js";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const canManageData = user?.role === "BUSINESS_OWNER" || user?.role === "BRANCH_MANAGER";

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {user?.fullName ?? "unknown user"} ({user?.role ?? "no role"}).</p>
      <nav>
        <Link to="/customers">Customers</Link> | <Link to="/services">Services & Price List</Link> | <Link to="/orders">Orders</Link>{canManageData ? <> | <Link to="/data-management">Backup & Data Migration</Link></> : null}
      </nav>
      <p>Manage customers, services, and laundry orders from the business dashboard.</p>
    </main>
  );
}
