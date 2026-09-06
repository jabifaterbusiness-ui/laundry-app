import type { OrderWorkspace } from "../../state/order-workspace-store.js";

interface OrderWorkspaceSwitcherProps {
  workspaces: OrderWorkspace[];
  activeWorkspaceId: string | null;
  onOpenCustomer: () => void;
  onSwitch: (workspaceId: string) => void;
  onClose: (workspaceId: string) => void;
}

export function OrderWorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onOpenCustomer,
  onSwitch,
  onClose,
}: OrderWorkspaceSwitcherProps) {
  return (
    <section aria-label="Active customer workspaces">
      <div>
        <strong>Active Customers</strong>{" "}
        <span>({workspaces.length})</span>
      </div>

      <div>
        {workspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;

          return (
            <div key={workspace.id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSwitch(workspace.id)}
              >
                {workspace.customer.name}
                {workspace.activeOrder
                  ? ` — #${workspace.activeOrder.orderNumber}`
                  : " — New order"}
              </button>

              <button
                type="button"
                aria-label={`Close ${workspace.customer.name} workspace`}
                onClick={() => onClose(workspace.id)}
              >
                ×
              </button>
            </div>
          );
        })}

        <button type="button" onClick={onOpenCustomer}>
          + Add customer
        </button>
      </div>
    </section>
  );
}
