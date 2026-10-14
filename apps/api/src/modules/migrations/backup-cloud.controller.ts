import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createCloudBackupRun,
  listCloudBackupRuns,
  verifyBackupCloudConnection,
} from "./backup-cloud-runs.service.js";
import {
  createBackupConnection,
  deleteBackupConnection,
  getBackupSettings,
  listBackupConnections,
  saveBackupSettings,
} from "./backup-cloud.service.js";

function businessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business.", 403);
  return req.user.businessId;
}

const providerSchema = z.enum(["S3_COMPATIBLE"]);
const connectionSchema = z.object({
  provider: providerSchema,
  displayName: z.string().trim().min(1).max(100),
  credentials: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0),
  config: z.record(z.unknown()).optional(),
}).strict();

const settingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  dayOfWeek: z.number().int().min(0).max(6),
  dayOfMonth: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  timezone: z.string().trim().min(1).max(100),
  retentionCount: z.number().int().min(1).max(365),
  destinationConnectionId: z.string().uuid().nullable(),
}).strict();

export async function listCloudConnectionsController(req: Request, res: Response) {
  res.status(200).json({ connections: await listBackupConnections(businessId(req)) });
}

export async function createCloudConnectionController(req: Request, res: Response) {
  const input = connectionSchema.parse(req.body);
  const tenantId = businessId(req);
  const connection = await createBackupConnection({
    businessId: tenantId,
    provider: input.provider,
    displayName: input.displayName,
    credentials: input.credentials,
    ...(input.config ? { config: input.config } : {}),
  });
  await recordAuditEvent({
    action: "backup.cloud_connection.created",
    entityType: "BackupCloudConnection",
    entityId: connection.id,
    businessId: tenantId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: { provider: connection.provider, status: connection.status },
  });
  res.status(201).json({ connection });
}

export async function deleteCloudConnectionController(req: Request, res: Response) {
  const tenantId = businessId(req);
  const result = await deleteBackupConnection(tenantId, req.params.id!);
  await recordAuditEvent({
    action: "backup.cloud_connection.deleted",
    entityType: "BackupCloudConnection",
    entityId: req.params.id!,
    businessId: tenantId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
  });
  res.status(200).json(result);
}

export async function getCloudBackupSettingsController(req: Request, res: Response) {
  res.status(200).json({ settings: await getBackupSettings(businessId(req)) });
}

export async function saveCloudBackupSettingsController(req: Request, res: Response) {
  const input = settingsSchema.parse(req.body);
  const tenantId = businessId(req);
  const settings = await saveBackupSettings({ businessId: tenantId, ...input });
  await recordAuditEvent({
    action: "backup.settings.updated",
    entityType: "BackupSettings",
    entityId: settings.id,
    businessId: tenantId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      enabled: settings.enabled,
      frequency: settings.frequency,
      retentionCount: settings.retentionCount,
      destinationConnectionId: settings.destinationConnectionId,
    },
  });
  res.status(200).json({ settings });
}


export async function verifyCloudConnectionController(req: Request, res: Response) {
  const tenantId = businessId(req);
  let connection;
  try {
    connection = await verifyBackupCloudConnection(tenantId, req.params.id!);
  } catch (error) {
    await recordAuditEvent({
      action: "backup.cloud_connection.verification_failed",
      entityType: "BackupCloudConnection",
      entityId: req.params.id!,
      businessId: tenantId,
      actorUserId: req.user!.id,
      correlationId: req.correlationId ?? null,
      metadata: { outcome: "failed" },
    });
    throw error;
  }

  await recordAuditEvent({
    action: "backup.cloud_connection.verified",
    entityType: "BackupCloudConnection",
    entityId: connection.id,
    businessId: tenantId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: { provider: connection.provider, status: connection.status },
  });
  res.status(200).json({ connection });
}

export async function createCloudBackupRunController(req: Request, res: Response) {
  const tenantId = businessId(req);
  const connectionId = z.object({ connectionId: z.string().uuid() }).parse(req.body).connectionId;
  let run;
  try {
    run = await createCloudBackupRun(tenantId, connectionId);
  } catch (error) {
    await recordAuditEvent({
      action: "backup.cloud_run.attempt_failed",
      entityType: "BackupCloudConnection",
      entityId: connectionId,
      businessId: tenantId,
      actorUserId: req.user!.id,
      correlationId: req.correlationId ?? null,
      metadata: { outcome: "failed" },
    });
    throw error;
  }

  await recordAuditEvent({
    action: "backup.cloud_run.completed",
    entityType: "BackupRun",
    entityId: run.id,
    businessId: tenantId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: { status: run.status, checksumSha256: run.checksumSha256, sizeBytes: run.sizeBytes },
  });
  res.status(201).json({ run });
}

export async function listCloudBackupRunsController(req: Request, res: Response) {
  res.status(200).json({ runs: await listCloudBackupRuns(businessId(req)) });
}
