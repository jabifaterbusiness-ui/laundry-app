import { apiFetch } from "./api-client.js";

export interface Color {
  id: string;
  businessId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListColorsParams {
  status?: "active" | "inactive" | "all";
  search?: string;
}

export interface CreateColorInput {
  name: string;
}

function buildQuery(params: ListColorsParams): string {
  const query = new URLSearchParams();

  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function listColors(
  params: ListColorsParams,
  auth: { accessToken: string | null },
): Promise<{ data: Color[] }> {
  return apiFetch<{ data: Color[] }>(
    `/colors${buildQuery(params)}`,
    { accessToken: auth.accessToken },
  );
}

export async function createColor(
  input: CreateColorInput,
  auth: { accessToken: string | null },
): Promise<Color> {
  return apiFetch<Color>("/colors", {
    method: "POST",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export async function updateColor(
  id: string,
  input: CreateColorInput,
  auth: { accessToken: string | null },
): Promise<Color> {
  return apiFetch<Color>(`/colors/${id}`, {
    method: "PATCH",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export async function setColorActive(
  id: string,
  isActive: boolean,
  auth: { accessToken: string | null },
): Promise<Color> {
  return apiFetch<Color>(
    `/colors/${id}/${isActive ? "activate" : "deactivate"}`,
    {
      method: "POST",
      accessToken: auth.accessToken,
    },
  );
}
