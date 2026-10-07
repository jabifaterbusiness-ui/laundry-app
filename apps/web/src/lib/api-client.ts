const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
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

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, branchId, sensitiveAuthorization, headers, ...rest } = options;

  let res: Response;

  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
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
    });
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
    throw new ApiError(body?.error?.message ?? `Request failed with status ${res.status}`, res.status);
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
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(branchId ? { "X-Branch-Id": branchId } : {}),
        ...(sensitiveAuthorization
          ? { "X-Sensitive-Authorization": sensitiveAuthorization }
          : {}),
        ...headers,
      },
    });
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
    );
  }

  return res.blob();
}
