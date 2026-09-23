import { z } from "zod";

export const reportDateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => !data.from || !data.to || data.from <= data.to,
  {
    message: "The from date must be before or equal to the to date",
    path: ["from"],
  },
);

export type ReportDateRange = z.infer<typeof reportDateRangeSchema>;


export const annualReportYearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
