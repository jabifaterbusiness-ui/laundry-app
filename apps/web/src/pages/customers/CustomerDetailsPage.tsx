import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api-client.js";
import { getCustomer } from "../../lib/customers-api.js";
import { useAuthStore } from "../../state/auth-store.js";

export function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id!, { accessToken }),
    enabled: Boolean(id),
  });

  if (!id) {
    return (
      <main>
        <h1>Customer details</h1>
        <p role="alert">Customer ID is required.</p>
      </main>
    );
  }

  if (customerQuery.isLoading) {
    return (
      <main>
        <h1>Customer details</h1>
        <p>Loading customer...</p>
      </main>
    );
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <main>
        <h1>Customer details</h1>
        <p role="alert">
          {customerQuery.error instanceof ApiError
            ? customerQuery.error.message
            : "Unable to load customer details. Please try again."}
        </p>
        <button type="button" onClick={() => navigate("/customers")}>
          Back to customers
        </button>
      </main>
    );
  }

  const customer = customerQuery.data;

  return (
    <main>
      <div>
        <button type="button" onClick={() => navigate("/customers")}>
          Back to customers
        </button>
      </div>

      <h1>{customer.name}</h1>

      <div>
        <p><strong>Customer ID:</strong> {customer.id}</p>
        <p><strong>Phone:</strong> {customer.phone}</p>
        <p><strong>Email:</strong> {customer.email ?? "-"}</p>
        <p><strong>Address:</strong> {customer.address ?? "-"}</p>
        <p><strong>Status:</strong> {customer.lifecycleStatus}</p>
        <p><strong>Status reason:</strong> {customer.statusReason ?? "-"}</p>
        <p><strong>Notes:</strong> {customer.notes ?? "-"}</p>
      </div>

      <div>
        <button
          type="button"
          onClick={() =>
            navigate(`/orders?customerId=${encodeURIComponent(customer.id)}`)
          }
        >
          Add New Order
        </button>
      </div>
    </main>
  );
}
