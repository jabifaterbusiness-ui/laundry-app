import { apiFetch } from "./api-client.js";

export type BusinessBranding = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  receiptPrimaryColor: string | null;
  receiptAccentColor: string | null;
  receiptBackgroundColor: string | null;
  receiptTextColor: string | null;
  receiptHeaderStyle: string | null;
};

export async function getBusinessBranding(
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<BusinessBranding> {
  return apiFetch<BusinessBranding>("/businesses/branding", {
    accessToken: auth.accessToken,
    branchId,
  });
}


export async function updateBusinessBranding(
  input: {
    receiptPrimaryColor?: string | null;
    receiptAccentColor?: string | null;
    receiptBackgroundColor?: string | null;
    receiptTextColor?: string | null;
    receiptHeaderStyle?: string | null;
    defaultCustomerAgreement?: string;
  },
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<BusinessBranding> {
  return apiFetch<BusinessBranding>("/businesses/branding", {
    method: "PATCH",
    accessToken: auth.accessToken,
    branchId,
    body: JSON.stringify(input),
  });
}
