import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { analyzeMigrationSource, getMigrationJob, importMigrationJob } from "./migration.service.js";
import { exportBusinessBackup, restoreBusinessBackup } from "./backup.service.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business", 403);
  return req.user.businessId;
}

async function readRawBody(req: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > maxBytes) throw new AppError("Uploaded file is too large", 413);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new AppError("Uploaded file is too large", 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

const importSchema = z.object({
  duplicatePolicy: z.enum(["skip", "merge", "create"]).default("skip"),
  confirm: z.literal(true),
  mapping: z.object({
    name: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional(),
    phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), notes: z.string().optional(),
  }).optional(),
});

const restoreSchema = z.object({ password: z.string().min(12) });

const backupActionReasonSchema = z
  .string()
  .trim()
  .min(1, "Reason is required")
  .max(1000);

export async function analyze(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const userId = req.user!.id;
  const sourceNameHeader = req.headers["x-file-name"];
  const sourceName = typeof sourceNameHeader === "string" && sourceNameHeader.trim() ? sourceNameHeader.trim() : "uploaded-backup";
  const buffer = await readRawBody(req, config.migrations.maxUploadBytes);
  const result = await analyzeMigrationSource({ businessId, userId, sourceName, buffer });
  await recordAuditEvent({ action: "migration.analyzed", entityType: "MigrationJob", entityId: result.job.id, businessId, actorUserId: userId, correlationId: req.correlationId ?? null, metadata: { sourceType: result.job.sourceType, sourceName, files: result.summary.files, records: result.summary.records, customers: result.summary.supported.customers } });
  res.status(201).json(result);
}

export async function getJob(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const job = await getMigrationJob(businessId, req.params.id!);
  res.status(200).json(job);
}

export async function importJob(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = importSchema.parse(req.body);
const result = await importMigrationJob({
  businessId,
  userId: req.user!.id,
  jobId: req.params.id!,
  duplicatePolicy: input.duplicatePolicy,
  ...(input.mapping ? { mapping: input.mapping } : {}),
});
  res.status(200).json(result);
}

export async function exportBackup(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const password = restoreSchema.parse(req.body).password;
  const reason = backupActionReasonSchema.parse(req.body.reason);
  const backup = await exportBusinessBackup(
    businessId,
    req.user!.id,
    password,
    reason,
  );
  res.status(200);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="laundry-backup-${new Date().toISOString().slice(0, 10)}.laundry-backup"`);
  res.setHeader("X-Backup-Version", "2");
  res.send(backup);
}

export async function restoreBackup(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const passwordHeader = req.headers["x-backup-password"];
  if (typeof passwordHeader !== "string") throw new AppError("X-Backup-Password header is required", 422);
  const password = restoreSchema.parse({ password: passwordHeader }).password;
  const reasonHeader = req.headers["x-backup-reason"];
  if (typeof reasonHeader !== "string") {
    throw new AppError("X-Backup-Reason header is required", 422);
  }
  const reason = backupActionReasonSchema.parse(reasonHeader);
  const buffer = await readRawBody(req, config.migrations.maxUploadBytes);
  const result = await restoreBusinessBackup(
    businessId,
    req.user!.id,
    buffer,
    password,
    reason,
  );
  res.status(200).json(result);
}
