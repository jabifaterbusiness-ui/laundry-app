import { Link } from "react-router-dom";
import { useAuthStore } from "../state/auth-store.js";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {user?.fullName ?? "unknown user"} ({user?.role ?? "no role"}).</p>
      <nav>
        <Link to="/customers">Customers</Link>
      </nav>
      <p>Other business modules (orders, invoices, etc.) are not implemented yet.</p>
    </main>
  );
}
