import { z } from "zod";

export const fundCustomerAccountSchema = z.object({
  amount: z.coerce
    .number()
    .int("Account funding amount must be a whole number")
    .positive("Account funding amount must be positive"),
  note: z.string().trim().max(1000, "Account funding note is too long").optional(),
}).strict();
