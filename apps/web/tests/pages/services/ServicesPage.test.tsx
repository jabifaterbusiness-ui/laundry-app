import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServicesPage } from "../../../src/pages/services/ServicesPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";

const apiMocks = vi.hoisted(() => ({
  listServices: vi.fn(),
  listPricingRules: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  setServiceActive: vi.fn(),
}));

vi.mock("../../../src/lib/services-api.js", () => apiMocks);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ServicesPage />
    </QueryClientProvider>,
  );
}

describe("ServicesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      accessToken: "test-token",
      activeBranchId: "branch-1",
    });

    apiMocks.listPricingRules.mockResolvedValue({
      adjustments: [],
      taxes: [],
      pagination: {
        pageSize: 50,
        adjustments: { page: 1, total: 0, totalPages: 1 },
        taxes: { page: 1, total: 0, totalPages: 1 },
      },
    });

    apiMocks.listServices.mockResolvedValue({
      data: [
        {
          id: "service-1",
          businessId: "business-1",
          name: "Complete Agbada",
          pieces: 3,
          unitPrice: 4500,
          isActive: true,
          createdAt: "2026-08-25T00:00:00.000Z",
          updatedAt: "2026-08-25T00:00:00.000Z",
        },
      ],
    });

    apiMocks.createService.mockResolvedValue({
      id: "service-2",
      businessId: "business-1",
      name: "Shirt",
      pieces: 1,
      unitPrice: 1500,
      isActive: true,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    });

    apiMocks.updateService.mockResolvedValue({
      id: "service-1",
      businessId: "business-1",
      name: "Complete Agbada",
      pieces: 3,
      unitPrice: 5000,
      isActive: true,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    });

    apiMocks.setServiceActive.mockResolvedValue({
      id: "service-1",
      businessId: "business-1",
      name: "Complete Agbada",
      pieces: 3,
      unitPrice: 4500,
      isActive: false,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    });
  });

  it("renders the service price list", async () => {
    renderPage();

    expect(await screen.findByText("Complete Agbada")).toBeInTheDocument();
    expect(screen.getByText("₦4,500")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("paginates large discount and tax rule lists independently", async () => {
    apiMocks.listPricingRules.mockImplementation(async (
      _auth,
      _customerId,
      _purpose,
      pagination,
    ) => ({
      adjustments: [],
      taxes: [],
      pagination: {
        pageSize: 50,
        adjustments: {
          page: pagination?.adjustmentPage ?? 1,
          total: 75,
          totalPages: 2,
        },
        taxes: {
          page: pagination?.taxPage ?? 1,
          total: 0,
          totalPages: 1,
        },
      },
    }));

    renderPage();

    expect(await screen.findByText(/Page 1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]!);

    await waitFor(() => {
      expect(apiMocks.listPricingRules).toHaveBeenLastCalledWith(
        { accessToken: "test-token" },
        undefined,
        "management",
        { adjustmentPage: 2, taxPage: 1, pageSize: 50 },
      );
    });
    expect(await screen.findByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it("creates a new service", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New service" }));

    fireEvent.change(screen.getByLabelText("Item"), {
      target: { value: "Shirt" },
    });

    fireEvent.change(screen.getByLabelText("PCS"), {
      target: { value: "1" },
    });

    fireEvent.change(screen.getByLabelText("Unit Price (₦)"), {
      target: { value: "1500" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create service" }));

    await waitFor(() => {
      expect(apiMocks.createService).toHaveBeenCalledWith(
        {
          name: "Shirt",
          pieces: 1,
          unitPrice: 1500,
        },
        { accessToken: "test-token", branchId: "branch-1" },
      );
    });
  });

  it("replaces the default zero when entering a unit price", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New service" }));

    const input = screen.getByLabelText("Unit Price (₦)");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "5" } });

    expect(input).toHaveValue(5);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "25" } });

    expect(input).toHaveValue(25);
  });

  it("edits an existing service", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Complete Agbada",
      }),
    );

    fireEvent.change(screen.getByLabelText("Unit Price (₦)"), {
      target: { value: "5000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(apiMocks.updateService).toHaveBeenCalledWith(
        "service-1",
        {
          name: "Complete Agbada",
          pieces: 3,
          unitPrice: 5000,
        },
        { accessToken: "test-token" },
      );
    });
  });

  it("activates or deactivates a service", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Deactivate",
      }),
    );

    await waitFor(() => {
      expect(apiMocks.setServiceActive).toHaveBeenCalledWith(
        "service-1",
        false,
        { accessToken: "test-token" },
      );
    });
  });

  it("rejects an empty service name", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New service" }));
    fireEvent.click(screen.getByRole("button", { name: "Create service" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Service name is required.",
    );

    expect(apiMocks.createService).not.toHaveBeenCalled();
  });
});
