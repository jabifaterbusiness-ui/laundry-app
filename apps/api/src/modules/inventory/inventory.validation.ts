import { z } from "zod";

export const inventoryItemIdParamSchema = z.object({
  id: z.string().uuid("Invalid inventory item ID"),
});

export const inventoryStockIdParamSchema = z.object({
  id: z.string().uuid("Invalid inventory stock ID"),
});

export const inventoryMovementIdParamSchema = z.object({
  id: z.string().uuid("Invalid inventory movement ID"),
});

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Inventory item name is required").max(200, "Inventory item name is too long"),
  description: z.string().trim().max(1000, "Inventory item description is too long").optional(),
  unit: z.enum(["PIECE", "PACK", "BOTTLE", "LITRE", "KILOGRAM", "BOX", "ROLL", "OTHER"]),
  lowStockThreshold: z.coerce.number().int().min(0, "Low stock threshold cannot be negative").default(0),
}).strict();

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Inventory item name is required").max(200, "Inventory item name is too long").optional(),
  description: z.string().trim().max(1000, "Inventory item description is too long").optional(),
  unit: z.enum(["PIECE", "PACK", "BOTTLE", "LITRE", "KILOGRAM", "BOX", "ROLL", "OTHER"]).optional(),
  lowStockThreshold: z.coerce.number().int().min(0, "Low stock threshold cannot be negative").optional(),
  isActive: z.boolean().optional(),
}).strict();


export const listInventoryItemsQuerySchema = z.object({
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const listInventoryStockQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
  lowStockOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const listInventoryMovementsQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
  type: z.enum(["RECEIPT", "ISSUE", "ADJUSTMENT"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});


export const createInventoryMovementSchema = z.object({
  inventoryItemId: z.string().uuid("Invalid inventory item ID"),
  quantity: z.coerce.number().int().positive("Quantity must be a positive whole number"),
  type: z.enum(["RECEIPT", "ISSUE"]),
  reason: z.string().trim().max(1000, "Movement reason is too long").optional(),
  reference: z.string().trim().max(200, "Movement reference is too long").optional(),
}).strict();

export const adjustInventoryStockSchema = z.object({
  inventoryItemId: z.string().uuid("Invalid inventory item ID"),
  quantity: z.coerce.number().int().refine((value) => value !== 0, {
    message: "Adjustment quantity cannot be zero",
  }),
  reason: z.string().trim().min(1, "Adjustment reason is required").max(1000, "Adjustment reason is too long"),
  reference: z.string().trim().max(200, "Adjustment reference is too long").optional(),
}).strict();
