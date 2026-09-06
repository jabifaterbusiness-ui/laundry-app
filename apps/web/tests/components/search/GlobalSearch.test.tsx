import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { GlobalSearch } from "../../../src/components/search/GlobalSearch.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import * as searchApi from "../../../src/lib/search-api.js";
import type { QuickOperationDefinition } from "../../../src/lib/quick-operations-catalog.js";

vi.mock("../../../src/lib/search-api.js");

const mockedSearchApi = vi.mocked(searchApi);

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname}</div>;
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <GlobalSearch />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "test@example.com",
      fullName: "Test User",
      role: "STAFF",
      businessId: "business-1",
      branches: [{ id: "branch-1", name: "Main Branch" }],
    },
    accessToken: "test-token",
    refreshToken: "refresh-token",
    activeBranchId: "branch-1",
  });

  mockedSearchApi.globalSearch.mockResolvedValue([]);
});

describe("GlobalSearch", () => {
  it("renders the global search input", () => {
    renderSearch();

    expect(
      screen.getByRole("textbox", { name: /global search/i }),
    ).toBeInTheDocument();
  });

  it("searches after the debounce and displays grouped results", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([
      {
        type: "CUSTOMER",
        id: "customer-1",
        title: "Jane Doe",
        subtitle: "08012345678",
        href: "/customers",
      },
      {
        type: "ORDER",
        id: "order-1",
        title: "Order #00001",
        subtitle: "Jane Doe · RECEIVED",
        href: "/orders",
      },
      {
        type: "INVOICE",
        id: "invoice-1",
        title: "Invoice #INV-00001",
        subtitle: "Jane Doe · ISSUED",
        href: "/invoices",
      },
    ]);

    renderSearch();

    await user.type(
      screen.getByRole("textbox", { name: /global search/i }),
      "Jane",
    );

    expect(
      await screen.findByRole("option", { name: /Jane Doe 08012345678/i }),
    ).toBeInTheDocument();

    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Invoices")).toBeInTheDocument();

    expect(mockedSearchApi.globalSearch).toHaveBeenCalledWith(
      { q: "Jane", limit: 10 },
      { accessToken: "test-token" },
      "branch-1",
    );
  });


  it("shows matching quick operations alongside normal search results", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([]);

    renderSearch();

    await user.type(
      screen.getByRole("textbox", { name: /global search/i }),
      "TI",
    );

    expect(
      await screen.findByRole("option", {
        name: /TI Transfer Invoice/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Quick Operations")).toBeInTheDocument();
  });

  it("opens a quick operation event when a shortcut is selected", async () => {
    const user = userEvent.setup();
    const events: QuickOperationDefinition[] = [];

    function listener(event: Event) {
      events.push(
        (event as CustomEvent<QuickOperationDefinition>).detail,
      );
    }

    window.addEventListener("quick-operation:open", listener);

    try {
      mockedSearchApi.globalSearch.mockResolvedValue([]);

      renderSearch();

      const input = screen.getByRole("textbox", {
        name: /global search/i,
      });

      await user.type(input, "TI");

      await user.click(
        await screen.findByRole("option", {
          name: /TI Transfer Invoice/i,
        }),
      );

      expect(events).toHaveLength(1);
      expect(events[0]?.code).toBe("TI");
      expect(input).toHaveValue("");
    } finally {
      window.removeEventListener("quick-operation:open", listener);
    }
  });

  it("shows an empty state when no results are returned", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([]);

    renderSearch();

    await user.type(
      screen.getByRole("textbox", { name: /global search/i }),
      "Unknown",
    );

    expect(
      await screen.findByText("No results found."),
    ).toBeInTheDocument();
  });

  it("shows an error when search fails", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockRejectedValue(
      new Error("Search service unavailable"),
    );

    renderSearch();

    await user.type(
      screen.getByRole("textbox", { name: /global search/i }),
      "Jane",
    );

    expect(
      await screen.findByText("Search service unavailable"),
    ).toBeInTheDocument();
  });

  it("navigates when a result is clicked", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([
      {
        type: "ORDER",
        id: "order-1",
        title: "Order #00001",
        subtitle: "Jane Doe · RECEIVED",
        href: "/orders",
      },
    ]);

    renderSearch();

    await user.type(
      screen.getByRole("textbox", { name: /global search/i }),
      "00001",
    );

    await user.click(
      await screen.findByRole("option", { name: /Order #00001/i }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/orders");
    expect(
      screen.getByRole("textbox", { name: /global search/i }),
    ).toHaveValue("");
  });

  it("selects the first result when Enter is pressed", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([
      {
        type: "CUSTOMER",
        id: "customer-1",
        title: "Jane Doe",
        subtitle: "08012345678",
        href: "/customers",
      },
      {
        type: "ORDER",
        id: "order-1",
        title: "Order #00001",
        subtitle: "Jane Doe · RECEIVED",
        href: "/orders",
      },
    ]);

    renderSearch();

    const input = screen.getByRole("textbox", {
      name: /global search/i,
    });

    await user.type(input, "Jane");

    await screen.findByRole("option", {
      name: /Jane Doe 08012345678/i,
    });

    await user.keyboard("{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/customers",
    );
  });

  it("closes the results when Escape is pressed", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([
      {
        type: "CUSTOMER",
        id: "customer-1",
        title: "Jane Doe",
        subtitle: "08012345678",
        href: "/customers",
      },
    ]);

    renderSearch();

    const input = screen.getByRole("textbox", {
      name: /global search/i,
    });

    await user.type(input, "Jane");

    expect(
      await screen.findByRole("option", {
        name: /Jane Doe 08012345678/i,
      }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("option", {
          name: /Jane Doe 08012345678/i,
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("clears results when the query is cleared", async () => {
    const user = userEvent.setup();

    mockedSearchApi.globalSearch.mockResolvedValue([
      {
        type: "CUSTOMER",
        id: "customer-1",
        title: "Jane Doe",
        subtitle: "08012345678",
        href: "/customers",
      },
    ]);

    renderSearch();

    const input = screen.getByRole("textbox", {
      name: /global search/i,
    });

    await user.type(input, "Jane");

    expect(
      await screen.findByRole("option", {
        name: /Jane Doe 08012345678/i,
      }),
    ).toBeInTheDocument();

    await user.clear(input);

    expect(
      screen.queryByRole("option", {
        name: /Jane Doe 08012345678/i,
      }),
    ).not.toBeInTheDocument();
  });
});
