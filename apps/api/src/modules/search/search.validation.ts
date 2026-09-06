import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict();

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
