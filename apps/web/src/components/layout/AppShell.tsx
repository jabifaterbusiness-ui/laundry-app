import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GlobalSearch } from "../search/GlobalSearch.js";
import { QuickOperationLauncher } from "../quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../lib/quick-operations-catalog.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const OPERATIONS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "⌂" },
  { label: "Customers", href: "/customers", icon: "♙" },
  { label: "Orders", href: "/orders", icon: "▣" },
  { label: "Invoices & Receipts", href: "/invoices", icon: "▤" },
  { label: "Payments", href: "/payments", icon: "₦" },
];

const MANAGEMENT: NavItem[] = [
  { label: "Services & Price List", href: "/services", icon: "◈" },
  { label: "Inventory", href: "/inventory", icon: "□" },
  { label: "Users", href: "/users", icon: "♟" },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [quickOperation, setQuickOperation] =
    useState<QuickOperationDefinition | null>(null);

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

      setQuickOperation(detail as QuickOperationDefinition);
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

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(href);

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  function closeMobileNav() {
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
            <div className="user-avatar">
              {(user?.fullName?.charAt(0) ?? "U").toUpperCase()}
            </div>

            <div className="user-details">
              <span className="user-name">
                {user?.fullName ?? "User"}
              </span>
              <span className="user-role">
                {user?.role?.replaceAll("_", " ") ?? "User"}
              </span>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Logout
            </button>
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
                const isBusinessUserManagement =
                  item.href === "/users";

                if (
                  isBusinessUserManagement &&
                  !hasPermission(user, "users.view")
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

              {user?.role === "BUSINESS_OWNER" ? (
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

              {user?.role === "PLATFORM_ADMIN" ? (
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
        onClose={() => setQuickOperation(null)}
      />
    </div>
  );
}
