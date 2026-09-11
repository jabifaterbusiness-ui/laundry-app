import { z } from "zod";

export const setupSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(120),
  ownerName: z.string().trim().min(1, "Owner full name is required").max(120),
  ownerEmail: z.string().trim().email("Invalid owner email address").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  branchName: z.string().trim().min(1, "Branch name is required").max(120),
});

export type SetupInput = z.infer<typeof setupSchema>;
