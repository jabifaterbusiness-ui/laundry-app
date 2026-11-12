import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Customer,
  Order,
  OrderStatus,
} from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import {
  createOrderWithOfflineQueue,
  getOrder,
  listAllOrders,
  listOrders,
  updateOrder,
  updateOrderStatusWithOfflineQueue,
  type EditOrderInput,
} from "../../lib/orders-api.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import {
  createCustomerWithOfflineQueue,
  getCustomer,
  listCustomers,
} from "../../lib/customers-api.js";
import { listServices, listPricingRules, listCustomerServicePrices, type Service } from "../../lib/services-api.js";
import {
  createColor,
  listColors,
} from "../../lib/colors-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useOrderWorkspaceStore } from "../../state/order-workspace-store.js";
import { loadOrderWorkspaceState } from "../../lib/order-workspace-persistence.js";
import { OrderWorkspaceSwitcher } from "./OrderWorkspaceSwitcher.js";
import { OrderManagement } from "./OrderManagement.js";
import { CustomerFormDialog } from "../customers/CustomerFormDialog.js";

const PAGE_SIZE = 25;

const STATUSES: OrderStatus[] = [
  "RECEIVED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
];

interface OrderLine {
  id?: string;
  serviceId: string;
  quantity: number;
  colors: string[];
}

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString();
}

function statusLabel(status: OrderStatus) {
  return status.replaceAll("_", " ");
}

