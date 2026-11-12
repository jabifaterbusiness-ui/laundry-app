import { create } from "zustand";
import type { Customer, Order } from "@laundry-app/shared";

export interface OrderWorkspaceDraft {
  customerId: string;
  lines: Array<{
    id?: string;
    serviceId: string;
    quantity: number;
    colors: string[];
  }>;
  garmentNote: string;
  internalNote: string;
  expectedReadyAt: string;
}

export type OrderWorkspaceMode = "view" | "new" | "edit";

export interface OrderWorkspace {
  id: string;
  customer: Customer;
  activeOrder: Order | null;
  mode: OrderWorkspaceMode;
  returnTo?: "customer-workstation";
  isDirty?: boolean;
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
      returnTo?: "customer-workstation";
    },
  ) => string;

  switchWorkspace: (workspaceId: string) => void;
  closeWorkspace: (workspaceId: string) => void;

  updateWorkspace: (
    workspaceId: string,
    update: Partial<
      Pick<OrderWorkspace, "customer" | "activeOrder" | "mode" | "isDirty" | "returnTo">
    > & {
      draft?: Partial<OrderWorkspaceDraft>;
    },
  ) => void;

  clearWorkspaces: () => void;

  restoreWorkspaces: (
    workspaces: OrderWorkspace[],
    activeWorkspaceId: string | null,
  ) => void;
}

const DEFAULT_DRAFT: Omit<OrderWorkspaceDraft, "customerId"> = {
  lines: [{ serviceId: "", quantity: 1, colors: [] }],
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
            workspaces: options?.returnTo
              ? state.workspaces.map((workspace) =>
                  workspace.id === workspaceId
                    ? { ...workspace, returnTo: options.returnTo }
                    : workspace,
                )
              : state.workspaces,
            activeWorkspaceId: workspaceId,
          };
        }

        const workspace: OrderWorkspace = {
          id: workspaceId,
          customer,
          activeOrder: options?.order ?? null,
          mode: options?.order ? "view" : "new",
          isDirty: false,
          ...(options?.returnTo ? { returnTo: options.returnTo } : {}),
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
            ...(update.mode
              ? { mode: update.mode }
              : {}),
            ...(update.isDirty !== undefined
              ? { isDirty: update.isDirty }
              : {}),
            ...(update.returnTo !== undefined
              ? { returnTo: update.returnTo }
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

    restoreWorkspaces: (workspaces, activeWorkspaceId) =>
      set({
        workspaces: workspaces.map((workspace) => ({
          ...workspace,
          isDirty: workspace.isDirty ?? false,
          mode:
            workspace.mode === "new" || workspace.mode === "view"
              ? workspace.mode
              : workspace.activeOrder
                ? "view"
                : "new",
          draft: {
            ...workspace.draft,
            lines: workspace.draft.lines.map((line) => ({
              ...line,
              colors: line.colors ?? [],
            })),
          },
        })),
        activeWorkspaceId:
          activeWorkspaceId &&
          workspaces.some(
            (workspace) => workspace.id === activeWorkspaceId,
          )
            ? activeWorkspaceId
            : workspaces[0]?.id ?? null,
      }),

  }),
);
