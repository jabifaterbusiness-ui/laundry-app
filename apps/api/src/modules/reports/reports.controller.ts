import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { reportDateRangeSchema } from "./reports.validation.js";
import { getDashboardReport } from "./reports.service.js";
import { getFinancialStatement } from "./financial-statement.service.js";
import { getAnnualReport } from "./annual-report.service.js";
import { annualReportYearSchema } from "./reports.validation.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

function requireBranchId(req: Request): string {
  if (!req.branchId) {
    throw new AppError(
      "A valid branch context is required",
      400,
    );
  }

  return req.branchId;
}

export async function dashboard(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const range = reportDateRangeSchema.parse(req.query);

  const report = await getDashboardReport(
    {
      businessId,
      branchId,
    },
    {
      ...(range.from !== undefined ? { from: range.from } : {}),
      ...(range.to !== undefined ? { to: range.to } : {}),
    },
  );

  res.status(200).json(report);
}


export async function collectionStatement(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const range = reportDateRangeSchema.parse(req.query);

  const report = await getDashboardReport(
    { businessId, branchId },
    {
      ...(range.from !== undefined ? { from: range.from } : {}),
      ...(range.to !== undefined ? { to: range.to } : {}),
    },
  );

  res.status(200).json({
    period: report.period,
    invoices: report.invoices,
    pickup: report.pickup,
    managementInsights: report.managementInsights,
  });
}

export async function financialStatement(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const range = reportDateRangeSchema.parse(req.query);

  if (!range.from || !range.to) {
    throw new AppError(
      "Both from and to dates are required for a financial statement",
      400,
    );
  }

  const report = await getFinancialStatement(
    {
      businessId,
      branchId,
    },
    {
      from: range.from,
      to: range.to,
    },
  );

  res.status(200).json(report);
}


export async function annualReport(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { year } = annualReportYearSchema.parse(req.query);

  const report = await getAnnualReport({
    businessId,
    branchId,
    year,
  });

  res.status(200).json(report);
}