export function OrdersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const workspaces = useOrderWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useOrderWorkspaceStore(
    (s) => s.activeWorkspaceId,
  );
  const openWorkspace = useOrderWorkspaceStore(
    (s) => s.openWorkspace,
  );
  const switchWorkspace = useOrderWorkspaceStore(
    (s) => s.switchWorkspace,
  );
  const closeWorkspace = useOrderWorkspaceStore(
    (s) => s.closeWorkspace,
  );
  const updateWorkspace = useOrderWorkspaceStore(
    (s) => s.updateWorkspace,
  );
    const restoreWorkspaces = useOrderWorkspaceStore(
      (s) => s.restoreWorkspaces,
    );

  const customerIdFromUrl = searchParams.get("customerId");
  const openCustomerAccountFromUrl = searchParams.get("openAccount") === "1";
  const returnToFromUrl = searchParams.get("returnTo");
  const returnToCustomerWorkstation =
    new URLSearchParams(location.search).get("returnTo") === "customer-workstation";
  const [workspaceReturnTo, setWorkspaceReturnTo] = useState<"customer-workstation" | null>(
    returnToCustomerWorkstation ? "customer-workstation" : null,
  );
  const workspaceReturnToRef = useRef<"customer-workstation" | null>(
    returnToCustomerWorkstation ? "customer-workstation" : null,
  );
  if (returnToCustomerWorkstation) {
    workspaceReturnToRef.current = "customer-workstation";
  }

  useEffect(() => {
    if (returnToFromUrl === "customer-workstation") {
      workspaceReturnToRef.current = "customer-workstation";
      setWorkspaceReturnTo("customer-workstation");
    }
  }, [returnToFromUrl]);
  const orderIdFromUrl = searchParams.get("orderId");
  const editOrderFromUrl = searchParams.get("edit") === "1";
  const customerPickerFromUrl = searchParams.get("customerPicker") === "1";
  const newOrderFromUrl = searchParams.get("newOrder") === "1";

  const openedCustomerFromUrlRef = useRef<string | null>(null);
  const openedOrderFromUrlRef = useRef<string | null>(null);

  const activeWorkspace =
    workspaces.find(
      (workspace) => workspace.id === activeWorkspaceId,
    ) ?? null;
  const orderFormWorkspaces = workspaces.filter(
    (workspace) => workspace.mode !== "view",
  );
  const activeOrderFormWorkspaceId = orderFormWorkspaces.some(
    (workspace) => workspace.id === activeWorkspaceId,
  )
    ? activeWorkspaceId
    : null;

  // Keep page-level UI state synchronized with the selected
  // customer workspace. Workspace mode, rather than activeOrder
  // being null, determines whether this workspace is in New Order
  // or Order Management mode.
  useEffect(() => {
    if (!activeWorkspace) {
      setSelectedOrder(null);
      setFormOpen(false);
      return;
    }

    setSelectedOrder(activeWorkspace.activeOrder ?? null);
    setFormOpen(
      activeWorkspace.mode === "new" || activeWorkspace.mode === "edit",
    );
  }, [
    activeWorkspaceId,
    activeWorkspace?.activeOrder?.id,
    activeWorkspace?.mode,
  ]);

  useEffect(() => {
    if (!user?.businessId || !activeBranchId) {
      return;
    }

    const saved = loadOrderWorkspaceState(
      user.businessId,
      user.id,
      activeBranchId,
    );

    if (saved && saved.workspaces.length > 0) {
      restoreWorkspaces(
        saved.workspaces,
        saved.activeWorkspaceId,
      );
    }
  }, [
    user?.businessId,
    user?.id,
    activeBranchId,
    restoreWorkspaces,
  ]);


  const canCreateOrder = hasPermission(user, "orders.create");
  const canUpdateOrder = hasPermission(user, "orders.update");
  const canUpdateStatus = hasPermission(user, "orders.change_status");
  const canManageColors = hasPermission(user, "colors.manage");

  const [page, setPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const [openFolder, setOpenFolder] = useState<
    | "received"
    | "outstanding"
    | "ready"
    | "cancelled"
    | "all"
    | null
  >(null);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [customerId, setCustomerId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [orderFormDirty, setOrderFormDirty] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [switchingCustomer, setSwitchingCustomer] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [initialCustomerPhone, setInitialCustomerPhone] = useState("");
  const [customerCreateMessage, setCustomerCreateMessage] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    if (!customerPickerFromUrl) return;
    setSwitchingCustomer(true);
    setCustomerSearch("");
    setCustomerPickerOpen(true);
    navigate("/order-management", { replace: true });
  }, [customerPickerFromUrl, navigate]);

  useEffect(() => {
    if (searchParams.get("addCustomer") !== "1") return;
    if (!hasPermission(user, "customers.create")) {
      navigate("/orders", { replace: true });
      return;
    }
    setInitialCustomerPhone(searchParams.get("customerPhone") ?? "");
    setCustomerPickerOpen(false);
    setNewCustomerOpen(true);
    navigate("/orders", { replace: true });
  }, [searchParams, user, navigate]);
  const [formError, setFormError] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editConfirmed, setEditConfirmed] = useState(false);
  const [openColorSelector, setOpenColorSelector] = useState<number | null>(
    null,
  );
  const [colorSelectorSearch, setColorSelectorSearch] = useState("");
  const [colorSelectorLineIndex, setColorSelectorLineIndex] = useState(0);
  const [newColorName, setNewColorName] = useState("");
  const [adjustmentSelections, setAdjustmentSelections] = useState<Record<string, { scope: "INVOICE" | "ITEMS"; itemIndexes: number[] }>>({});
  const [selectedTaxRuleIds, setSelectedTaxRuleIds] = useState<string[]>([]);

  useEffect(() => {
    setAdjustmentSelections({});
    setSelectedTaxRuleIds([]);
  }, [activeWorkspaceId]);


  const orderListCustomerId = activeWorkspace?.mode === "view"
    ? activeWorkspace.customer.id
    : customerId;

  const ordersQuery = useQuery({
    queryKey: [
      "orders",
      {
        page,
        status,
        customerId: orderListCustomerId,
        search: orderSearch,
        branchId: activeBranchId,
      },
    ],
    queryFn: () =>
      listOrders(
        {
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
          customerId: orderListCustomerId || undefined,
          search: orderSearch.trim() || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "order-selector", activeBranchId, customerSearch],
    queryFn: () =>
      listCustomers(
        {
          page: 1,
          pageSize: customerSearch.trim() ? 25 : 100,
          search: customerSearch.trim() || undefined,
          status: "active",
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const customerFromUrlQuery = useQuery({
    queryKey: ["customer", activeBranchId, customerIdFromUrl],
    queryFn: () =>
      getCustomer(customerIdFromUrl!, { accessToken }),
    enabled: Boolean(accessToken && activeBranchId && customerIdFromUrl),
  });

  const servicesQuery = useQuery({
    queryKey: ["services", "order-selector", activeBranchId],
    queryFn: () =>
      listServices(
        {
          status: "active",
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const pricingRulesQuery = useQuery({
    queryKey: ["pricing-rules", activeBranchId, activeWorkspace?.draft.customerId ?? ""],
    queryFn: () => listPricingRules(
      { accessToken },
      activeWorkspace?.draft.customerId || undefined,
      "order",
    ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  useEffect(() => {
    if (!pricingRulesQuery.isSuccess) return;
    const allowedManualIds = new Set(
      pricingRulesQuery.data.adjustments
        .filter((rule) => rule.targetScope === "MANUAL")
        .map((rule) => rule.id),
    );
    setAdjustmentSelections((current) => {
      const next: typeof current = {};
      for (const id of Object.keys(current)) {
        if (allowedManualIds.has(id)) next[id] = current[id]!;
      }
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
    const allowedTaxIds = new Set(
      pricingRulesQuery.data.taxes
        .filter((rule) => rule.isActive && !rule.enabledByDefault)
        .map((rule) => rule.id),
    );
    setSelectedTaxRuleIds((current) => {
      const next = current.filter((id) => allowedTaxIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [pricingRulesQuery.data, pricingRulesQuery.isSuccess]);

  const colorsQuery = useQuery({
    queryKey: ["colors", "order-selector"],
    queryFn: () =>
      listColors(
        {
          status: "active",
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken),
  });

  const addColorMutation = useMutation({
    mutationFn: (name: string) =>
      createColor(name ? { name } : { name: "" }, { accessToken }),
    onSuccess: (color) => {
      queryClient.invalidateQueries({
        queryKey: ["colors", "order-selector"],
      });

      if (activeWorkspaceId && color) {
        setColorSelectorSearch("");
        setOpenColorSelector(null);

        const currentLine = lines[colorSelectorLineIndex];

        if (currentLine) {
          const selected = currentLine.colors ?? [];

          if (!selected.includes(color.name)) {
            updateLine(colorSelectorLineIndex, "colors", [
              ...selected,
              color.name,
            ]);
          }
        }
      }
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to add colour. Please try again.",
      );
    },
  });

  const createMutation = useMutation({
    mutationKey: ["orders"],
    mutationFn: () =>
      createOrderWithOfflineQueue(
        {
          customerId: formCustomerId,
          items: lines.map((line) => ({
            serviceId: line.serviceId,
            quantity: line.quantity,
            colors: line.colors ?? [],
          })),
          adjustments: Object.entries(adjustmentSelections).map(([adjustmentId, selection]) => ({
            adjustmentId,
            scope: selection.scope,
            ...(selection.scope === "ITEMS" ? { itemIndexes: selection.itemIndexes } : {}),
          })),
          taxRuleIds: selectedTaxRuleIds,
          garmentNote: garmentNote.trim() || undefined,
          internalNote: internalNote.trim() || undefined,
          expectedReadyAt: expectedReadyAt
            ? new Date(expectedReadyAt).toISOString()
            : undefined,
        },
        { accessToken },
        {
          businessId: user?.businessId ?? "",
          branchId: activeBranchId ?? "",
          actorUserId: user?.id ?? "",
        },
      ),
    onSuccess: (result) => {
      if (result.queued) {
        setFormError(
          "Order saved offline and will be synchronized when the connection is restored.",
        );
        return;
      }

      const order = result.order;

      queryClient.invalidateQueries({ queryKey: ["orders"] });

      if (activeWorkspaceId) {
        updateWorkspace(activeWorkspaceId, {
          activeOrder: order,
          mode: "view",
          draft: {
            lines: [{ serviceId: "", quantity: 1, colors: [] }],
            garmentNote: "",
            internalNote: "",
            expectedReadyAt: "",
          },
        });
      }

      markOrderFormDirty(false);
      setFormOpen(false);
      setFormError(null);
      setSelectedOrder(order);

      if (workspaceReturnToRef.current === "customer-workstation" || workspaceReturnTo === "customer-workstation") {
        workspaceReturnToRef.current = null;
        setWorkspaceReturnTo(null);
        navigate(
          `/customer-workstation?customerId=${encodeURIComponent(
            order.customerId,
          )}`,
        );
      }
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to create order. Please try again.",
      );
    },
  });

  const editMutation = useMutation({
    mutationKey: ["orders", "edit-invoice"],
    mutationFn: async () => {
      const order = activeWorkspace?.activeOrder ?? selectedOrder;

      if (!order || order.id !== selectedOrder?.id) {
        throw new Error("Reopen the existing order before editing its invoice.");
      }

      if (!canUpdateOrder) {
        throw new Error("You do not have permission to edit orders.");
      }

      if (!editReason.trim()) {
        throw new Error("Enter a reason for this invoice correction.");
      }

      if (!editConfirmed) {
        throw new Error("Confirm that the customer has agreed to these changes.");
      }

      const authorization = await requestSensitiveAuthorization();
      if (!authorization) {
        throw new Error("Sensitive authorization is required to edit this invoice.");
      }

      const input: EditOrderInput = {
        reason: editReason.trim(),
        confirmed: true,
        items: lines.map((line) => ({
          ...(line.id ? { id: line.id } : {}),
          serviceId: line.serviceId,
          quantity: line.quantity,
          colors: line.colors ?? [],
        })),
        garmentNote: garmentNote.trim() || null,
        internalNote: internalNote.trim() || null,
        expectedReadyAt: expectedReadyAt
          ? new Date(expectedReadyAt).toISOString()
          : null,
      };

      return updateOrder(
        order.id,
        input,
        { accessToken },
        activeBranchId,
        authorization,
      );
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-management"] });

      if (activeWorkspaceId) {
        updateWorkspace(activeWorkspaceId, {
          activeOrder: order,
          mode: "view",
          draft: {
            customerId: order.customerId,
            lines: [{ serviceId: "", quantity: 1, colors: [] }],
            garmentNote: "",
            internalNote: "",
            expectedReadyAt: "",
          },
        });
      }

      setSelectedOrder(order);
      markOrderFormDirty(false);
      setFormOpen(false);
      setFormError(null);
      setEditReason("");
      setEditConfirmed(false);
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError && error.status === 422 && error.details
          ? `${error.message}: ${JSON.stringify(error.details)}`
          : error instanceof Error
            ? error.message
          : "Unable to save invoice changes. Please try again.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationKey: ["orders"],
    mutationFn: (input: { id: string; status: OrderStatus }) =>
      updateOrderStatusWithOfflineQueue(
        input.id,
        input.status,
        { accessToken },
        {
          businessId: user?.businessId ?? "",
          branchId: activeBranchId ?? "",
          actorUserId: user?.id ?? "",
        },
      ),
    onSuccess: (result) => {
      if (result.queued) {
        setFormError(
          "Order update saved offline and will be synchronized when the connection is restored.",
        );
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setSelectedOrder(result.order);
    },
  });

  const customers = customersQuery.data?.data ?? [];

  const orderFromUrlQuery = useQuery({
    queryKey: ["order", orderIdFromUrl, activeBranchId],
    queryFn: () => getOrder(orderIdFromUrl!, { accessToken }, activeBranchId),
    enabled: Boolean(accessToken && activeBranchId && orderIdFromUrl),
  });

  useEffect(() => {
    if (!orderIdFromUrl) return;

    if (location.pathname !== "/order-management") {
      navigate(
        `/order-management?orderId=${encodeURIComponent(orderIdFromUrl)}${editOrderFromUrl ? "&edit=1" : ""}`,
        { replace: true },
      );
      return;
    }

    const navigationKey = `${location.key}:${orderIdFromUrl}:${editOrderFromUrl ? "edit" : "view"}`;
    if (openedOrderFromUrlRef.current === navigationKey) return;

    const order = orderFromUrlQuery.data;
    if (!order) return;

    openedOrderFromUrlRef.current = navigationKey;
    if (editOrderFromUrl) {
      void startEditInvoice(order).then(() => {
        navigate("/order-management", { replace: true });
      });
      return;
    }

    void (async () => {
      try {
        const customer = await getCustomer(order.customerId, { accessToken });
        markOrderFormDirty(false);
    const workspaceId = openWorkspace(customer, { order });
        switchWorkspace(workspaceId);
        updateWorkspace(workspaceId, { activeOrder: order, mode: "view" });
        setSelectedOrder(order);
        setFormOpen(false);
        setCustomerPickerOpen(false);
        navigate("/order-management", { replace: true });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Unable to open this order.");
      }
    })();
  }, [
    location.key,
    location.pathname,
    orderIdFromUrl,
    editOrderFromUrl,
    orderFromUrlQuery.data,
    accessToken,
    navigate,
    openWorkspace,
    switchWorkspace,
    updateWorkspace,
  ]);

  useEffect(() => {
    if (!newOrderFromUrl || customerIdFromUrl) return;
    setCustomerSearch("");
    setCustomerPickerOpen(true);
    setFormOpen(false);
    navigate("/order-management", { replace: true });
  }, [newOrderFromUrl, customerIdFromUrl, navigate]);

  useEffect(() => {
    const navigationKey = customerIdFromUrl
      ? `${location.key}:${customerIdFromUrl}`
      : null;
    if (
      !customerIdFromUrl ||
      openedCustomerFromUrlRef.current === navigationKey
    ) {
      return;
    }

    const customer = customerFromUrlQuery.data;
    if (!customer) {
      return;
    }

    openedCustomerFromUrlRef.current = navigationKey;
    if (openCustomerAccountFromUrl) {
      openCustomerAccount(customer);
      navigate("/order-management", { replace: true });
    } else {
      // openCustomerWorkspace performs navigation and preserves returnTo in
      // the URL when this flow originated in Customer Workstation.
      openCustomerWorkspace(customer, newOrderFromUrl, returnToFromUrl === "customer-workstation");
    }
  }, [
    location.key,
    customerIdFromUrl,
    newOrderFromUrl,
    returnToFromUrl,
    openCustomerAccountFromUrl,
    customerFromUrlQuery.data,
    openCustomerWorkspace,
    navigate,
  ]);

  const services = servicesQuery.data?.data ?? [];
  const colors = colorsQuery.data?.data ?? [];
  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.pagination;

  const selectedServices = useMemo(() => {
    const map = new Map<string, Service>();

    for (const service of services) {
      map.set(service.id, service);
    }

    return map;
  }, [services]);

  const formCustomerId =
    activeWorkspace?.draft.customerId ?? "";
  const pricingAdjustments = pricingRulesQuery.data?.adjustments ?? [];
  const automaticDiscountRules = pricingAdjustments.filter(
    (rule) => rule.isActive && rule.targetScope !== "MANUAL",
  );
  const manualAdjustmentRules = pricingAdjustments.filter(
    (rule) => rule.isActive && rule.targetScope === "MANUAL",
  );

  const customerPricesQuery = useQuery({
    queryKey: ["customer-service-prices", activeBranchId, formCustomerId, "order-form"],
    queryFn: () => listCustomerServicePrices(formCustomerId, { accessToken }),
    enabled: Boolean(accessToken && activeBranchId && formCustomerId && activeWorkspace?.mode !== "edit"),
  });
  const customerPriceMap = useMemo(
    () => new Map((customerPricesQuery.data?.data ?? []).map((entry) => [entry.serviceId, entry.unitPrice])),
    [customerPricesQuery.data],
  );
  const customerPricesReady =
    activeWorkspace?.mode === "edit" ||
    !formCustomerId ||
    customerPricesQuery.isSuccess ||
    Boolean(customerPricesQuery.data);
  const getEffectiveUnitPrice = (service: Service) =>
    customerPriceMap.get(service.id) ?? service.unitPrice;

  const lines =
    activeWorkspace?.draft.lines ?? [
      { serviceId: "", quantity: 1, colors: [] },
    ];

  const garmentNote =
    activeWorkspace?.draft.garmentNote ?? "";

  const internalNote =
    activeWorkspace?.draft.internalNote ?? "";

  const expectedReadyAt =
    activeWorkspace?.draft.expectedReadyAt ?? "";

  const formTotal = customerPricesReady
    ? lines.reduce((sum, line) => {
        const service = selectedServices.get(line.serviceId);
        return sum + (service ? line.quantity * getEffectiveUnitPrice(service) : 0);
      }, 0)
    : null;

  function markOrderFormDirty(value: boolean) {
    setOrderFormDirty(value);
    if (activeWorkspaceId) updateWorkspace(activeWorkspaceId, { isDirty: value });
  }

  function closeForm() {
    markOrderFormDirty(false);
    if (activeWorkspace?.mode === "edit" && activeWorkspaceId) {
      updateWorkspace(activeWorkspaceId, { mode: "view" });
    }
    setFormOpen(false);
    setFormError(null);
    setEditReason("");
    setEditConfirmed(false);
  }

  function openCreate() {
    if (location.pathname !== "/order-management") {
      navigate("/order-management?newOrder=1");
      return;
    }
    markOrderFormDirty(false);
    setSelectedOrder(null);
    setFormError(null);

    if (activeWorkspace) {
      updateWorkspace(activeWorkspace.id, {
        mode: "new",
      });
      setFormOpen(true);
      setCustomerPickerOpen(false);
      return;
    }

    setCustomerSearch("");
    setCustomerPickerOpen(true);
    setFormOpen(false);
  }

  function openCustomerWorkspace(customer: Customer, forceNewOrder = false, returnToCustomerWorkstation = false) {
    const shouldReturnToCustomerWorkstation =
      returnToCustomerWorkstation ||
      returnToFromUrl === "customer-workstation" ||
      returnToCustomerWorkstation;
    if (shouldReturnToCustomerWorkstation) {
      workspaceReturnToRef.current = "customer-workstation";
      setWorkspaceReturnTo("customer-workstation");
    }
    // Keep the return destination in the URL because route transitions may
    // remount this page and clear component-local refs.
    const orderManagementPath = shouldReturnToCustomerWorkstation
      ? "/order-management?returnTo=customer-workstation"
      : "/order-management";
    markOrderFormDirty(false);
    const existingWorkspace = workspaces.find(
      (workspace) => workspace.customer.id === customer.id,
    );

    const workspaceId = openWorkspace(customer, {
      ...(shouldReturnToCustomerWorkstation
        ? { returnTo: "customer-workstation" as const }
        : {}),
    });
    if (shouldReturnToCustomerWorkstation) {
      updateWorkspace(workspaceId, { returnTo: "customer-workstation" });
    }
    switchWorkspace(workspaceId);

    if (existingWorkspace && !forceNewOrder) {
      setSelectedOrder(existingWorkspace.activeOrder);
      setFormError(null);
      setCustomerPickerOpen(false);
      setFormOpen(existingWorkspace.mode === "new" || existingWorkspace.mode === "edit");
      navigate(orderManagementPath);
      return;
    }
    if (existingWorkspace && forceNewOrder) {
      updateWorkspace(workspaceId, {
        activeOrder: null,
        mode: "new",
        isDirty: false,
        draft: {
          customerId: customer.id,
          lines: [{ serviceId: "", quantity: 1, colors: [] }],
          garmentNote: "",
          internalNote: "",
          expectedReadyAt: "",
        },
      });
      setSelectedOrder(null);
      setFormError(null);
      setCustomerPickerOpen(false);
      setFormOpen(true);
      navigate(orderManagementPath);
      return;
    }

    updateWorkspace(workspaceId, {
      mode: "new",
      draft: {
        customerId: customer.id,
        lines: [{ serviceId: "", quantity: 1, colors: [] }],
        garmentNote: "",
        internalNote: "",
        expectedReadyAt: "",
      },
    });
    setSelectedOrder(null);
    setFormError(null);
    setCustomerPickerOpen(false);
    setFormOpen(true);
    navigate(orderManagementPath);
  }

  function openCustomerAccount(customer: Customer) {
    const workspaceId = openWorkspace(customer);
    switchWorkspace(workspaceId);
    updateWorkspace(workspaceId, { mode: "view", activeOrder: null });
    setSelectedOrder(null);
    setFormError(null);
    setCustomerPickerOpen(false);
    setFormOpen(false);
  }

  async function switchCustomerWorkspace(customer: Customer) {
    setCustomerPickerOpen(false);
    setFormError(null);

    const existingWorkspace = workspaces.find(
      (workspace) => workspace.customer.id === customer.id,
    );
    if (existingWorkspace) {
      switchWorkspace(existingWorkspace.id);
      setSelectedOrder(existingWorkspace.activeOrder);
      setFormOpen(existingWorkspace.mode === "new" || existingWorkspace.mode === "edit");
      setSwitchingCustomer(false);
      return;
    }

    try {
      const result = await listOrders(
        { page: 1, pageSize: 1, customerId: customer.id },
        { accessToken },
        activeBranchId,
      );
      const latestOrder = result.data[0] ?? null;
      const workspaceId = openWorkspace(customer, { order: latestOrder });
      switchWorkspace(workspaceId);
      updateWorkspace(workspaceId, {
        activeOrder: latestOrder,
        mode: latestOrder || !canCreateOrder ? "view" : "new",
      });
      setSelectedOrder(latestOrder);
      setFormOpen(!latestOrder && canCreateOrder);
      setSwitchingCustomer(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to switch customer.");
      setSwitchingCustomer(false);
    }
  }

  function selectCustomerForNewOrder(customer: Customer) {
    if (switchingCustomer) {
      void switchCustomerWorkspace(customer);
      return;
    }

    const existingWorkspace = workspaces.find(
      (workspace) => workspace.customer.id === customer.id,
    );

    const workspaceId = openWorkspace(customer);
    switchWorkspace(workspaceId);

    if (!existingWorkspace) {
      updateWorkspace(workspaceId, {
        mode: "new",
        isDirty: false,
        draft: {
          customerId: customer.id,
          lines: [{ serviceId: "", quantity: 1, colors: [] }],
          garmentNote: "",
          internalNote: "",
          expectedReadyAt: "",
        },
      });
    } else {
      setSelectedOrder(null);
      updateWorkspace(workspaceId, {
        activeOrder: null,
        mode: "new",
        draft: {
          customerId: customer.id,
          lines: [{ serviceId: "", quantity: 1, colors: [] }],
          garmentNote: "",
          internalNote: "",
          expectedReadyAt: "",
        },
      });
    }

    setFormError(null);
    setCustomerPickerOpen(false);
    setFormOpen(true);
    navigate("/order-management");
  }

  function addLine() {
    if (!activeWorkspaceId) return;
    markOrderFormDirty(true);

    updateWorkspace(activeWorkspaceId, {
      draft: {
        lines: [
          ...lines,
          { serviceId: "", quantity: 1, colors: [] },
        ],
      },
    });
  }

  function removeLine(index: number) {
    if (!activeWorkspaceId) return;
    markOrderFormDirty(true);

    updateWorkspace(activeWorkspaceId, {
      draft: {
        lines: lines.filter((_, i) => i !== index),
      },
    });
  }

  function updateLine(
    index: number,
    field: keyof OrderLine,
    value: OrderLine[typeof field],
  ) {
    if (!activeWorkspaceId) return;
    markOrderFormDirty(true);

    updateWorkspace(activeWorkspaceId, {
      draft: {
        lines: lines.map((line, i) =>
          i === index
            ? {
                ...line,
                [field]: value,
              }
            : line,
        ),
      },
    });
  }

  function toggleColorSelector(index: number) {
    if (openColorSelector === index) {
      setOpenColorSelector(null);
      setColorSelectorSearch("");
      return;
    }

    setColorSelectorLineIndex(index);
    setOpenColorSelector(index);
    setColorSelectorSearch("");
  }

  function toggleColor(index: number, colorName: string) {
    const selected = lines[index]?.colors ?? [];

    updateLine(
      index,
      "colors",
      selected.includes(colorName)
        ? selected.filter((color) => color !== colorName)
        : [...selected, colorName],
    );
  }

  function openAddColor(index: number) {
    setColorSelectorLineIndex(index);
    setNewColorName("");
  }

  function submitNewColor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newColorName.trim();

    if (!name) {
      return;
    }

    addColorMutation.mutate(name);
  }

  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!activeWorkspaceId || !formCustomerId) {
      setFormError("Select or add a customer before creating an order.");
      return;
    }

    if (lines.length === 0) {
      setFormError("An order must contain at least one item.");
      return;
    }

    if (lines.some((line) => !line.serviceId)) {
      setFormError("Select a service for every order line.");
      return;
    }

    if (
      lines.some(
        (line) =>
          !Number.isInteger(line.quantity) ||
          line.quantity < 1,
      )
    ) {
      setFormError(
        "Every quantity must be a positive whole number.",
      );
      return;
    }

    if (activeWorkspace?.mode === "edit") {
      if (!selectedOrder || selectedOrder.id !== activeWorkspace.activeOrder?.id) {
        setFormError("The selected invoice changed. Reopen it before saving.");
        return;
      }
      if (!editReason.trim()) {
        setFormError("Enter a reason for this invoice correction.");
        return;
      }
      if (!editConfirmed) {
        setFormError("Confirm that the customer has agreed to these changes.");
        return;
      }
      editMutation.mutate();
      return;
    }

    createMutation.mutate();
  }

  function openOrderManagement(order: Order) {
    navigate(
      `/order-management?orderId=${encodeURIComponent(order.id)}`,
    );
  }

  async function startEditInvoice(order: Order) {
    if (!canUpdateOrder) {
      setFormError("You do not have permission to edit orders.");
      return;
    }

    markOrderFormDirty(false);
    const customer =
      (activeWorkspace?.customer.id === order.customerId
        ? activeWorkspace.customer
        : customers.find((item) => item.id === order.customerId)) ??
      (await getCustomer(order.customerId, { accessToken }).catch(() => null));

    if (!customer) {
      setFormError("Unable to load the customer for this invoice.");
      return;
    }

    markOrderFormDirty(false);
    const workspaceId = openWorkspace(customer, { order });
    switchWorkspace(workspaceId);
    updateWorkspace(workspaceId, {
      activeOrder: order,
      mode: "edit",
      draft: {
        customerId: order.customerId,
        lines: order.items.map((item) => ({
          id: item.id,
          serviceId: item.serviceId,
          quantity: item.quantity,
          colors: [...(item.colors ?? [])],
        })),
        garmentNote: order.garmentNote ?? "",
        internalNote: order.internalNote ?? "",
        expectedReadyAt: order.expectedReadyAt
          ? (() => {
              const date = new Date(order.expectedReadyAt!);
              return Number.isNaN(date.getTime())
                ? ""
                : new Date(
                    date.getTime() - date.getTimezoneOffset() * 60000,
                  ).toISOString().slice(0, 16);
            })()
          : "",
      },
    });

    setSelectedOrder(order);
    setEditReason("");
    setEditConfirmed(false);
    setFormError(null);
    setFormOpen(true);
    setCustomerPickerOpen(false);
  }

  function renderOrderTable(sectionOrders: Order[]) {
    if (sectionOrders.length === 0) {
      return <p>No orders in this section.</p>;
    }


  return (
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Expected Ready</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {sectionOrders.map((order) => {
            return (
              <tr key={order.id}>
                <td>
                  <button
                    type="button"
                    onClick={() => openOrderManagement(order)}
                  >
                    {order.orderNumber}
                  </button>
                </td>
                <td>{order.customer?.name ?? "Customer unavailable"}</td>
                <td>{statusLabel(order.status)}</td>
                <td>{formatMoney(order.orderTotal)}</td>
                <td>{formatDate(order.expectedReadyAt)}</td>
                <td>{formatDate(order.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  async function handleCreateCustomer(
    input: Parameters<typeof createCustomerWithOfflineQueue>[0],
  ) {
    const result = await createCustomerWithOfflineQueue(
      input,
      { accessToken },
      {
        businessId: user?.businessId ?? "",
        branchId: activeBranchId ?? "",
        actorUserId: user?.id ?? "",
      },
    );

    if (result.queued || !result.customer) {
      setNewCustomerOpen(false);
      setCustomerCreateMessage(
        "Customer creation was saved offline. Reconnect and synchronize before creating the order.",
      );
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["customers"] });
    setNewCustomerOpen(false);
    setCustomerCreateMessage(null);
    selectCustomerForNewOrder(result.customer);
  }

  const allOrdersQuery = useQuery({
    queryKey: ["orders", "all-orders", activeBranchId],
    queryFn: () =>
      listAllOrders({}, { accessToken }, activeBranchId),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const allOrders = allOrdersQuery.data ?? [];

  const receivedOrders = allOrders.filter(
    (order) => order.status === "RECEIVED",
  );

  const outstandingOrders = allOrders.filter(
    (order) =>
      order.status === "RECEIVED" ||
      order.status === "IN_PROGRESS",
  );

  const readyOrders = allOrders.filter(
    (order) =>
      order.status === "READY_FOR_PICKUP" ||
      order.status === "COMPLETED",
  );

  const cancelledOrders = allOrders.filter(
    (order) => order.status === "CANCELLED",
  );

  const visibleFolderOrders =
    openFolder === "received"
      ? receivedOrders
      : openFolder === "outstanding"
        ? outstandingOrders
        : openFolder === "ready"
          ? readyOrders
          : openFolder === "cancelled"
            ? cancelledOrders
            : openFolder === "all"
              ? allOrders
              : [];

    const showOrderForm = formOpen || Boolean(
      activeWorkspace
      && (activeWorkspace.mode === "new" || activeWorkspace.mode === "edit")
      && !customerPickerOpen
      && !switchingCustomer,
    );
    const newOrderContent = showOrderForm ? (

        <section aria-labelledby="new-order-heading">
          <h2 id="new-order-heading">Order Details</h2>
          <form onSubmit={submitOrder} onChange={() => markOrderFormDirty(true)}>
            <div>
              <div>
                <strong>Customer</strong>
                {activeWorkspace?.customer ? (
                  <p>
                    {activeWorkspace.customer.name}
                    {activeWorkspace.customer.phone
                      ? ` — ${activeWorkspace.customer.phone}`
                      : ""}
                  </p>
                ) : (
                  <p>No customer selected.</p>
                )}
                <button
                  type="button"
                  disabled={activeWorkspace?.mode === "edit"}
                  onClick={() => {
                    setSwitchingCustomer(true);
                    setCustomerSearch("");
                    setFormOpen(false);
                    setCustomerPickerOpen(true);
                  }}
                >
                  Change customer
                </button>
              </div>
            </div>

            <h3>Items</h3>

            <table>
              <thead>
                <tr>
                  <th>QTY</th>
                  <th>Item</th>
                  <th>Colors</th>
                  <th>PCS</th>
                  <th>Unit Price</th>
                  <th>Total Price</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>

              <tbody>
                {lines.map((line, index) => {
                  const service = selectedServices.get(
                    line.serviceId,
                  );

                  const totalPieces = service
                    ? line.quantity * service.pieces
                    : 0;

                  const lineTotal =
                    service && customerPricesReady
                      ? line.quantity * getEffectiveUnitPrice(service)
                      : null;

                  return (
                    <tr key={`${index}-${line.serviceId}`}>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "quantity",
                              Number(event.target.value),
                            )
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={line.serviceId}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "serviceId",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">
                            Select service
                          </option>

                          {services.map((item) => (
                            <option
                              key={item.id}
                              value={item.id}
                            >
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <div
                          style={{
                            position: "relative",
                            minWidth: 180,
                          }}
                        >
                          <button
                            type="button"
                            aria-label={`Select colors for item ${index + 1}`}
                            onClick={() => toggleColorSelector(index)}
                            aria-expanded={openColorSelector === index}
                            style={{
                              width: "100%",
                              minHeight: 40,
                              padding: "8px 12px",
                              border: "1px solid #ccc",
                              borderRadius: 8,
                              background: "#fff",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <span>
                              {(line.colors ?? []).length > 0
                                ? line.colors.join(", ")
                                : "Select colours"}
                            </span>
                            <span
                              aria-hidden="true"
                              style={{
                                float: "right",
                                marginLeft: 8,
                              }}
                            >
                              ▾
                            </span>
                          </button>

                          {openColorSelector === index ? (
                            <div
                              role="dialog"
                              aria-label={`Colour selector for item ${index + 1}`}
                              style={{
                                position: "absolute",
                                top: "calc(100% + 6px)",
                                left: 0,
                                right: 0,
                                minWidth: 260,
                                zIndex: 100,
                                background: "#fff",
                                border: "1px solid #ddd",
                                borderRadius: 8,
                                boxShadow:
                                  "0 8px 24px rgba(0, 0, 0, 0.12)",
                                padding: 12,
                              }}
                            >
                              <input
                                type="search"
                                placeholder="Search colours"
                                value={colorSelectorSearch}
                                onChange={(event) =>
                                  setColorSelectorSearch(
                                    event.target.value,
                                  )
                                }
                                aria-label={`Search colours for item ${index + 1}`}
                                autoFocus
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  padding: "9px 11px",
                                  border: "1px solid #ccc",
                                  borderRadius: 8,
                                  marginBottom: 8,
                                }}
                              />

                              <div
                                style={{
                                  maxHeight: 220,
                                  overflowY: "auto",
                                  border: "1px solid #eee",
                                  borderRadius: 6,
                                }}
                              >
                                {colors
                                  .filter((color) =>
                                    color.name
                                      .toLowerCase()
                                      .includes(
                                        colorSelectorSearch
                                          .trim()
                                          .toLowerCase(),
                                      ),
                                  )
                                  .map((color) => {
                                    const checked = (
                                      line.colors ?? []
                                    ).includes(color.name);

                                    return (
                                      <label
                                        key={color.id}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          padding: "9px 10px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            toggleColor(
                                              index,
                                              color.name,
                                            )
                                          }
                                        />
                                        <span>{color.name}</span>
                                      </label>
                                    );
                                  })}

                                {colors.filter((color) =>
                                  color.name
                                    .toLowerCase()
                                    .includes(
                                      colorSelectorSearch
                                        .trim()
                                        .toLowerCase(),
                                    ),
                                ).length === 0 ? (
                                  <p
                                    style={{
                                      padding: "10px",
                                      margin: 0,
                                    }}
                                  >
                                    No matching colours.
                                  </p>
                                ) : null}
                              </div>

                              {canManageColors ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 10,
                                  }}
                                >
                                  <input
                                    value={newColorName}
                                    onChange={(event) =>
                                      setNewColorName(
                                        event.target.value,
                                      )
                                    }
                                    placeholder="New colour name"
                                    aria-label="New colour name"
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      padding: "8px 10px",
                                      border: "1px solid #ccc",
                                      borderRadius: 8,
                                    }}
                                  />

                                  <button
                                    type="button"
                                    disabled={
                                      addColorMutation.isPending ||
                                      !newColorName.trim()
                                    }
                                    onClick={() => {
                                      const name =
                                        newColorName.trim();

                                      if (!name) {
                                        return;
                                      }

                                      addColorMutation.mutate(name);
                                    }}
                                  >
                                    {addColorMutation.isPending
                                      ? "Adding..."
                                      : "+ Add New Colour"}
                                  </button>
                                </div>
                              ) : null}

                              <button
                                type="button"
                                onClick={() =>
                                  toggleColorSelector(index)
                                }
                                style={{
                                  width: "100%",
                                  marginTop: 10,
                                }}
                              >
                                Done
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td>{totalPieces}</td>

                      <td>
                        {!customerPricesReady
                          ? "Loading customer price…"
                          : service
                            ? formatMoney(getEffectiveUnitPrice(service))
                            : "-"}
                      </td>

                      <td>{lineTotal === null ? "—" : formatMoney(lineTotal)}</td>

                      <td>
                        <button
                          type="button"
                          disabled={lines.length === 1}
                          onClick={() => removeLine(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <button type="button" onClick={addLine}>
              Add item
            </button>

            <p>
              <strong>Order Total: {formTotal === null ? "Loading customer prices…" : formatMoney(formTotal)}</strong>
            </p>

            <div>
              <label>
                Expected Ready
                <input
                  type="datetime-local"
                  value={expectedReadyAt}
                  onChange={(event) => {
                    if (!activeWorkspaceId) return;

                    updateWorkspace(activeWorkspaceId, {
                      draft: {
                        expectedReadyAt: event.target.value,
                      },
                    });
                  }}
                />
              </label>
            </div>

            <div>
              <label>
                Garment / Customer Note
                <textarea
                  value={garmentNote}
                  onChange={(event) => {
                    if (!activeWorkspaceId) return;

                    updateWorkspace(activeWorkspaceId, {
                      draft: {
                        garmentNote: event.target.value,
                      },
                    });
                  }}
                  maxLength={2000}
                />
              </label>
            </div>

            <div>
              <label>
                Internal Note
                <textarea
                  value={internalNote}
                  onChange={(event) => {
                    if (!activeWorkspaceId) return;

                    updateWorkspace(activeWorkspaceId, {
                      draft: {
                        internalNote: event.target.value,
                      },
                    });
                  }}
                  maxLength={2000}
                />
              </label>
            </div>

            {activeWorkspace?.mode === "edit" && (
              <section aria-label="Invoice correction confirmation">
                <label>
                  Reason for correction
                  <textarea
                    value={editReason}
                    onChange={(event) => setEditReason(event.target.value)}
                    maxLength={1000}
                    required
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editConfirmed}
                    onChange={(event) => setEditConfirmed(event.target.checked)}
                  />
                  Customer has agreed to these invoice changes
                </label>
              </section>
            )}

            {activeWorkspace?.mode !== "edit" && (
              <section aria-label="Invoice discounts and taxes" style={{ margin: "1rem 0", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: 12 }}>
                <h3>Invoice discounts & taxes</h3>
                {pricingRulesQuery.isLoading && <p>Loading pricing options...</p>}
                {automaticDiscountRules.length > 0 && (
                  <div aria-label="Automatic customer discounts" style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                    <h4 style={{ margin: 0 }}>Automatic customer discounts</h4>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                      Eligible customer, group and promotion discounts are applied automatically when their service conditions match. Staff do not need to select them.
                    </p>
                    {automaticDiscountRules.map((rule) => (
                      <div key={rule.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "0.5rem 0", borderBottom: "1px solid var(--border, #eee)" }}>
                        <span>{rule.name}</span>
                        <strong>{rule.percentage}% · Automatic</strong>
                      </div>
                    ))}
                  </div>
                )}
                {manualAdjustmentRules.length > 0 && (
                  <div aria-label="Manual adjustments" style={{ display: "grid", gap: 6 }}>
                    <h4 style={{ margin: 0 }}>Manual adjustments</h4>
                    {manualAdjustmentRules.map((rule) => {
                      const selection = adjustmentSelections[rule.id];
                      return (
                        <div key={rule.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border, #eee)" }}>
                          <label>
                            <input type="checkbox" checked={Boolean(selection)} onChange={(event) => setAdjustmentSelections((current) => {
                              const next = { ...current };
                              if (event.target.checked) next[rule.id] = { scope: "INVOICE", itemIndexes: [] };
                              else delete next[rule.id];
                              return next;
                            })} />
                            {rule.name} ({rule.percentage > 0 ? "+" : ""}{rule.percentage}%)
                          </label>
                          {selection && (
                            <div style={{ marginLeft: "1.5rem" }}>
                              <label>Apply to<select value={selection.scope} onChange={(event) => setAdjustmentSelections((current) => ({ ...current, [rule.id]: { scope: event.target.value as "INVOICE" | "ITEMS", itemIndexes: [] } }))}>
                                <option value="INVOICE">Entire invoice</option><option value="ITEMS">Selected items only</option>
                              </select></label>
                              {selection.scope === "ITEMS" && lines.map((line, index) => {
                                const service = selectedServices.get(line.serviceId);
                                return <label key={index} style={{ display: "block" }}>
                                  <input type="checkbox" checked={selection.itemIndexes.includes(index)} onChange={(event) => setAdjustmentSelections((current) => {
                                    const existing = current[rule.id] ?? { scope: "ITEMS" as const, itemIndexes: [] };
                                    return { ...current, [rule.id]: { scope: "ITEMS", itemIndexes: event.target.checked ? [...existing.itemIndexes, index] : existing.itemIndexes.filter((item) => item !== index) } };
                                  })} />
                                  {service?.name || `Order item ${index + 1}`} × {line.quantity}
                                </label>;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!formCustomerId && (
                  <p style={{ color: "#64748b", fontSize: 13 }}>
                    Select a customer to load discounts assigned to that customer or their groups.
                  </p>
                )}
                <h4>Taxes</h4>
                {(pricingRulesQuery.data?.taxes ?? []).filter((rule) => rule.isActive).map((rule) => (
                  <label key={rule.id} style={{ display: "block", margin: "0.35rem 0" }}>
                    <input type="checkbox" checked={rule.enabledByDefault || selectedTaxRuleIds.includes(rule.id)} disabled={rule.enabledByDefault} onChange={(event) => setSelectedTaxRuleIds((current) => event.target.checked ? [...current, rule.id] : current.filter((id) => id !== rule.id))} />
                    {rule.name} — {rule.kind === "PERCENTAGE" ? `${rule.value}%` : formatMoney(rule.value)} · {rule.treatment === "ADDITIVE" ? "Added" : "Withheld"}{rule.enabledByDefault ? " · Automatic on new invoices" : ""}
                  </label>
                ))}
                {pricingRulesQuery.isError && <p role="alert">Unable to load discounts and taxes. You can still create an order using the standard price.</p>}
              </section>
            )}

            {formCustomerId && activeWorkspace?.mode !== "edit" && customerPricesQuery.isLoading && (
              <p role="status">Loading this customer's agreed service prices before calculating the order…</p>
            )}
            {formCustomerId && activeWorkspace?.mode !== "edit" && customerPricesQuery.isError && !customerPricesQuery.data && (
              <div role="alert">
                <p>Unable to load this customer's agreed prices. The order is blocked to prevent standard prices being used by mistake.</p>
                <button type="button" onClick={() => void customerPricesQuery.refetch()} disabled={customerPricesQuery.isFetching}>Retry customer pricing</button>
              </div>
            )}
            {formError && <p role="alert">{formError}</p>}

            <button
              type="submit"
              disabled={createMutation.isPending || editMutation.isPending || (activeWorkspace?.mode !== "edit" && !customerPricesReady)}
            >
              {editMutation.isPending
                ? "Saving changes..."
                : createMutation.isPending
                  ? "Creating..."
                  : activeWorkspace?.mode === "edit"
                    ? "Save Invoice Changes"
                    : "Create order"}
            </button>

            <button type="button" onClick={closeForm}>
              Cancel
            </button>
          </form>
        </section>
  ) : null;

  return (
    <main>
      <h1>{activeWorkspace ? `Order Management · ${activeWorkspace.customer.name}` : location.pathname === "/order-management" ? "Order Management" : "Orders"}</h1>
      {activeWorkspace && (activeWorkspace.mode !== "view" || activeWorkspace.activeOrder) ? (
        <>
          <OrderManagement
            order={activeWorkspace.activeOrder}
            isDirty={orderFormDirty || Boolean(activeWorkspace.isDirty)}
            customer={activeWorkspace.customer}
            mode={activeWorkspace.mode}
            newOrderContent={newOrderContent}
            onBack={() => {
              const customerId = activeWorkspace.customer.id;
              const shouldReturnToCustomerWorkstation =
                activeWorkspace.returnTo === "customer-workstation" ||
                workspaceReturnToRef.current === "customer-workstation" ||
                workspaceReturnTo === "customer-workstation" ||
                returnToFromUrl === "customer-workstation" ||
                returnToCustomerWorkstation;
              markOrderFormDirty(false);
              closeWorkspace(activeWorkspace.id);
              if (shouldReturnToCustomerWorkstation) {
                workspaceReturnToRef.current = null;
                setWorkspaceReturnTo(null);
                navigate(`/customer-workstation?customerId=${encodeURIComponent(customerId)}`);
                return;
              }
              navigate(location.pathname === "/order-management" ? "/order-management" : "/orders");
            }}
            onSwitchCustomer={() => {
              setSwitchingCustomer(true);
              setCustomerSearch("");
              setCustomerPickerOpen(true);
            }}
            onNewOrder={selectCustomerForNewOrder}
            onSelectOrder={(nextOrder) => {
              updateWorkspace(activeWorkspace.id, { activeOrder: nextOrder, mode: "view" });
              setSelectedOrder(nextOrder);
              setFormOpen(false);
            }}
            onEditOrder={(selected) => { void startEditInvoice(selected); }}
          />
          {orderFormWorkspaces.length > 0 && (
            <OrderWorkspaceSwitcher
              workspaces={orderFormWorkspaces}
              activeWorkspaceId={activeOrderFormWorkspaceId}
              onOpenCustomer={() => {
                setSwitchingCustomer(true);
                setCustomerSearch("");
                setCustomerPickerOpen(true);
              }}
              onSwitch={(workspaceId) => {
                switchWorkspace(workspaceId);
                setCustomerPickerOpen(false);
                setFormError(null);
              }}
              onClose={(workspaceId) => closeWorkspace(workspaceId)}
            />
          )}
        </>
      ) : (
        <>
      <label style={{ display: "block", maxWidth: 520, margin: "12px 0" }}>
        Search orders
        <input
          type="search"
          name="orders-search"
          autoComplete="off"
          placeholder="Order number, customer name, phone or email"
          value={orderSearch}
          onChange={(event) => { setOrderSearch(event.target.value); setPage(1); }}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }}
        />
      </label>

      {canCreateOrder ? (
        <div>
          <button type="button" onClick={openCreate}>
            New Order
          </button>
        </div>
      ) : null}

      {ordersQuery.isLoading && <p>Loading orders...</p>}

      {ordersQuery.isError && (
        <p role="alert">
          {ordersQuery.error instanceof ApiError
            ? ordersQuery.error.message
            : "Failed to load orders. Please try again."}
        </p>
      )}

      {ordersQuery.isSuccess && orders.length === 0 && (
        <p>No orders found.</p>
      )}

      {ordersQuery.isSuccess && (
        <section aria-label="Order folders">
          {[
            {
              id: "received" as const,
              title: "Received",
              count: receivedOrders.length,
            },
            {
              id: "outstanding" as const,
              title: "Outstanding / Unpicked Orders",
              count: outstandingOrders.length,
            },
            {
              id: "ready" as const,
              title: "Ready for Pickup / Completed",
              count: readyOrders.length,
            },
            {
              id: "cancelled" as const,
              title: "Cancelled",
              count: cancelledOrders.length,
            },
            {
              id: "all" as const,
              title: "All Orders",
              count: allOrders.length,
            },
          ].map((folder) => {
            const isOpen = openFolder === folder.id;

            return (
              <section
                key={folder.id}
                aria-labelledby={`${folder.id}-folder-heading`}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  marginBottom: 10,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpenFolder(isOpen ? null : folder.id);
                    setPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    border: 0,
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span id={`${folder.id}-folder-heading`}>
                    <strong>{folder.title}</strong>
                    <span style={{ marginLeft: 8 }}>
                      ({folder.count})
                    </span>
                  </span>
                  <span aria-hidden="true">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: 16 }}>
                    {renderOrderTable(visibleFolderOrders)}
                  </div>
                )}
              </section>
            );
          })}
        </section>
      )}

      {newOrderContent}

      {orderFormWorkspaces.length > 0 && (
        <OrderWorkspaceSwitcher
          workspaces={orderFormWorkspaces}
          activeWorkspaceId={activeOrderFormWorkspaceId}
          onOpenCustomer={() => {
            setCustomerSearch("");
            setCustomerPickerOpen(true);
          }}
          onSwitch={(workspaceId) => {
            switchWorkspace(workspaceId);
            setCustomerPickerOpen(false);
            setFormError(null);
          }}
          onClose={(workspaceId) => {
            closeWorkspace(workspaceId);
          }}
        />
      )}




        </>
      )}

      {customerPickerOpen && (
        <section aria-labelledby="customer-picker-heading">
          <h2 id="customer-picker-heading">Find Customer</h2>

          <input
            type="search"
            autoFocus
            placeholder="Name, phone, email, order number or invoice number"
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
          />

          {customersQuery.isLoading && <p>Searching customers...</p>}

          {customersQuery.isError && (
            <p role="alert">
              {customersQuery.error instanceof ApiError
                ? customersQuery.error.message
                : "Failed to search customers."}
            </p>
          )}

          {customersQuery.isSuccess && customers.length > 0 && (
            <div>
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomerForNewOrder(customer)}
                >
                  {customer.name}
                  {customer.phone ? ` — ${customer.phone}` : ""}
                  {customer.email ? ` — ${customer.email}` : ""}
                </button>
              ))}
            </div>
          )}

          {customersQuery.isSuccess &&
            customers.length === 0 &&
            customerSearch.trim() && (
              <div>
                <p>No matching customer found.</p>
                {hasPermission(user, "customers.create") ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerCreateMessage(null);
                      setNewCustomerOpen(true);
                    }}
                  >
                    Add New Customer
                  </button>
                ) : null}
              </div>
            )}

          <button
            type="button"
            onClick={() => {
              setCustomerPickerOpen(false);
              setCustomerSearch("");
              setSwitchingCustomer(false);
              if (activeWorkspace) {
                setFormOpen(true);
              }
            }}
          >
            Cancel
          </button>
        </section>
      )}

      {customerCreateMessage ? <p role="status">{customerCreateMessage}</p> : null}
      {newCustomerOpen ? (
        <CustomerFormDialog
          customer={null}
          initialPhone={initialCustomerPhone}
          onCancel={() => setNewCustomerOpen(false)}
          onSubmit={handleCreateCustomer}
        />
      ) : null}
    </main>
  );
}
