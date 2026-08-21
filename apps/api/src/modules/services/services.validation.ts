import { z } from "zod";

export const serviceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pieces: z.number().int().min(1).max(100),
  unitPrice: z.number().int().min(0),
});

export const updateServiceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  pieces: z.number().int().min(1).max(100).optional(),
  unitPrice: z.number().int().min(0).optional(),
});

export const listServicesQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
  search: z.string().trim().max(120).optional(),
});
