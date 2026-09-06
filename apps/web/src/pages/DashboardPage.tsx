import { useAuthStore } from "../state/auth-store.js";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        Signed in as {user?.fullName ?? "unknown user"} (
        {user?.role ?? "no role"}).
      </p>
      <p>
        Manage customers, services, laundry orders, invoices, receipts, and
        payments from the business dashboard.
      </p>
    </main>
  );
}
