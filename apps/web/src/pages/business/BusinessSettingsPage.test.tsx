import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessSettingsPage } from "./BusinessSettingsPage.js";
import { getBusinessBranding } from "../../lib/businesses-api.js";
import { apiFetch } from "../../lib/api-client.js";

vi.mock("../../lib/businesses-api.js", () => ({
  getBusinessBranding: vi.fn(),
}));

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      accessToken: "token",
      activeBranchId: "branch-1",
    }),
}));

const mockedGetBranding = vi.mocked(getBusinessBranding);
const mockedApiFetch = vi.mocked(apiFetch);

const branding = {
  id: "business-1",
  name: "LaundryAngel Demo",
  phone: "08000000000",
  email: "owner@example.com",
  website: null,
  address: "Gwarinpa",
  logoUrl: null,
  receiptPrimaryColor: "#1f7a4d",
  receiptAccentColor: "#f59e0b",
  receiptBackgroundColor: "#ffffff",
  receiptTextColor: "#111827",
  receiptHeaderStyle: "standard",
};

describe("BusinessSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBranding.mockResolvedValue(branding);
    mockedApiFetch.mockResolvedValue(branding);
  });

  it("loads business branding settings", async () => {
    render(<BusinessSettingsPage />);

    expect(await screen.findByText("LaundryAngel Demo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Receipt appearance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Default customer agreement" }),
    ).toBeInTheDocument();
  });

  it("saves receipt branding settings", async () => {
    render(<BusinessSettingsPage />);

    await screen.findByText("LaundryAngel Demo");

    fireEvent.change(screen.getByLabelText("Receipt header style"), {
      target: { value: "compact" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Save branding settings" }),
    );

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/businesses/branding",
        expect.objectContaining({
          method: "PATCH",
          accessToken: "token",
          branchId: "branch-1",
          body: expect.stringContaining('"receiptHeaderStyle":"compact"'),
        }),
      );
    });
  });

  it("uploads an accepted image using its real MIME type", async () => {
    const file = new File(["logo"], "logo.png", { type: "image/png" });

    render(<BusinessSettingsPage />);

    await screen.findByText("LaundryAngel Demo");

    fireEvent.change(screen.getByLabelText("Business logo file"), {
      target: { files: [file] },
    });
  });
});
