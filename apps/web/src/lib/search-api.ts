import { apiFetch } from "./api-client.js";

export type GlobalSearchResultType = "CUSTOMER" | "ORDER" | "INVOICE";

export interface GlobalSearchResult {
  type: GlobalSearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface GlobalSearchResponse {
  data: GlobalSearchResult[];
}

export interface GlobalSearchParams {
  q: string;
  limit?: number;
}

function buildQuery(params: GlobalSearchParams): string {
  const query = new URLSearchParams();

  query.set("q", params.q);

  if (params.limit) {
    query.set("limit", String(params.limit));
  }

  return `?${query.toString()}`;
}

export async function globalSearch(
  params: GlobalSearchParams,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<GlobalSearchResult[]> {
  const response = await apiFetch<GlobalSearchResponse>(
    `/search${buildQuery(params)}`,
    {
      accessToken: auth.accessToken,
      branchId,
    },
  );

  return response.data;
}
