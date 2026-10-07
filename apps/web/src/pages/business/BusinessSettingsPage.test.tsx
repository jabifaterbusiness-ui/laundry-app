import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessSettingsPage } from "./BusinessSettingsPage.js";
import { getBusinessBranding } from "../../lib/businesses-api.js";
import { apiFetch, apiFetchBlob } from "../../lib/api-client.js";

vi.mock("../../lib/businesses-api.js", () => ({
  getBusinessBranding: vi.fn(),
}));

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
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
const mockedApiFetchBlob = vi.mocked(apiFetchBlob);

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
    mockedApiFetchBlob.mockResolvedValue(
      new Blob(["logo"], { type: "image/png" }),
    );
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

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:logo"),
      revokeObjectURL: vi.fn(),
    });

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 500;
      naturalHeight = 500;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal("Image", MockImage);

    render(<BusinessSettingsPage />);

    await screen.findByText("LaundryAngel Demo");

    fireEvent.change(screen.getByLabelText("Business logo file"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/businesses/logo",
        expect.objectContaining({
          method: "POST",
          accessToken: "token",
          branchId: "branch-1",
          headers: { "Content-Type": "image/png" },
          body: file,
        }),
      );
    });
  });

  it("loads an existing business logo through authenticated blob fetch", async () => {
    const brandingWithLogo = {
      ...branding,
      logoUrl: "http://localhost:4000/api/v1/businesses/logo",
    };

    mockedGetBranding.mockResolvedValue(brandingWithLogo);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:business-logo"),
      revokeObjectURL: vi.fn(),
    });

    render(<BusinessSettingsPage />);

    expect(
      await screen.findByAltText("LaundryAngel Demo logo"),
    ).toHaveAttribute("src", "blob:business-logo");

    expect(mockedApiFetchBlob).toHaveBeenCalledWith(
      "/businesses/logo",
      {
        accessToken: "token",
        branchId: "branch-1",
      },
    );
  });

  it("rejects unsupported logo formats before upload", async () => {
    const file = new File(["logo"], "logo.gif", { type: "image/gif" });

    render(<BusinessSettingsPage />);

    await screen.findByText("LaundryAngel Demo");

    fireEvent.change(screen.getByLabelText("Business logo file"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText("Logo must be a PNG, JPG/JPEG, or WebP image."),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      "/businesses/logo",
      expect.anything(),
    );
  });

  it("rejects logos larger than 5 MB before upload", async () => {
    const file = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "large.png",
      { type: "image/png" },
    );

    render(<BusinessSettingsPage />);

    await screen.findByText("LaundryAngel Demo");

    fireEvent.change(screen.getByLabelText("Business logo file"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText("Logo must be 5 MB or smaller."),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      "/businesses/logo",
      expect.anything(),
    );
  });

  it("rejects images below the minimum 200 by 200 dimensions", async () => {
    const file = new File(["logo"], "small.png", { type: "image/png" });

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:small"),
      revokeObjectURL: vi.fn(),
    });

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 199;
      naturalHeight = 200;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal("Image", MockImage);

    render(<BusinessSettingsPage />);

    await screen.findByText("LaundryAngel Demo");

    fireEvent.change(screen.getByLabelText("Business logo file"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(
        "Logo must be at least 200 × 200 pixels.",
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      "/businesses/logo",
      expect.anything(),
    );
  });
});
