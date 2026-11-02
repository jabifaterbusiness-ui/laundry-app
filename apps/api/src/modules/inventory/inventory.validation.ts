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
  sku: z.string().trim().max(100, "SKU is too long").optional(),
  category: z.string().trim().max(120, "Category is too long").optional(),
  storageLocation: z.string().trim().max(160, "Storage location is too long").optional(),
  description: z.string().trim().max(1000, "Inventory item description is too long").optional(),
  unit: z.enum(["PIECE", "PACK", "BOTTLE", "LITRE", "KILOGRAM", "BOX", "ROLL", "OTHER"]),
  reorderQuantity: z.coerce.number().int().min(0, "Reorder quantity cannot be negative").default(0),
  lowStockThreshold: z.coerce.number().int().min(0, "Low stock threshold cannot be negative").default(0),
}).strict();

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Inventory item name is required").max(200, "Inventory item name is too long").optional(),
  sku: z.string().trim().max(100, "SKU is too long").optional(),
  category: z.string().trim().max(120, "Category is too long").optional(),
  storageLocation: z.string().trim().max(160, "Storage location is too long").optional(),
  description: z.string().trim().max(1000, "Inventory item description is too long").optional(),
  unit: z.enum(["PIECE", "PACK", "BOTTLE", "LITRE", "KILOGRAM", "BOX", "ROLL", "OTHER"]).optional(),
  reorderQuantity: z.coerce.number().int().min(0, "Reorder quantity cannot be negative").optional(),
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


export const createInventorySupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(1000).optional(),
  taxId: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

export const listInventorySuppliersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const createInventoryPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  orderNumber: z.string().trim().min(1).max(100),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    inventoryItemId: z.string().uuid(),
    quantityOrdered: z.coerce.number().int().positive().max(100000000),
    unitCost: z.coerce.number().int().min(0).max(2147483647),
  }).strict()).min(1).max(200),
}).strict();

export const listInventoryPurchaseOrdersQuerySchema = z.object({
  status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const receiveInventoryPurchaseOrderSchema = z.object({
  receiptNumber: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    purchaseOrderLineId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().max(100000000),
    unitCost: z.coerce.number().int().min(0).max(2147483647).optional(),
  }).strict()).min(1).max(200),
}).strict();

export const createInventoryTransferSchema = z.object({
  destinationBranchId: z.string().uuid(),
  transferNumber: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.coerce.number().int().positive().max(100000000) }).strict()).min(1).max(200),
}).strict();
export const receiveInventoryTransferSchema = z.object({
  lines: z.array(z.object({ transferLineId: z.string().uuid(), quantity: z.coerce.number().int().positive().max(100000000) }).strict()).min(1).max(200),
}).strict();
export const createInventoryStocktakeSchema = z.object({
  reference: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({ inventoryItemId: z.string().uuid(), countedQuantity: z.coerce.number().int().min(0).max(100000000) }).strict()).min(1).max(500),
}).strict();
export const inventoryOperationIdParamSchema = z.object({ id: z.string().uuid() });
export const createInventoryReservationSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(100000000),
  reference: z.string().trim().max(200).optional(),
  expiresAt: z.coerce.date().optional(),
}).strict();
