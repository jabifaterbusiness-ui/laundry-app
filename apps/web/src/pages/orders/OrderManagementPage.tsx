import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
  const userId = useAuthStore((state) => state.user?.id);
  const businessId = useAuthStore((state) => state.user?.businessId);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const requestAuthorizationRef = useRef(requestSensitiveAuthorization);
  const authorizationRequestedForRef = useRef<string | null>(null);
  const [authorizedContext, setAuthorizedContext] = useState<{
    orderId: string;
    locationKey: string;
    userId: string;
    businessId: string;
    branchId: string;
  } | null>(null);
  const isAuthorizedForCurrentLocation =
    authorizedContext?.orderId === orderId &&
    authorizedContext.locationKey === location.key &&
    authorizedContext.userId === userId &&
    authorizedContext.businessId === businessId &&
    authorizedContext.branchId === activeBranchId;
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ["order-management-page", businessId, userId, orderId, activeBranchId],
    queryFn: () => getOrder(orderId!, { accessToken }, activeBranchId),
    enabled: Boolean(accessToken && userId && businessId && activeBranchId && orderId && isAuthorizedForCurrentLocation),
  });

  const customerQuery = useQuery({
    queryKey: ["order-management-page-customer", businessId, activeBranchId, orderQuery.data?.customerId],
    queryFn: () => getCustomer(orderQuery.data!.customerId, { accessToken }),
    enabled: Boolean(accessToken && businessId && activeBranchId && isAuthorizedForCurrentLocation && orderQuery.data?.customerId),
  });

  useEffect(() => {
    requestAuthorizationRef.current = requestSensitiveAuthorization;
  }, [requestSensitiveAuthorization]);

  useEffect(() => {
    authorizationRequestedForRef.current = null;
    setAuthorizedContext(null);
  }, [userId, businessId, activeBranchId]);

  useEffect(() => {
    if (
      !orderId ||
      !userId ||
      !businessId ||
      !activeBranchId ||
      isAuthorizedForCurrentLocation
    ) {
      return;
    }

    const authorizationKey = [
      location.key,
      orderId,
      userId,
      businessId,
      activeBranchId,
    ].join(":");
    if (authorizationRequestedForRef.current === authorizationKey) return;

    authorizationRequestedForRef.current = authorizationKey;
    let active = true;
    setAuthorizationError(null);

    void requestAuthorizationRef.current()
      .then((authorization) => {
        if (!active) return;
        if (!authorization) {
          navigate("/orders", { replace: true });
          return;
        }
        setAuthorizedContext({
          orderId,
          locationKey: location.key,
          userId,
          businessId,
          branchId: activeBranchId,
        });
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
    orderId,
    location.key,
    userId,
    businessId,
    activeBranchId,
    isAuthorizedForCurrentLocation,
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

  if (authorizationError) {
    return (
      <main>
        <h1>Order Management</h1>
        <p role="alert">{authorizationError}</p>
        <button type="button" onClick={() => navigate("/orders")}>Back to Orders</button>
      </main>
    );
  }

  if (!isAuthorizedForCurrentLocation) {
    return <main><h1>Order Management</h1><p>Confirm your identity to open this order...</p></main>;
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

  const order: Order = orderQuery.data;

  return (
    <main>
      <h1>Order Management</h1>
      <OrderManagement
        order={order}
        customer={customerQuery.data}
        mode="view"
        onBack={() => navigate("/orders")}
        onSwitchCustomer={() => navigate("/orders?customerPicker=1")}
        onNewOrder={(customer) => navigate(`/orders?customerId=${encodeURIComponent(customer.id)}`)}
        onSelectOrder={(nextOrder) => navigate(`/order-management?orderId=${encodeURIComponent(nextOrder.id)}`)}
        onEditOrder={(selectedOrder) => navigate(`/orders?orderId=${encodeURIComponent(selectedOrder.id)}&edit=1`)}
      />
    </main>
  );
}
