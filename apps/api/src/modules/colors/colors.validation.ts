import { z } from "zod";

export const colorIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createColorSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const updateColorSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
});

export const listColorsQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
  search: z.string().trim().max(60).optional(),
});
