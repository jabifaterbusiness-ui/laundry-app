import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCustomer } from "../../lib/customers-api.js";
import { getOrder } from "../../lib/orders-api.js";
import { ApiError } from "../../lib/api-client.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import { OrderManagement } from "./OrderManagement.js";
import { useAuthStore } from "../../state/auth-store.js";
import type { Order } from "@laundry-app/shared";

export function OrderManagementPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const authorizationRequestedForRef = useRef<string | null>(null);
  const [authorizedOrderId, setAuthorizedOrderId] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ["order-management-page", orderId, activeBranchId],
    queryFn: () => getOrder(orderId!, { accessToken }, activeBranchId),
    enabled: Boolean(accessToken && activeBranchId && orderId),
  });

  const customerQuery = useQuery({
    queryKey: ["order-management-page-customer", orderQuery.data?.customerId],
    queryFn: () => getCustomer(orderQuery.data!.customerId, { accessToken }),
    enabled: Boolean(accessToken && orderQuery.data?.customerId),
  });

  useEffect(() => {
    const order = orderQuery.data;
    const customer = customerQuery.data;
    if (!order || !customer || authorizedOrderId === order.id ||
        authorizationRequestedForRef.current === order.id) {
      return;
    }

    authorizationRequestedForRef.current = order.id;
    let active = true;
    setAuthorizationError(null);

    void requestSensitiveAuthorization()
      .then((authorization) => {
        if (!active) return;
        if (!authorization) {
          navigate("/orders", { replace: true });
          return;
        }
        setAuthorizedOrderId(order.id);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAuthorizationError(
          error instanceof Error ? error.message : "Unable to authorize Order Management.",
        );
      });

    return () => {
      active = false;
    };
  }, [
    orderQuery.data,
    customerQuery.data,
    authorizedOrderId,
    requestSensitiveAuthorization,
    navigate,
  ]);

  if (!orderId) {
    return (
      <main>
        <h1>Order Management</h1>
        <p>Open an order from the Orders section or enter an order number in Universal Search.</p>
        <button type="button" onClick={() => navigate("/orders")}>Go to Orders</button>
      </main>
    );
  }

  if (orderQuery.isLoading || customerQuery.isLoading) {
    return <main><h1>Order Management</h1><p>Loading the selected order...</p></main>;
  }

  if (orderQuery.isError || customerQuery.isError || !orderQuery.data || !customerQuery.data) {
    const error = orderQuery.error ?? customerQuery.error;
    return (
      <main>
        <h1>Order Management</h1>
        <p role="alert">
          {error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load this order."}
        </p>
        <button type="button" onClick={() => navigate("/orders")}>Back to Orders</button>
      </main>
    );
  }

  if (authorizationError) {
    return (
      <main>
        <h1>Order Management</h1>
        <p role="alert">{authorizationError}</p>
        <button type="button" onClick={() => navigate("/orders")}>Back to Orders</button>
      </main>
    );
  }

  if (authorizedOrderId !== orderQuery.data.id) {
    return <main><h1>Order Management</h1><p>Confirm your identity to open this order...</p></main>;
  }

  const order: Order = orderQuery.data;

  return (
    <main>
      <h1>Order Management</h1>
      <OrderManagement
        order={order}
        customer={customerQuery.data}
        mode="view"
        onBack={() => navigate("/orders")}
        onSwitchCustomer={() => navigate(`/orders?customerId=${encodeURIComponent(customerQuery.data.id)}`)}
        onNewOrder={(customer) => navigate(`/orders?customerId=${encodeURIComponent(customer.id)}`)}
        onSelectOrder={(nextOrder) => navigate(`/order-management?orderId=${encodeURIComponent(nextOrder.id)}`)}
        onEditOrder={(selectedOrder) => navigate(`/orders?orderId=${encodeURIComponent(selectedOrder.id)}&edit=1`)}
      />
    </main>
  );
}
