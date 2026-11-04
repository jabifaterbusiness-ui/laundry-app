import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GlobalSearch } from "../search/GlobalSearch.js";
import "./AppShell.css";
import "../exports/TableExportActions.css";
import { QuickOperationLauncher } from "../quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../lib/quick-operations-catalog.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useWorkstationModeStore } from "../../state/workstation-mode-store.js";
import { dismissBusinessInboxMessage, getBusinessInbox, markBusinessInboxMessageRead } from "../../lib/inbox-api.js";
import {
  CLOUD_BACKUP_NOTIFICATION_EVENT,
  type CloudBackupNotification,
} from "../../lib/cloud-backup-notifications.js";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
  permissionsAny?: string[];
}

const OPERATIONS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "⌂" },
  {
    label: "Customers",
    href: "/customers",
    icon: "♙",
    permission: "customers.view",
  },
  {
    label: "Orders",
    href: "/orders",
    icon: "▣",
    permission: "orders.view",
  },
  {
    label: "Order Management",
    href: "/order-management",
    icon: "▤",
    permission: "orders.view",
  },
  {
    label: "Invoices & Receipts",
    href: "/invoices",
    icon: "▤",
    permission: "invoices.view",
  },
  {
    label: "Payments",
    href: "/payments",
    icon: "₦",
    permission: "payments.view",
  },
];

