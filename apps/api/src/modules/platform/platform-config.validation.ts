import { z } from "zod";

export const updatePlatformConfigSchema = z
  .object({
    allowNewBusinessRegistration: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
    whatsappMessagingEnabled: z.boolean().optional(),
    automatedNotificationsEnabled: z.boolean().optional(),
    offlineSyncEnabled: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).some(
        (key) => key !== "expectedVersion",
      ),
    {
      message: "At least one platform configuration setting is required",
    },
  );

export type UpdatePlatformConfigRequest = z.infer<
  typeof updatePlatformConfigSchema
>;
