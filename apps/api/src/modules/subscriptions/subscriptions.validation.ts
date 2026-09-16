import { z } from "zod";

export const createSubscriptionSchema = z.object({
  plan: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  startsAt: z.coerce.date().optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
