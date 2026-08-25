import { apiFetch } from "./api-client.js";

export interface Service {
  id: string;
  businessId: string;
  name: string;
  pieces: number;
  unitPrice: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListServicesParams {
  status?: "active" | "inactive" | "all";
  search?: string;
}

export interface CreateServiceInput {
  name: string;
  pieces: number;
  unitPrice: number;
}

export type UpdateServiceInput = Partial<CreateServiceInput>;

function buildQuery(params: ListServicesParams): string {
  const query = new URLSearchParams();

  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function listServices(
  params: ListServicesParams,
  auth: { accessToken: string | null },
): Promise<{ data: Service[] }> {
  return apiFetch<{ data: Service[] }>(
    `/services${buildQuery(params)}`,
    { accessToken: auth.accessToken },
  );
}

export async function getService(
  id: string,
  auth: { accessToken: string | null },
): Promise<Service> {
  return apiFetch<Service>(`/services/${id}`, {
    accessToken: auth.accessToken,
  });
}

export async function createService(
  input: CreateServiceInput,
  auth: { accessToken: string | null },
): Promise<Service> {
  return apiFetch<Service>("/services", {
    method: "POST",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export async function updateService(
  id: string,
  input: UpdateServiceInput,
  auth: { accessToken: string | null },
): Promise<Service> {
  return apiFetch<Service>(`/services/${id}`, {
    method: "PATCH",
    accessToken: auth.accessToken,
    body: JSON.stringify(input),
  });
}

export async function setServiceActive(
  id: string,
  isActive: boolean,
  auth: { accessToken: string | null },
): Promise<Service> {
  return apiFetch<Service>(
    `/services/${id}/${isActive ? "activate" : "deactivate"}`,
    {
      method: "POST",
      accessToken: auth.accessToken,
    },
  );
}
