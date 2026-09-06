import { create } from "zustand";
import type { Customer, Order } from "@laundry-app/shared";

export interface OrderWorkspaceDraft {
  customerId: string;
  lines: Array<{
    serviceId: string;
    quantity: number;
  }>;
  garmentNote: string;
  internalNote: string;
  expectedReadyAt: string;
}

export interface OrderWorkspace {
  id: string;
  customer: Customer;
  activeOrder: Order | null;
  draft: OrderWorkspaceDraft;
  updatedAt: number;
}

interface OrderWorkspaceState {
  workspaces: OrderWorkspace[];
  activeWorkspaceId: string | null;

  openWorkspace: (
    customer: Customer,
    options?: {
      order?: Order | null;
      draft?: Partial<OrderWorkspaceDraft>;
    },
  ) => string;

  switchWorkspace: (workspaceId: string) => void;
  closeWorkspace: (workspaceId: string) => void;

  updateWorkspace: (
    workspaceId: string,
    update: Partial<
      Pick<OrderWorkspace, "customer" | "activeOrder">
    > & {
      draft?: Partial<OrderWorkspaceDraft>;
    },
  ) => void;

  clearWorkspaces: () => void;
}

const DEFAULT_DRAFT: Omit<OrderWorkspaceDraft, "customerId"> = {
  lines: [{ serviceId: "", quantity: 1 }],
  garmentNote: "",
  internalNote: "",
  expectedReadyAt: "",
};

function createWorkspaceId(customerId: string) {
  return `customer:${customerId}`;
}

export const useOrderWorkspaceStore = create<OrderWorkspaceState>(
  (set) => ({
    workspaces: [],
    activeWorkspaceId: null,

    openWorkspace: (customer, options) => {
      const workspaceId = createWorkspaceId(customer.id);

      set((state) => {
        const existing = state.workspaces.find(
          (workspace) => workspace.id === workspaceId,
        );

        if (existing) {
          return {
            activeWorkspaceId: workspaceId,
          };
        }

        const workspace: OrderWorkspace = {
          id: workspaceId,
          customer,
          activeOrder: options?.order ?? null,
          draft: {
            ...DEFAULT_DRAFT,
            customerId: customer.id,
            ...options?.draft,
          },
          updatedAt: Date.now(),
        };

        return {
          workspaces: [...state.workspaces, workspace],
          activeWorkspaceId: workspaceId,
        };
      });

      return workspaceId;
    },

    switchWorkspace: (workspaceId) =>
      set((state) => {
        if (
          !state.workspaces.some(
            (workspace) => workspace.id === workspaceId,
          )
        ) {
          return state;
        }

        return {
          activeWorkspaceId: workspaceId,
        };
      }),

    closeWorkspace: (workspaceId) =>
      set((state) => {
        const index = state.workspaces.findIndex(
          (workspace) => workspace.id === workspaceId,
        );

        if (index === -1) {
          return state;
        }

        const remaining = state.workspaces.filter(
          (workspace) => workspace.id !== workspaceId,
        );

        if (state.activeWorkspaceId !== workspaceId) {
          return {
            workspaces: remaining,
          };
        }

        const nextWorkspace =
          remaining[index] ??
          remaining[index - 1] ??
          null;

        return {
          workspaces: remaining,
          activeWorkspaceId: nextWorkspace?.id ?? null,
        };
      }),

    updateWorkspace: (workspaceId, update) =>
      set((state) => ({
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id !== workspaceId) {
            return workspace;
          }

          return {
            ...workspace,
            ...(update.customer
              ? { customer: update.customer }
              : {}),
            ...(update.activeOrder !== undefined
              ? { activeOrder: update.activeOrder }
              : {}),
            ...(update.draft
              ? {
                  draft: {
                    ...workspace.draft,
                    ...update.draft,
                  },
                }
              : {}),
            updatedAt: Date.now(),
          };
        }),
      })),

    clearWorkspaces: () =>
      set({
        workspaces: [],
        activeWorkspaceId: null,
      }),
  }),
);
