import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  globalSearch,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from "../../lib/search-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { hasPermission } from "../../lib/permissions.js";
import {
  searchQuickOperations,
  type QuickOperationDefinition,
} from "../../lib/quick-operations-catalog.js";

const RESULT_GROUPS: {
  type: GlobalSearchResultType;
  label: string;
}[] = [
  { type: "CUSTOMER", label: "Customers" },
  { type: "ORDER", label: "Orders" },
  { type: "INVOICE", label: "Invoices" },
  { type: "PAYMENT", label: "Payments" },
];

function groupResults(results: GlobalSearchResult[]) {
  return RESULT_GROUPS.map((group) => ({
    ...group,
    results: results.filter((result) => result.type === group.type),
  })).filter((group) => group.results.length > 0);
}

function findExactIdentifierMatches(
  results: GlobalSearchResult[],
  query: string,
) {
  const normalizedQuery = query
    .trim()
    .replace(/^(order|invoice|payment|refund)\s*/i, "")
    .replace(/^#\s*/, "")
    .toUpperCase();

  if (!normalizedQuery) return [];

  return results.filter((result) => {
    const identifier = result.type === "ORDER"
      ? result.title.match(/^Order\s*#\s*(.+)$/i)?.[1]
      : result.type === "INVOICE"
        ? result.title.match(/^Invoice\s*#\s*(.+)$/i)?.[1]
        : result.type === "PAYMENT" && /^(Payment|Refund)\s*·\s*/i.test(result.title)
          ? result.title.replace(/^(Payment|Refund)\s*·\s*/i, "")
          : undefined;
    return identifier?.trim().toUpperCase() === normalizedQuery;
  });
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const user = useAuthStore((state) => state.user);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedQuery, setCompletedQuery] = useState("");
  const [authorizationInProgress, setAuthorizationInProgress] = useState(false);
  const pendingEnterRef = useRef(false);
  const requestIdRef = useRef(0);
  const exactIdentifierMatches = findExactIdentifierMatches(results, query);
  const exactIdentifierMatch = exactIdentifierMatches.length === 1 ? exactIdentifierMatches[0] : undefined;
  const hasOrderCandidate = results.some((result) => result.type === "ORDER");
  const orderMatchAvailable = results.some((result) => result.type === "ORDER") && exactIdentifierMatches.some((result) => result.type === "ORDER");
  // Keep every result type visible. Order matches used to be available only
  // to the Enter-key shortcut, which made the dropdown appear invoice-only.
  const groups = groupResults(results);
  const quickOperations = searchQuickOperations(query).filter((operation) =>
    hasPermission(user, operation.permission),
  );
  const canCreateCustomer = hasPermission(user, "customers.create");
  const userPermissionKey = `${user?.role ?? ""}:${(user?.permissions ?? []).slice().sort().join("|")}`;
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Search belongs to the current page, user, and branch. Clear it whenever
  // navigation or the authenticated tenant context changes so an old email,
  // phone number, or customer query is never left in the global header.
  useLayoutEffect(() => {
    requestIdRef.current += 1;
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setIsLoading(false);
    setError(null);
    setCompletedQuery("");
    pendingEnterRef.current = false;
  }, [location.key, location.pathname, location.search, location.hash, user?.id, user?.email, user?.businessId, accessToken, activeBranchId]);

  useEffect(() => {
    const clearForAuthorization = () => {
      setAuthorizationInProgress(true);
      setQuery("");
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      setError(null);
      setCompletedQuery("");
      pendingEnterRef.current = false;
      requestIdRef.current += 1;
    };
    const restoreAfterAuthorization = () => {
      setAuthorizationInProgress(false);
      setQuery("");
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      setError(null);
      setCompletedQuery("");
      pendingEnterRef.current = false;
      requestIdRef.current += 1;
    };
    window.addEventListener("sensitive-authorization:started", clearForAuthorization);
    window.addEventListener("sensitive-authorization:finished", restoreAfterAuthorization);
    return () => {
      window.removeEventListener("sensitive-authorization:started", clearForAuthorization);
      window.removeEventListener("sensitive-authorization:finished", restoreAfterAuthorization);
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      setCompletedQuery("");
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void globalSearch(
        { q: trimmedQuery, limit: 10 },
        { accessToken },
        activeBranchId,
      )
        .then((nextResults) => {
          if (requestId !== requestIdRef.current) return;
          setResults(nextResults);
          setCompletedQuery(trimmedQuery);
          setIsOpen(true);

          if (pendingEnterRef.current) {
            pendingEnterRef.current = false;
            const submittedResult =
              (() => {
                const exactMatches = findExactIdentifierMatches(nextResults, trimmedQuery);
                return exactMatches.length === 1
                  ? exactMatches[0]
                  : exactMatches.length > 1
                    ? undefined
                    : nextResults.find((result) => result.type !== "ORDER");
              })();

            if (submittedResult) {
              setQuery("");
              setResults([]);
              setError(null);
              setCompletedQuery("");
              setIsOpen(false);
              navigate(
                submittedResult.type === "ORDER"
                  ? `/order-management?orderId=${encodeURIComponent(submittedResult.id)}`
                  : submittedResult.href,
              );
            } else if (
              nextResults.length === 0 &&
              canCreateCustomer &&
              searchQuickOperations(trimmedQuery).filter((operation) =>
                hasPermission(userRef.current, operation.permission),
              ).length === 0
            ) {
              const digits = trimmedQuery.replace(/[^0-9]/g, "");
              const phoneLike = digits.length >= 5 && /^[+0-9().\s-]+$/.test(trimmedQuery);
              const params = new URLSearchParams({ addCustomer: "1" });
              if (phoneLike) params.set("customerPhone", trimmedQuery);
              setQuery("");
              setResults([]);
              setError(null);
              setCompletedQuery("");
              setIsOpen(false);
              navigate(`/orders?${params.toString()}`);
            }
          }
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;

          setResults([]);
          setCompletedQuery(trimmedQuery);
          pendingEnterRef.current = false;
          setError(
            err instanceof Error
              ? err.message
              : "Unable to search right now.",
          );
          setIsOpen(true);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setIsLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      // Invalidate in-flight requests as soon as the query/context effect is
      // cleaned up, not only when the next request eventually starts.
      if (requestId === requestIdRef.current) requestIdRef.current += 1;
    };
  }, [
    query,
    accessToken,
    activeBranchId,
    navigate,
    user?.id,
    user?.businessId,
    userPermissionKey,
    canCreateCustomer,
  ]);

  function selectResult(result: GlobalSearchResult) {
    setQuery("");
    setResults([]);
    setError(null);
    setCompletedQuery("");
    setIsOpen(false);
    navigate(
      result.type === "ORDER"
        ? `/order-management?orderId=${encodeURIComponent(result.id)}`
        : result.href,
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter") {
      if (isLoading || completedQuery !== query.trim()) {
        pendingEnterRef.current = true;
        return;
      }

      // Enter opens an exact typed identifier only when it identifies one
      // record. If order/invoice/payment identifiers overlap, leave the
      // separate results visible so the user can choose the intended record.
      const firstResult = exactIdentifierMatches.length > 0
        ? exactIdentifierMatch
        : results.find((result) => result.type !== "ORDER");

      if (firstResult) {
        selectResult(firstResult);
      } else if (!isLoading && !error && !hasOrderCandidate && canCreateCustomer && groups.length === 0 && quickOperations.length === 0) {
        addCustomerFromSearch();
      }
    }
  }


  function addCustomerFromSearch() {
    const trimmed = query.trim();
    if (!trimmed || !canCreateCustomer) return;
    const digits = trimmed.replace(/[^0-9]/g, "");
    const phoneLike = digits.length >= 5 && /^[+0-9().\s-]+$/.test(trimmed);
    const params = new URLSearchParams({ addCustomer: "1" });
    if (phoneLike) params.set("customerPhone", trimmed);
    setQuery("");
    setResults([]);
    setError(null);
    setCompletedQuery("");
    setIsOpen(false);
    navigate(`/orders?${params.toString()}`);
  }

  function selectQuickOperation(operation: QuickOperationDefinition) {
    setQuery("");
    setResults([]);
    setError(null);
    setCompletedQuery("");
    setIsOpen(false);

    window.dispatchEvent(
      new CustomEvent("quick-operation:open", {
        detail: operation,
      }),
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 560,
      }}
    >
      <input
        disabled={authorizationInProgress}
        type="search"
        name="global-search"
        autoComplete="off"
        data-lpignore="true"
        aria-label="Global search"
        placeholder="Search name, phone, email, order/invoice number, or an operation..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setResults([]);
          setError(null);
          setCompletedQuery("");
          pendingEnterRef.current = false;
          setIsOpen(true);
        }}
        onFocus={() => {
          if (query.trim()) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 14px",
          border: "1px solid #ccc",
          borderRadius: 8,
          fontSize: 15,
        }}
      />

      {isOpen && query.trim() ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
            overflow: "hidden",
          }}
        >
          {isLoading ? (
            <div style={{ padding: 16 }}>Searching...</div>
          ) : error ? (
            <div style={{ padding: 16 }}>{error}</div>
          ) : groups.length === 0 && quickOperations.length === 0 && !hasOrderCandidate && !canCreateCustomer ? (
            <div style={{ padding: 16 }}>No results found.</div>
          ) : (
            <>
              {quickOperations.length > 0 ? (
                <section>
                  <div
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Quick Operations
                  </div>

                  {quickOperations.map((operation) => (
                    <button
                      key={`quick-operation-${operation.code}`}
                      type="button"
                      role="option"
                      onClick={() => selectQuickOperation(operation)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: 0,
                        background: "transparent",
                        padding: "11px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <strong>{operation.code}</strong>
                        <span style={{ fontWeight: 600 }}>
                          {operation.name}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 3 }}>
                        {operation.description}
                      </div>
                    </button>
                  ))}
                </section>
              ) : null}

              {groups.length === 0 && quickOperations.length === 0 && orderMatchAvailable ? (
                <div style={{ padding: 16 }}>
                  Matching order found. Press Enter to open Order Management.
                </div>
              ) : null}

              {groups.length === 0 && quickOperations.length === 0 && hasOrderCandidate && !orderMatchAvailable ? (
                <div style={{ padding: 16 }}>
                  No exact order-number match. Check the order number and try again.
                </div>
              ) : null}

              {groups.length === 0 && quickOperations.length === 0 && !hasOrderCandidate && canCreateCustomer ? (
                <section style={{ padding: 14, borderTop: "1px solid #eee" }}>
                  <div style={{ fontWeight: 600 }}>No matching customer, order, or invoice.</div>
                  <button
                    type="button"
                    role="option"
                    onClick={addCustomerFromSearch}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 8,
                      textAlign: "left",
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      background: "#f8fafc",
                      padding: "11px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <strong>+ Add New Customer</strong>
                    <div style={{ fontSize: 13, marginTop: 3 }}>
                      Create a customer and continue to a new order
                    </div>
                  </button>
                </section>
              ) : null}

              {groups.map((group) => (
              <section key={group.type}>
                <div
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {group.label}
                </div>

                {group.results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    role="option"
                    onClick={() => selectResult(result)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      border: 0,
                      background: "transparent",
                      padding: "11px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{result.title}</div>
                    <div style={{ fontSize: 13, marginTop: 3 }}>
                      {result.subtitle}
                    </div>
                  </button>
                ))}
              </section>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
