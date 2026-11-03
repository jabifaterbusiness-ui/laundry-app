import { z } from "zod";
export const customerPriceListSchema = z.object({ customerId: z.string().uuid() });
export const customerPriceSchema = z.object({
  customerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  unitPrice: z.number().int().min(0),
}).strict();
export const customerPriceIdSchema = z.object({ id: z.string().uuid() });
