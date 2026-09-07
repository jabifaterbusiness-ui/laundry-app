import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";
import { GlobalSearch } from "../search/GlobalSearch.js";
import { QuickOperationLauncher } from "../quick-operations/QuickOperationLauncher.js";
import type { QuickOperationDefinition } from "../../lib/quick-operations-catalog.js";
import { useAuthStore } from "../../state/auth-store.js";

interface NavItem {
  label: string;
  href: string;
}

const OPERATIONS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Customers", href: "/customers" },
  { label: "Orders", href: "/orders" },
  { label: "Invoices & Receipts", href: "/invoices" },
  { label: "Payments", href: "/payments" },
];

const MANAGEMENT: NavItem[] = [
  { label: "Services & Price List", href: "/services" },
  { label: "Inventory", href: "/inventory" },
  { label: "Users", href: "/users" },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const [quickOperation, setQuickOperation] =
    useState<QuickOperationDefinition | null>(null);

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

  const canManageData =
    user?.role === "BUSINESS_OWNER" ||
    user?.role === "BRANCH_MANAGER";

  const isActive = (href: string) =>
    href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(href);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        color: "#171717",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 200,
          background: "#fff",
          borderBottom: "1px solid #e5e5e5",
          padding: "14px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          <Link
            to="/"
            style={{
              fontWeight: 800,
              fontSize: 20,
              color: "inherit",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Laundry App
          </Link>

          <GlobalSearch />

          <div
            style={{
              marginLeft: "auto",
              whiteSpace: "nowrap",
              fontSize: 13,
            }}
          >
            {user?.fullName ?? "User"}
          </div>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          maxWidth: 1400,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            padding: "24px 16px",
          }}
        >
          <nav aria-label="Main navigation">
            <section>
              <h2
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  margin: "0 8px 8px",
                }}
              >
                Operations
              </h2>

              {OPERATIONS.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  style={{
                    display: "block",
                    padding: "9px 10px",
                    marginBottom: 3,
                    borderRadius: 6,
                    textDecoration: "none",
                    fontWeight: isActive(item.href) ? 700 : 400,
                    background: isActive(item.href)
                      ? "#ececec"
                      : "transparent",
                    color: "inherit",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </section>

            <section style={{ marginTop: 24 }}>
              <h2
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  margin: "0 8px 8px",
                }}
              >
                Management
              </h2>

              {MANAGEMENT.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  style={{
                    display: "block",
                    padding: "9px 10px",
                    marginBottom: 3,
                    borderRadius: 6,
                    textDecoration: "none",
                    fontWeight: isActive(item.href) ? 700 : 400,
                    background: isActive(item.href)
                      ? "#ececec"
                      : "transparent",
                    color: "inherit",
                  }}
                >
                  {item.label}
                </Link>
              ))}

              {canManageData ? (
                <Link
                  to="/data-management"
                  style={{
                    display: "block",
                    padding: "9px 10px",
                    marginBottom: 3,
                    borderRadius: 6,
                    textDecoration: "none",
                    fontWeight: isActive("/data-management") ? 700 : 400,
                    background: isActive("/data-management")
                      ? "#ececec"
                      : "transparent",
                    color: "inherit",
                  }}
                >
                  Backup & Data Migration
                </Link>
              ) : null}
            </section>
          </nav>
        </aside>

        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: "28px 24px",
          }}
        >
          {children}
        </main>

        <QuickOperationLauncher
          operation={quickOperation}
          onClose={() => setQuickOperation(null)}
        />
      </div>
    </div>
  );
}
