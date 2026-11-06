import { apiFetch } from "./api-client.js";

export interface Service {
  id: string;
  businessId: string;
  ownerBranchId?: string | null;
  ownerBranch?: { id: string; name: string } | null;
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
  auth: { accessToken: string | null; branchId?: string | null },
): Promise<Service> {
  return apiFetch<Service>("/services", {
    method: "POST",
    accessToken: auth.accessToken,
    branchId: auth.branchId,
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


export interface PriceAdjustmentRule {
  id: string;
  name: string;
  percentage: number;
  isActive: boolean;
  targetScope: "MANUAL" | "CUSTOMER" | "GROUP" | "ALL_CUSTOMERS";
  customerId: string | null;
  groupId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allowStacking: boolean;
  excludedServiceIds: string[];
  customer?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
}
export interface TaxRuleSetting {
  id: string; name: string; kind: "PERCENTAGE" | "FIXED"; value: number;
  treatment: "ADDITIVE" | "WITHHOLDING"; enabledByDefault: boolean;
  allowWithOtherTaxes: boolean; isActive: boolean;
}
export interface PricingRulesResponse {
  adjustments: PriceAdjustmentRule[];
  taxes: TaxRuleSetting[];
}
export interface CustomerServicePrice {
  id: string;
  customerId: string;
  serviceId: string;
  branchId?: string | null;
  branch?: { id: string; name: string } | null;
  unitPrice: number;
  service: Pick<Service, "id" | "name" | "pieces" | "unitPrice" | "isActive">;
}
export async function listPricingRules(auth: { accessToken: string | null }): Promise<PricingRulesResponse> {
  return apiFetch<PricingRulesResponse>("/services/pricing-rules", { accessToken: auth.accessToken });
}
export async function createPriceAdjustment(input: {
  name: string;
  percentage: number;
  targetScope?: PriceAdjustmentRule["targetScope"];
  customerId?: string;
  groupId?: string;
  startsAt?: string;
  endsAt?: string;
  allowStacking?: boolean;
  excludedServiceIds?: string[];
}, auth: { accessToken: string | null }): Promise<PriceAdjustmentRule> {
  return apiFetch<PriceAdjustmentRule>("/services/price-adjustments", { method: "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function setPriceAdjustmentActive(id: string, isActive: boolean, auth: { accessToken: string | null }): Promise<PriceAdjustmentRule> {
  return apiFetch<PriceAdjustmentRule>(`/services/price-adjustments/${id}`, { method: "PATCH", accessToken: auth.accessToken, body: JSON.stringify({ isActive }) });
}
export async function deletePriceAdjustment(id: string, auth: { accessToken: string | null }): Promise<void> {
  return apiFetch<void>(`/services/price-adjustments/${id}`, { method: "DELETE", accessToken: auth.accessToken });
}
export async function createTaxRule(input: Omit<TaxRuleSetting, "id" | "isActive">, auth: { accessToken: string | null }): Promise<TaxRuleSetting> {
  return apiFetch<TaxRuleSetting>("/services/tax-rules", { method: "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function deleteTaxRule(id: string, auth: { accessToken: string | null }): Promise<void> {
  return apiFetch<void>(`/services/tax-rules/${id}`, { method: "DELETE", accessToken: auth.accessToken });
}
export async function listCustomerServicePrices(customerId: string, auth: { accessToken: string | null }): Promise<{ data: CustomerServicePrice[] }> {
  return apiFetch<{ data: CustomerServicePrice[] }>(`/services/customer-prices?customerId=${encodeURIComponent(customerId)}`, { accessToken: auth.accessToken });
}
export async function saveCustomerServicePrice(input: { customerId: string; serviceId: string; unitPrice: number }, auth: { accessToken: string | null }): Promise<CustomerServicePrice> {
  return apiFetch<CustomerServicePrice>("/services/customer-prices", { method: "PUT", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function deleteCustomerServicePrice(id: string, auth: { accessToken: string | null }): Promise<void> {
  return apiFetch<void>(`/services/customer-prices/${id}`, { method: "DELETE", accessToken: auth.accessToken });
}
