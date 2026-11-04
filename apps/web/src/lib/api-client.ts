import { useAuthStore } from "../state/auth-store.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Unable to reach the server") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

interface RequestOptions extends RequestInit {
  accessToken?: string | null;
  // The user's currently-selected branch (distinct from their branch
  // memberships - see state/auth-store.ts). Sent as X-Branch-Id; the
  // server re-validates it against the database rather than trusting it.
  branchId?: string | null;
  sensitiveAuthorization?: string | null;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshStoredAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) {
          if (response.status === 401) useAuthStore.getState().clearSession();
          return null;
        }
        const tokens = await response.json() as { accessToken?: string; refreshToken?: string };
        if (!tokens.accessToken || !tokens.refreshToken) return null;
        useAuthStore.getState().setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        return tokens.accessToken;
      } catch {
        return null;
      }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function fetchWithTokenRefresh(url: string, init: RequestInit, path: string, accessToken?: string | null): Promise<Response> {
  const response = await fetch(url, init);
  const endpoint = path.split("?")[0];
  const isAuthenticationEndpoint = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/forgot-password", "/auth/reset-password"].includes(endpoint ?? path);
  if (response.status !== 401 || !accessToken || isAuthenticationEndpoint) return response;
  const currentAccessToken = useAuthStore.getState().accessToken;
  const replacementToken = currentAccessToken && currentAccessToken !== accessToken
    ? currentAccessToken
    : await refreshStoredAccessToken();
  if (!replacementToken || replacementToken === accessToken) return response;
  return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${replacementToken}` } });
}
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, branchId, sensitiveAuthorization, headers, ...rest } = options;

  let res: Response;

  try {
    const url = `${API_BASE_URL}${path}`;
    const requestInit: RequestInit = {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(branchId ? { "X-Branch-Id": branchId } : {}),
        ...(sensitiveAuthorization
          ? { "X-Sensitive-Authorization": sensitiveAuthorization }
          : {}),
        ...headers,
      },
    };
    res = await fetchWithTokenRefresh(url, requestInit, path, accessToken);
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }

    throw new NetworkError(
      error instanceof Error && error.message
        ? error.message
        : "Unable to reach the server",
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      body?.error?.details,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function apiFetchBlob(
  path: string,
  options: RequestInit & {
    accessToken?: string | null;
    branchId?: string | null;
    sensitiveAuthorization?: string | null;
  } = {},
): Promise<Blob> {
  const {
    accessToken,
    branchId,
    sensitiveAuthorization,
    headers,
    ...rest
  } = options;

  let res: Response;

  try {
    const url = `${API_BASE_URL}${path}`;
    const requestInit: RequestInit = {
      ...rest,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(branchId ? { "X-Branch-Id": branchId } : {}),
        ...(sensitiveAuthorization
          ? { "X-Sensitive-Authorization": sensitiveAuthorization }
          : {}),
        ...headers,
      },
    };
    res = await fetchWithTokenRefresh(url, requestInit, path, accessToken);
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }

    throw new NetworkError(
      error instanceof Error && error.message
        ? error.message
        : "Unable to reach the server",
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      body?.error?.details,
    );
  }

  return res.blob();
}
