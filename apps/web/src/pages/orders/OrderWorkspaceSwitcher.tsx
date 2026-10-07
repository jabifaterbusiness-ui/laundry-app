import type { OrderWorkspace } from "../../state/order-workspace-store.js";

interface OrderWorkspaceSwitcherProps {
  workspaces: OrderWorkspace[];
  activeWorkspaceId: string | null;
  onOpenCustomer: () => void;
  onSwitch: (workspaceId: string) => void;
  onClose: (workspaceId: string) => void;
}

const WORKSPACE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
];

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
        {workspaces.map((workspace, index) => {
          const isActive = workspace.id === activeWorkspaceId;
          const color = WORKSPACE_COLORS[index % WORKSPACE_COLORS.length];

          return (
            <div
              key={workspace.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginRight: 8,
                marginBottom: 8,
                borderRadius: 8,
                border: `2px solid ${color}`,
                background: isActive ? color : "transparent",
                boxShadow: isActive
                  ? `0 0 0 2px ${color}33`
                  : "none",
              }}
            >
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSwitch(workspace.id)}
                style={{
                  border: 0,
                  background: "transparent",
                  color: isActive ? "#fff" : color,
                  fontWeight: isActive ? 700 : 600,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
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
                style={{
                  border: 0,
                  borderLeft: `1px solid ${isActive ? "#ffffff66" : `${color}55`}`,
                  background: "transparent",
                  color: isActive ? "#fff" : color,
                  fontWeight: 700,
                  padding: "8px 9px",
                  cursor: "pointer",
                }}
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
