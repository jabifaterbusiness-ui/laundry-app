import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  globalSearch,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from "../../lib/search-api.js";
import { useAuthStore } from "../../state/auth-store.js";
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
];

function groupResults(results: GlobalSearchResult[]) {
  return RESULT_GROUPS.map((group) => ({
    ...group,
    results: results.filter((result) => result.type === group.type),
  })).filter((group) => group.results.length > 0);
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setIsLoading(false);
      setError(null);
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
          setIsOpen(true);
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;

          setResults([]);
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
    };
  }, [query, accessToken, activeBranchId]);

  function selectResult(result: GlobalSearchResult) {
    setQuery("");
    setResults([]);
    setError(null);
    setIsOpen(false);
    navigate(result.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter") {
      const firstResult = results[0];

      if (firstResult) {
        selectResult(firstResult);
      }
    }
  }

  const groups = groupResults(results);
  const quickOperations = searchQuickOperations(query);

  function selectQuickOperation(operation: QuickOperationDefinition) {
    setQuery("");
    setResults([]);
    setError(null);
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
        aria-label="Global search"
        placeholder="Search customers, orders, invoices..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
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
          ) : groups.length === 0 && quickOperations.length === 0 ? (
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