const MANAGEMENT: NavItem[] = [
  {
    label: "Customer Communications",
    href: "/communications",
    icon: "✉",
    permissionsAny: ["business.view", "business.update", "customers.view", "customers.update", "orders.change_status"],
  },
  {
    label: "Services & Price List",
    href: "/services",
    icon: "◈",
    permission: "services.view",
  },
  {
    label: "Colour Catalogue",
    href: "/colors",
    icon: "●",
    permission: "colors.view",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: "□",
    permission: "inventory.view",
  },
  {
    label: "Users",
    href: "/users",
    icon: "♟",
    permission: "users.view",
  },
  {
    label: "Permissions",
    href: "/permissions",
    icon: "⚙",
    permission: "users.manage_permissions",
  },
  {
    label: "Branches",
    href: "/branches",
    icon: "⌘",
    permission: "branches.view",
  },
  {
    label: "Business Settings",
    href: "/business/settings",
    icon: "◆",
    permission: "business.view",
  },
  {
    label: "Suspicious / Unusual Activity",
    href: "/security/suspicious-activity",
    icon: "⚠",
    permission: "security.suspicious_activity.view",
  },
  {
    label: "Payroll",
    href: "/payroll",
    icon: "₦",
    permission: "payroll.view",
  },
  {
    label: "IOUs, Loans & Repayments",
    href: "/payroll/financial",
    icon: "₦",
    permissionsAny: ["ious.view", "loans.view", "repayments.view"],
  },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const setActiveBranch = useAuthStore((state) => state.setActiveBranch);
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const activeBranches = (user?.branches ?? []).filter((branch) => branch.isActive !== false);
  const inboxQuery = useQuery({
    queryKey: ["business-inbox"],
    queryFn: () => getBusinessInbox(accessToken),
    enabled: Boolean(accessToken && user?.businessId),
    refetchInterval: 60_000,
  });
  const inboxUnreadCount = inboxQuery.data?.unreadCount ?? 0;
  const appMode = useWorkstationModeStore((state) => state.mode);
  const setAppMode = useWorkstationModeStore((state) => state.setMode);
  const isWorkstationMode = appMode === "CUSTOMER_WORKSTATION";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [quickOperation, setQuickOperation] =
    useState<QuickOperationDefinition | null>(null);
  const [quickOperationRecordId, setQuickOperationRecordId] =
    useState<string>("");

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cloudBackupNotification, setCloudBackupNotification] =
    useState<CloudBackupNotification | null>(null);
  const [activeInboxPopupId, setActiveInboxPopupId] = useState<string | null>(null);
  const [shownInboxPopupIds, setShownInboxPopupIds] = useState<string[]>([]);
  useEffect(() => {
    if (
      isWorkstationMode &&
      location.pathname !== "/orders" &&
      location.pathname !== "/order-management"
    ) {
      navigate("/order-management", { replace: true });
      setSidebarCollapsed(true);
    }
  }, [isWorkstationMode, location.pathname, navigate]);

  const activeInboxPopup = inboxQuery.data?.messages.find((message) =>
    message.id === activeInboxPopupId && !message.readAt && !message.dismissedAt
  ) ?? null;

  useEffect(() => {
    if (activeInboxPopupId) return;
    const next = inboxQuery.data?.messages.find((message) =>
      !message.readAt && !message.dismissedAt && !shownInboxPopupIds.includes(message.id)
    );
    if (next) setActiveInboxPopupId(next.id);
  }, [inboxQuery.data?.messages, activeInboxPopupId, shownInboxPopupIds]);

  useEffect(() => {
    if (!activeInboxPopup) return;
    const timer = window.setTimeout(() => {
      setShownInboxPopupIds((current) => [...current, activeInboxPopup.id]);
      setActiveInboxPopupId(null);
      if (accessToken) {
        void dismissBusinessInboxMessage(activeInboxPopup.id, accessToken)
          .then(() => queryClient.invalidateQueries({ queryKey: ["business-inbox"] }))
          .catch(() => undefined);
      }
    }, activeInboxPopup.displayDurationMinutes * 60_000);
    return () => window.clearTimeout(timer);
  }, [activeInboxPopup?.id, activeInboxPopup?.displayDurationMinutes, accessToken, queryClient]);

  async function dismissActiveInboxPopup() {
    if (!activeInboxPopup || !accessToken) return;
    await dismissBusinessInboxMessage(activeInboxPopup.id, accessToken);
    setActiveInboxPopupId(null);
    await queryClient.invalidateQueries({ queryKey: ["business-inbox"] });
  }

  async function openActiveInboxMessage() {
    if (!activeInboxPopup || !accessToken) return;
    await markBusinessInboxMessageRead(activeInboxPopup.id, accessToken);
    setActiveInboxPopupId(null);
    await queryClient.invalidateQueries({ queryKey: ["business-inbox"] });
    navigate("/inbox");
  }


  useEffect(() => {
    const branches = (user?.branches ?? []).filter((branch) => branch.isActive !== false);
    const currentIsValid = branches.some((branch) => branch.id === activeBranchId);
    if (activeBranchId && !currentIsValid) setActiveBranch(branches.length === 1 ? branches[0]!.id : null);
    else if (!activeBranchId && branches.length === 1) setActiveBranch(branches[0]!.id);
  }, [user?.branches, activeBranchId, setActiveBranch]);

  useEffect(() => {
    void queryClient.invalidateQueries();
  }, [activeBranchId, queryClient]);

  useEffect(() => {
    function handleQuickOperationOpen(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;

      if (
        typeof detail !== "object" ||
        detail === null ||
        !("code" in detail) ||
        !("name" in detail)
      ) {
        return;
      }

      const operation = detail as QuickOperationDefinition & {
        recordId?: string;
      };

      setQuickOperation(operation);
      setQuickOperationRecordId(operation.recordId ?? "");
    }

    window.addEventListener(
      "quick-operation:open",
      handleQuickOperationOpen,
    );

    return () => {
      window.removeEventListener(
        "quick-operation:open",
        handleQuickOperationOpen,
      );
    };
  }, []);

  useEffect(() => {
    function handleCloudBackupNotification(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        typeof detail !== "object" ||
        detail === null ||
        !("status" in detail) ||
        !("title" in detail) ||
        !("message" in detail) ||
        !("source" in detail)
      ) {
        return;
      }

      const notification = detail as CloudBackupNotification;
      if (
        !["progress", "success", "error"].includes(notification.status) ||
        typeof notification.title !== "string" ||
        typeof notification.message !== "string" ||
        !["manual", "scheduled", "settings"].includes(notification.source)
      ) {
        return;
      }
      setCloudBackupNotification(notification);
    }

    window.addEventListener(
      CLOUD_BACKUP_NOTIFICATION_EVENT,
      handleCloudBackupNotification,
    );
    return () => {
      window.removeEventListener(
        CLOUD_BACKUP_NOTIFICATION_EVENT,
        handleCloudBackupNotification,
      );
    };
  }, []);

  const canViewMigrations = hasPermission(user, "migrations.view");
  const canViewFinance =
    hasPermission(user, "reports.view") ||
    hasPermission(user, "expenses.view");

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(href);

  const accountMenuRef = useRef<HTMLDetailsElement | null>(null);
  const accountActionsMenuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target)
      ) {
        accountMenuRef.current.removeAttribute("open");
      }

      if (
        accountActionsMenuRef.current &&
        !accountActionsMenuRef.current.contains(target)
      ) {
        accountActionsMenuRef.current.removeAttribute("open");
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, []);

  function closeAccountMenus() {
    accountMenuRef.current?.removeAttribute("open");
    accountActionsMenuRef.current?.removeAttribute("open");
  }

  function logout() {
    closeAccountMenus();
    clearSession();
    navigate("/login", { replace: true });
  }

  function closeMobileNav() {
    closeAccountMenus();
    setMobileNavOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            ☰
          </button>

          <Link to="/" className="brand" onClick={closeMobileNav}>
            <img
              src="/brand/laundryangel-logo.jpg"
              alt="Laundry Angel"
              className="brand-logo"
            />
            <span className="brand-name">
              Laundry<span>Angel</span>
            </span>
          </Link>

          <div className="topbar-search">
            <GlobalSearch />
          </div>
          {isWorkstationMode ? (
            <button
              type="button"
              className="workstation-sidebar-toggle"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Show workstation sidebar" : "Hide workstation sidebar"}
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? "Show menu" : "Hide menu"}
            </button>
          ) : null}

          <div className="topbar-user">
            {activeBranches.length > 0 ? (
              <label className="branch-context-switcher">
                <span>Branch</span>
                <select aria-label="Active branch" value={activeBranchId ?? ""} onChange={(event) => setActiveBranch(event.target.value || null)}>
                  {activeBranches.length > 1 ? <option value="">Choose branch…</option> : null}
                  {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
            ) : null}
            <div
              className="app-mode-switch"
              aria-label="Application mode"
            >
              <span className="app-mode-label">Mode</span>

              <button
                type="button"
                className={`app-mode-option ${
                  appMode === "NORMAL" ? "active" : ""
                }`}
                aria-pressed={appMode === "NORMAL"}
                onClick={() => {
                  setAppMode("NORMAL");
                  setSidebarCollapsed(false);
                  if (location.pathname === "/customer-workstation") {
                    navigate("/");
                  }
                }}
              >
                Normal Mode
              </button>

              <button
                type="button"
                className={`app-mode-option ${
                  appMode === "CUSTOMER_WORKSTATION" ? "active" : ""
                }`}
                aria-pressed={appMode === "CUSTOMER_WORKSTATION"}
                onClick={() => {
                  setAppMode("CUSTOMER_WORKSTATION");
                  setSidebarCollapsed(true);
                  navigate("/order-management");
                }}
              >
                Customer Workstation Mode
              </button>
            </div>

            <details ref={accountMenuRef} className="account-menu">
              <summary className="account-trigger" aria-label="Open account details">
                <span className="user-avatar">
                  {(user?.fullName?.charAt(0) ?? "U").toUpperCase()}
                </span>

                <span className="user-details">
                  <span className="user-name">
                    {user?.fullName ?? "User"}
                  </span>
                  <span className="user-role">
                    {user?.role ?? "User"}
                  </span>
                </span>
              </summary>

              <div className="account-popover">
                <div className="account-popover-header">
                  <strong>{user?.fullName ?? "User"}</strong>
                  <span>{user?.role ?? "User"}</span>
                </div>

                <div className="account-popover-details">
                  <div>
                    <span>Email</span>
                    <strong>{user?.email ?? "Not configured"}</strong>
                  </div>

                  <div>
                    <span>Username</span>
                    <strong>{user?.username ?? "Not configured"}</strong>
                  </div>

                  <div>
                    <span>Branches</span>
                    <strong>
                      {user?.branches?.length
                        ? user.branches.map((branch) => branch.name).join(", ")
                        : "No branch assigned"}
                    </strong>
                  </div>

                  <div>
                    <span>Access</span>
                    <strong>
                      {user?.permissions?.length ?? 0} permission
                      {(user?.permissions?.length ?? 0) === 1 ? "" : "s"}
                    </strong>
                  </div>
                </div>

                <Link
                  to="/account"
                  className="account-manage-link"
                  onClick={closeMobileNav}
                >
                  Manage My Account
                </Link>
              </div>
            </details>

            <details ref={accountActionsMenuRef} className="topbar-actions-menu">
              <summary
                className="topbar-actions-trigger"
                aria-label="Open account actions"
                onClick={() => {
                  accountMenuRef.current?.removeAttribute("open");
                }}
              >
                ⋮
              </summary>

              <div className="topbar-actions-popover">
                <Link
                  to="/account"
                  onClick={closeMobileNav}
                >
                  My Account
                </Link>

                <Link
                  to="/account"
                  onClick={closeMobileNav}
                >
                  Change password
                </Link>

                <button
                  type="button"
                  onClick={logout}
                >
                  Logout
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      {mobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-overlay"
          aria-label="Close navigation"
          onClick={closeMobileNav}
        />
      ) : null}

      <div className={`app-layout ${isWorkstationMode && sidebarCollapsed ? "app-layout--sidebar-collapsed" : ""}`}>
        <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""} ${isWorkstationMode ? "sidebar--workstation" : ""}`}>
          <div className="sidebar-mobile-header">
            <span>Menu</span>
            <button
              type="button"
              onClick={closeMobileNav}
              aria-label="Close navigation"
            >
              ×
            </button>
          </div>

          <nav aria-label="Main navigation">
            <section className="nav-section">
              <h2>Operations</h2>

              {(isWorkstationMode
                ? OPERATIONS.filter((item) => item.href === "/orders" || item.href === "/order-management")
                : OPERATIONS
              ).map((item) => {
                const active = isActive(item.href);

                if (
                  (item.permission && !hasPermission(user, item.permission)) ||
                  (item.permissionsAny &&
                    !item.permissionsAny.some((permission) =>
                      hasPermission(user, permission),
                    ))
                ) {
                  return null;
                }

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`nav-item ${active ? "active" : ""}`}
                    style={{ fontWeight: active ? 700 : undefined }}
                    onClick={closeMobileNav}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{isWorkstationMode && item.href === "/orders" ? "Order Management" : item.label}</span>
                  </Link>
                );
              })}
            </section>
            {!isWorkstationMode ? (            <Link to="/inbox" className={`nav-item ${isActive("/inbox") ? "active" : ""}`} onClick={closeMobileNav}>
              <span className="nav-icon" aria-hidden="true">✉</span>
              <span>Inbox</span>
              {inboxUnreadCount > 0 ? <span className="inbox-unread-badge">{inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}</span> : null}
            </Link>) : null}

            {!isWorkstationMode ? (
            <section className="nav-section management-section">
              <h2>Management</h2>

              {MANAGEMENT.map((item) => {
                const active = isActive(item.href);
                if (
                  (item.permission && !hasPermission(user, item.permission)) ||
                  (item.permissionsAny &&
                    !item.permissionsAny.some((permission) =>
                      hasPermission(user, permission),
                    ))
                ) {
                  return null;
                }

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`nav-item ${active ? "active" : ""}`}
                    style={{ fontWeight: active ? 700 : undefined }}
                    onClick={closeMobileNav}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {canViewFinance ? (
                <Link
                  to="/finance"
                  className={`nav-item ${
                    isActive("/finance") ? "active" : ""
                  }`}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon" aria-hidden="true">
                    ₦
                  </span>
                  <span>Finance</span>
                </Link>
              ) : null}

              {hasPermission(user, "reports.view") ? (
                <Link
                  to="/reports"
                  className={`nav-item ${
                    isActive("/reports") ? "active" : ""
                  }`}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon" aria-hidden="true">
                    ▥
                  </span>
                  <span>Reports</span>
                </Link>
              ) : null}

              {hasPermission(user, "subscriptions.view") ? (
                <Link
                  to="/subscription"
                  className={`nav-item ${
                    isActive("/subscription") ? "active" : ""
                  }`}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon" aria-hidden="true">
                    ◉
                  </span>
                  <span>Subscription</span>
                </Link>
              ) : null}

              {user?.securityRole === "PLATFORM_ADMIN" ? (
                <Link
                  to="/platform"
                  className={`nav-item ${
                    isActive("/platform") ? "active" : ""
                  }`}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon" aria-hidden="true">
                    ◆
                  </span>
                  <span>Platform Control Center</span>
                </Link>
              ) : null}

              {canViewMigrations ? (
                <Link
                  to="/data-management"
                  className={`nav-item ${
                    isActive("/data-management") ? "active" : ""
                  }`}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon" aria-hidden="true">
                    ⇅
                  </span>
                  <span>Backup & Data Migration</span>
                </Link>
              ) : null}
            </section>
            ) : null}
          </nav>

          {!isWorkstationMode ? <Link to="/help" className={`nav-item help-nav-item ${isActive("/help") ? "active" : ""}`} onClick={closeMobileNav}>
            <span className="nav-icon" aria-hidden="true">?</span>
            <span>Help Centre</span>
          </Link> : null}

          {!isWorkstationMode ? <div className="sidebar-footer">
            <div className="sidebar-footer-mark">LA</div>
            <div>
              <strong>Laundry Angel</strong>
              <span>Management System</span>
            </div>
          </div> : null}
        </aside>

        <main className="main-content">
          {cloudBackupNotification && (
            <section
              className={`cloud-backup-progress-banner cloud-backup-progress-banner--${cloudBackupNotification.status}`}
              role={cloudBackupNotification.status === "error" ? "alert" : "status"}
              aria-live={cloudBackupNotification.status === "error" ? "assertive" : "polite"}
            >
              <div className="cloud-backup-progress-banner__copy">
                <strong>{cloudBackupNotification.title}</strong>
                <p>{cloudBackupNotification.message}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss cloud backup notification"
                onClick={() => setCloudBackupNotification(null)}
              >
                Dismiss
              </button>
            </section>
          )}
          {!isWorkstationMode && activeInboxPopup ? (
            <div className="global-inbox-popup-backdrop" role="presentation">
              <section className="global-inbox-popup" role="dialog" aria-modal="true" aria-labelledby="global-inbox-popup-title">
                <span className="global-inbox-popup-eyebrow">LAUNDRYANGEL ANNOUNCEMENT</span>
                <h2 id="global-inbox-popup-title">{activeInboxPopup.title}</h2>
                <p>{activeInboxPopup.body}</p>
                <small>This notice stays visible for up to {activeInboxPopup.displayDurationMinutes} minutes.</small>
                <div className="global-inbox-popup-actions">
                  <button type="button" className="button button-primary" onClick={() => void openActiveInboxMessage()}>Read message</button>
                  <button type="button" className="button button-secondary" onClick={() => void dismissActiveInboxPopup()}>Dismiss</button>
                </div>
              </section>
            </div>
          ) : null}
          <div className="page-container">{children}</div>
        </main>
      </div>

      {!isWorkstationMode ? <QuickOperationLauncher
        operation={quickOperation}
        initialRecordId={quickOperationRecordId}
        onClose={() => {
          setQuickOperation(null);
          setQuickOperationRecordId("");
        }}
      /> : null}
    </div>
  );
}
