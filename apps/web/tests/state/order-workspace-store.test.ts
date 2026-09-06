import { beforeEach, describe, expect, it } from "vitest";
import type { Customer, Order } from "@laundry-app/shared";
import { useOrderWorkspaceStore } from "../../src/state/order-workspace-store.js";

const customerA: Customer = {
  id: "customer-a",
  name: "Customer A",
  phone: "08000000001",
  email: null,
  address: null,
  notes: null,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const customerB: Customer = {
  id: "customer-b",
  name: "Customer B",
  phone: "08000000002",
  email: null,
  address: null,
  notes: null,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const customerC: Customer = {
  id: "customer-c",
  name: "Customer C",
  phone: "08000000003",
  email: null,
  address: null,
  notes: null,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const orderA: Order = {
  id: "order-a",
  businessId: "business-a",
  branchId: "branch-a",
  customerId: customerA.id,
  orderNumber: "00001",
  status: "RECEIVED",
  orderTotal: 4500,
  expectedReadyAt: null,
  readyAt: null,
  completedAt: null,
  cancelledAt: null,
  garmentNote: null,
  internalNote: null,
  items: [],
  createdAt: "",
  updatedAt: "",
};

beforeEach(() => {
  useOrderWorkspaceStore.getState().clearWorkspaces();
});

describe("order workspace store", () => {
  it("supports three or more simultaneous customer workspaces", () => {
    const store = useOrderWorkspaceStore.getState();

    const workspaceA = store.openWorkspace(customerA);
    const workspaceB = store.openWorkspace(customerB);
    const workspaceC = store.openWorkspace(customerC);

    const state = useOrderWorkspaceStore.getState();

    expect(state.workspaces).toHaveLength(3);
    expect(state.activeWorkspaceId).toBe(workspaceC);
    expect(state.workspaces.map((item) => item.customer.id)).toEqual([
      customerA.id,
      customerB.id,
      customerC.id,
    ]);

    expect(workspaceA).not.toBe(workspaceB);
    expect(workspaceB).not.toBe(workspaceC);
  });

  it("switches between existing workspaces without creating duplicates", () => {
    const store = useOrderWorkspaceStore.getState();

    const workspaceA = store.openWorkspace(customerA);
    store.openWorkspace(customerB);

    store.switchWorkspace(workspaceA);

    const state = useOrderWorkspaceStore.getState();

    expect(state.activeWorkspaceId).toBe(workspaceA);
    expect(state.workspaces).toHaveLength(2);
  });

  it("opening the same customer again reuses the existing workspace", () => {
    const store = useOrderWorkspaceStore.getState();

    const firstId = store.openWorkspace(customerA);

    store.updateWorkspace(firstId, {
      draft: {
        garmentNote: "Keep this unfinished note",
      },
    });

    const secondId = store.openWorkspace(customerA);

    const state = useOrderWorkspaceStore.getState();

    expect(secondId).toBe(firstId);
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0]?.draft.garmentNote).toBe(
      "Keep this unfinished note",
    );
  });

  it("preserves each customer's unfinished order draft while switching", () => {
    const store = useOrderWorkspaceStore.getState();

    const workspaceA = store.openWorkspace(customerA);
    const workspaceB = store.openWorkspace(customerB);

    store.updateWorkspace(workspaceA, {
      draft: {
        lines: [{ serviceId: "service-agbada", quantity: 2 }],
        garmentNote: "Customer A note",
        expectedReadyAt: "2026-09-07T10:00",
      },
    });

    store.updateWorkspace(workspaceB, {
      draft: {
        lines: [{ serviceId: "service-shirt", quantity: 4 }],
        garmentNote: "Customer B note",
      },
    });

    store.switchWorkspace(workspaceA);

    let state = useOrderWorkspaceStore.getState();
    const draftA = state.workspaces.find(
      (workspace) => workspace.id === workspaceA,
    )?.draft;

    expect(draftA).toMatchObject({
      customerId: customerA.id,
      lines: [{ serviceId: "service-agbada", quantity: 2 }],
      garmentNote: "Customer A note",
      expectedReadyAt: "2026-09-07T10:00",
    });

    store.switchWorkspace(workspaceB);

    state = useOrderWorkspaceStore.getState();
    const draftB = state.workspaces.find(
      (workspace) => workspace.id === workspaceB,
    )?.draft;

    expect(draftB).toMatchObject({
      customerId: customerB.id,
      lines: [{ serviceId: "service-shirt", quantity: 4 }],
      garmentNote: "Customer B note",
    });
  });

  it("keeps an existing active order attached to its customer workspace", () => {
    const store = useOrderWorkspaceStore.getState();

    const workspaceId = store.openWorkspace(customerA, {
      order: orderA,
    });

    const workspace = useOrderWorkspaceStore
      .getState()
      .workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.activeOrder?.id).toBe(orderA.id);
    expect(workspace?.activeOrder?.customerId).toBe(customerA.id);
  });

  it("closes the active workspace and selects the nearest remaining workspace", () => {
    const store = useOrderWorkspaceStore.getState();

    store.openWorkspace(customerA);
    const workspaceB = store.openWorkspace(customerB);
    store.openWorkspace(customerC);

    store.closeWorkspace(workspaceB);

    const state = useOrderWorkspaceStore.getState();

    expect(state.workspaces).toHaveLength(2);
    expect(state.workspaces.map((item) => item.customer.id)).toEqual([
      customerA.id,
      customerC.id,
    ]);
    expect(state.activeWorkspaceId).toBe("customer:customer-c");
  });

  it("closes the final workspace safely", () => {
    const store = useOrderWorkspaceStore.getState();

    const workspaceId = store.openWorkspace(customerA);

    store.closeWorkspace(workspaceId);

    const state = useOrderWorkspaceStore.getState();

    expect(state.workspaces).toHaveLength(0);
    expect(state.activeWorkspaceId).toBeNull();
  });

  it("ignores switching to an unknown workspace", () => {
    const store = useOrderWorkspaceStore.getState();

    const workspaceId = store.openWorkspace(customerA);

    store.switchWorkspace("customer:does-not-exist");

    expect(
      useOrderWorkspaceStore.getState().activeWorkspaceId,
    ).toBe(workspaceId);
  });
});
