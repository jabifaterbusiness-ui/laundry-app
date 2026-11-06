import { apiFetch } from "./api-client.js";

export type BranchResourceType = "CUSTOMERS" | "SERVICES" | "CUSTOMER_PRICING" | "DISCOUNTS" | "TAX_RULES" | "INVENTORY";
export type BranchResourceAccessLevel = "READ" | "EDIT";

export interface BranchResourceShare {
  id: string;
  ownerBranchId: string;
  targetBranchId: string;
  resourceType: BranchResourceType;
  resourceId: string | null;
  userId: string | null;
  accessLevel: BranchResourceAccessLevel;
  customerAccountMode: "SHARED" | "SEPARATE";
  ownerBranch: { id: string; name: string };
  targetBranch: { id: string; name: string };
  user: { id: string; fullName: string; email: string } | null;
}

export interface SaveBranchResourceShareInput {
  ownerBranchId: string;
  targetBranchId: string;
  resourceType: BranchResourceType;
  resourceId?: string | null;
  userId?: string | null;
  accessLevel: BranchResourceAccessLevel;
  customerAccountMode?: "SHARED" | "SEPARATE";
}

export function listBranchResourceShares(accessToken: string) {
  return apiFetch<BranchResourceShare[]>("/branches/sharing", { accessToken });
}

export function saveBranchResourceShare(input: SaveBranchResourceShareInput, accessToken: string) {
  return apiFetch<BranchResourceShare>("/branches/sharing", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  });
}

export function deleteBranchResourceShare(id: string, accessToken: string) {
  return apiFetch<void>("/branches/sharing/" + encodeURIComponent(id), {
    method: "DELETE",
    accessToken,
  });
}
