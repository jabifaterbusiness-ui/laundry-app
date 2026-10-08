import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GlobalSearch } from "../search/GlobalSearch.js";
import { QuickOperationLauncher } from "../quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../lib/quick-operations-catalog.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useWorkstationModeStore } from "../../state/workstation-mode-store.js";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
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
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const appMode = useWorkstationModeStore((state) => state.mode);
  const setAppMode = useWorkstationModeStore((state) => state.setMode);

  const [quickOperation, setQuickOperation] =
    useState<QuickOperationDefinition | null>(null);
  const [quickOperationRecordId, setQuickOperationRecordId] =
    useState<string>("");

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

          <div className="topbar-user">
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
                  navigate("/customer-workstation");
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

      <div className="app-layout">
        <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
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

              {OPERATIONS.map((item) => {
                const active = isActive(item.href);

                if (
                  item.permission &&
                  !hasPermission(user, item.permission)
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
            </section>

            <section className="nav-section management-section">
              <h2>Management</h2>

              {MANAGEMENT.map((item) => {
                const active = isActive(item.href);
                if (
                  item.permission &&
                  !hasPermission(user, item.permission)
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

              {user?.securityRole === "BUSINESS_OWNER" ? (
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
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-mark">LA</div>
            <div>
              <strong>Laundry Angel</strong>
              <span>Management System</span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="page-container">{children}</div>
        </main>
      </div>

      <QuickOperationLauncher
        operation={quickOperation}
        initialRecordId={quickOperationRecordId}
        onClose={() => {
          setQuickOperation(null);
          setQuickOperationRecordId("");
        }}
      />
    </div>
  );
}
