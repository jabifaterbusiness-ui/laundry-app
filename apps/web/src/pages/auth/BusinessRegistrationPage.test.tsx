import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessRegistrationPage } from "./BusinessRegistrationPage.js";

const apiFetchMock = vi.hoisted(() => vi.fn());
const setSessionMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {},
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (
    selector: (state: { setSession: typeof setSessionMock }) => unknown,
  ) => selector({ setSession: setSessionMock }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

beforeEach(() => {
  apiFetchMock.mockReset();
  setSessionMock.mockReset();
  navigateMock.mockReset();
});

describe("BusinessRegistrationPage", () => {
  it("loads the public registration form when registration is enabled", async () => {
    apiFetchMock.mockResolvedValueOnce({ registrationEnabled: true });

    render(
      <MemoryRouter>
        <BusinessRegistrationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Create your Laundry Angel business",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Business name"),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("First branch")).toBeInTheDocument();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/business-registration/status",
    );
  });

  it("shows the administrator message when registration is disabled", async () => {
    apiFetchMock.mockResolvedValueOnce({ registrationEnabled: false });

    render(
      <MemoryRouter>
        <BusinessRegistrationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Registration unavailable",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/New business registration is currently unavailable/i),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
  });

  it("registers the business and stores the returned authenticated session", async () => {
    apiFetchMock.mockResolvedValueOnce({ registrationEnabled: true });
    apiFetchMock.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "owner@example.com",
        username: "owner",
        fullName: "Owner",
        role: "Business Owner",
        securityRole: "BUSINESS_OWNER",
        businessId: "biz-1",
        branches: [{ id: "branch-1", name: "Main Branch" }],
        permissions: [],
      },
    });

    render(
      <MemoryRouter>
        <BusinessRegistrationPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", {
      name: "Create your Laundry Angel business",
    });

    fireEvent.change(screen.getByLabelText("Business name"), {
      target: { value: "Fresh Laundry" },
    });
    fireEvent.change(screen.getByLabelText("Business email"), {
      target: { value: "BUSINESS@EXAMPLE.COM" },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Owner Name" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "OWNER@EXAMPLE.COM" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "OWNER" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create my Laundry Angel business",
      }),
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/business-registration", {
        method: "POST",
        body: expect.any(String),
      });
    });

    const registrationCall = apiFetchMock.mock.calls.find(
      ([path]) => path === "/business-registration",
    );

    expect(registrationCall).toBeDefined();

    const requestBody = JSON.parse(
      registrationCall?.[1]?.body as string,
    );

    expect(requestBody).toMatchObject({
      businessName: "Fresh Laundry",
      businessEmail: "business@example.com",
      ownerName: "Owner Name",
      ownerEmail: "owner@example.com",
      username: "owner",
      password: "password123",
      confirmPassword: "password123",
      countryCode: "NG",
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      locale: "en-NG",
      branchName: "Main Branch",
    });

    expect(setSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
  });

  it("prevents submission when passwords do not match", async () => {
    apiFetchMock.mockResolvedValueOnce({ registrationEnabled: true });

    render(
      <MemoryRouter>
        <BusinessRegistrationPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", {
      name: "Create your Laundry Angel business",
    });

    fireEvent.change(screen.getByLabelText("Business name"), {
      target: { value: "Test Laundry" },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Owner" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create my Laundry Angel business",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Passwords do not match.");

    expect(
      apiFetchMock.mock.calls.some(
        ([path, options]) =>
          path === "/business-registration" &&
          options?.method === "POST",
      ),
    ).toBe(false);

    expect(setSessionMock).not.toHaveBeenCalled();
  });
});
