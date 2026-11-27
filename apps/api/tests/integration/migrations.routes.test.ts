import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { migrationsRouter } from "../../src/modules/migrations/migrations.routes.js";
import { AppError, errorHandler } from "../../src/middleware/error-handler.js";

const {
  verifyAccessToken,
  findUser,
  findPermission,
  findUserOverride,
  findRoleOverride,
  hasPermission,
  analyzeMigrationSource,
  getMigrationJob,
  importMigrationJob,
  exportBusinessBackup,
  restoreBusinessBackup,
  getBusinessRestorePassword,
  changeBusinessRestorePassword,
  verifyBusinessRestorePassword,
  recordAuditEvent,
  listCloudConnectionsController,
  createCloudConnectionController,
  deleteCloudConnectionController,
  getCloudBackupSettingsController,
  saveCloudBackupSettingsController,
  verifyCloudConnectionController,
  createCloudBackupRunController,
  listCloudBackupRunsController,
  startCloudOAuthController,
  listCloudBackupSchedulesController,
  createCloudBackupScheduleController,
  updateCloudBackupScheduleController,
  deleteCloudBackupScheduleController,
} = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  findUser: vi.fn(),
  findPermission: vi.fn(),
  findUserOverride: vi.fn(),
  findRoleOverride: vi.fn(),
  hasPermission: vi.fn(),
  analyzeMigrationSource: vi.fn(),
  getMigrationJob: vi.fn(),
  importMigrationJob: vi.fn(),
  exportBusinessBackup: vi.fn(),
  restoreBusinessBackup: vi.fn(),
  getBusinessRestorePassword: vi.fn().mockResolvedValue("organization-secret-123"),
  changeBusinessRestorePassword: vi.fn().mockResolvedValue(undefined),
  verifyBusinessRestorePassword: vi.fn().mockResolvedValue(undefined),
  recordAuditEvent: vi.fn(),
  listCloudConnectionsController: vi.fn((_req, res) => res.status(200).json([])),
  createCloudConnectionController: vi.fn((_req, res) => res.status(201).json({ id: "connection-1" })),
  deleteCloudConnectionController: vi.fn((_req, res) => res.status(204).end()),
  getCloudBackupSettingsController: vi.fn((_req, res) => res.status(200).json({})),
  saveCloudBackupSettingsController: vi.fn((_req, res) => res.status(200).json({})),
  verifyCloudConnectionController: vi.fn((_req, res) => res.status(200).json({})),
  createCloudBackupRunController: vi.fn((_req, res) => res.status(201).json({ id: "run-1" })),
  listCloudBackupRunsController: vi.fn((_req, res) => res.status(200).json([])),
  startCloudOAuthController: vi.fn((_req, res) => res.status(200).json({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth" })),
  listCloudBackupSchedulesController: vi.fn((_req, res) => res.status(200).json([])),
  createCloudBackupScheduleController: vi.fn((_req, res) => res.status(201).json({ id: "schedule-1" })),
  updateCloudBackupScheduleController: vi.fn((_req, res) => res.status(200).json({ id: "schedule-1" })),
  deleteCloudBackupScheduleController: vi.fn((_req, res) => res.status(204).end()),
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/lib/auth.js", () => ({
  verifyAccessToken,
}));

vi.mock("../../src/modules/auth/auth.middleware.js", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const auth = verifyAccessToken("test-token");

    req.user = {
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      securityRole: auth.role,
      businessId: auth.businessId,
    };

    next();
  },
  requireBusinessContext: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
  requirePlatformBusinessContext: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireSensitiveAuthorization: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

vi.mock("../../src/middleware/permissions.js", () => ({
  requirePermission: (permissionCode: string) => (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!req.user) {
      next(new AppError("Authentication required", 401));
      return;
    }

    void hasPermission(
      req.user.id,
      req.user.businessId,
      req.user.role,
      permissionCode,
    )
      .then((allowed: boolean) => {
        if (!allowed) {
          next(new AppError("Insufficient permissions for this action", 403));
          return;
        }

        next();
      })
      .catch(next);
  },
  requireAnyPermission: (permissionCodes: string[]) => (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!req.user) { next(new AppError("Authentication required", 401)); return; }
    void Promise.all(permissionCodes.map((code) => hasPermission(req.user!.id, req.user!.businessId, req.user!.role, code)))
      .then((allowed: boolean[]) => allowed.some(Boolean) ? next() : next(new AppError("Insufficient permissions for this action", 403)))
      .catch(next);
  },
}));

vi.mock("../../src/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: findUser,
    },
    permission: {
      findUnique: findPermission,
    },
    userPermissionOverride: {
      findUnique: findUserOverride,
    },
    businessRolePermission: {
      findUnique: findRoleOverride,
    },
  },
}));

vi.mock("../../src/modules/migrations/migration.service.js", () => ({
  analyzeMigrationSource,
  getMigrationJob,
  importMigrationJob,
}));

vi.mock("../../src/modules/migrations/backup.service.js", () => ({
  exportBusinessBackup,
  restoreBusinessBackup,
}));

vi.mock("../../src/modules/migrations/backup-cloud.controller.js", () => ({
  listCloudConnectionsController,
  createCloudConnectionController,
  deleteCloudConnectionController,
  getCloudBackupSettingsController,
  saveCloudBackupSettingsController,
  verifyCloudConnectionController,
  createCloudBackupRunController,
  listCloudBackupRunsController,
  startCloudOAuthController,
  listCloudBackupSchedulesController,
  createCloudBackupScheduleController,
  updateCloudBackupScheduleController,
  deleteCloudBackupScheduleController,
}));

vi.mock("../../src/modules/migrations/backup-restore-password.service.js", () => ({
  getBusinessRestorePassword,
  changeBusinessRestorePassword,
  verifyBusinessRestorePassword,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent,
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    migrations: {
      minUploadBytes: 1,
      maxUploadBytes: 1024 * 1024,
    },
  },
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/migrations", migrationsRouter);
  app.use(errorHandler);
  return app;
}

function authAs(role: "BUSINESS_OWNER" | "BRANCH_MANAGER" | "STAFF") {
  verifyAccessToken.mockReturnValue({
    userId: "user-1",
    email: `${role.toLowerCase()}@example.com`,
    role,
    businessId: "business-1",
  });

  findUser.mockResolvedValue({
    id: "user-1",
    email: `${role.toLowerCase()}@example.com`,
    fullName: "Test User",
    role,
    businessId: "business-1",
    isActive: true,
  });
}

describe("Migrations routes - permission enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hasPermission.mockResolvedValue(true);

    findPermission.mockImplementation(async ({ where }: { where: { code: string } }) => ({
      id: `permission-${where.code}`,
    }));

    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    analyzeMigrationSource.mockResolvedValue({
      job: {
        id: "job-1",
        sourceType: "backup",
      },
      summary: {
        files: 1,
        records: 1,
        supported: {
          customers: 1,
        },
      },
    });

    getMigrationJob.mockResolvedValue({
      id: "job-1",
      status: "ANALYZED",
    });

    importMigrationJob.mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
    });

    exportBusinessBackup.mockResolvedValue(Buffer.from("backup"));

    restoreBusinessBackup.mockResolvedValue({
      createdCustomers: 1,
      updatedCustomers: 0,
      skippedUsers: 0,
    });

    recordAuditEvent.mockResolvedValue(undefined);
  });

  it("denies migration analysis when migrations.view is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(false);
    findUserOverride.mockResolvedValue({ allowed: false });

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/analyze")
      .set("Authorization", "Bearer test-token")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("backup"));

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe("Insufficient permissions for this action");
    expect(analyzeMigrationSource).not.toHaveBeenCalled();
  });

  it("rejects an empty migration upload before analysis", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(true);

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/analyze")
      .set("Authorization", "Bearer test-token")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.alloc(0));

    expect(response.status).toBe(422);
    expect(response.body.error?.message ?? response.body.message).toMatch(/empty/i);
    expect(analyzeMigrationSource).not.toHaveBeenCalled();
  });

  it("rejects a migration upload above the configured maximum", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(true);

    const oversized = Buffer.alloc(1024 * 1024 + 1);

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/analyze")
      .set("Authorization", "Bearer test-token")
      .set("Content-Type", "application/octet-stream")
      .send(oversized);

    expect(response.status).toBe(413);
    expect(response.body.error?.message ?? response.body.message).toMatch(/too large|250 MiB/i);
    expect(analyzeMigrationSource).not.toHaveBeenCalled();
  });

  it("rejects an empty encrypted backup restore before restore processing", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(true);

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Backup-Password", "secure-backup-password")
      .set("X-Restore-Reason", "Testing empty backup rejection")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.alloc(0));

    expect(response.status).toBe(422);
    expect(response.body.error?.message ?? response.body.message).toMatch(/empty/i);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });

  it("rejects an encrypted backup restore above the configured maximum", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(true);

    const oversized = Buffer.alloc(1024 * 1024 + 1);

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Backup-Password", "secure-backup-password")
      .set("X-Restore-Reason", "Testing oversized backup rejection")
      .set("Content-Type", "application/octet-stream")
      .send(oversized);

    expect(response.status).toBe(413);
    expect(response.body.error?.message ?? response.body.message).toMatch(/too large|250 MiB/i);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });

  it("denies migration job lookup when migrations.view is explicitly denied", async () => {
    authAs("BRANCH_MANAGER");
    hasPermission.mockResolvedValue(false);
    findUserOverride.mockResolvedValue({ allowed: false });

    const response = await request(createApp())
      .get("/api/v1/migrations/jobs/job-1")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(403);
    expect(getMigrationJob).not.toHaveBeenCalled();
  });

  it("denies migration import when migrations.manage is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockImplementation(
      async (
        _userId: string,
        _businessId: string,
        _role: string,
        permissionCode: string,
      ) => permissionCode !== "migrations.manage",
    );
    findUserOverride.mockResolvedValue({ allowed: false });

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/job-1/import")
      .set("Authorization", "Bearer test-token")
      .send({
        duplicatePolicy: "skip",
        confirm: true,
      });

    expect(response.status).toBe(403);
    expect(importMigrationJob).not.toHaveBeenCalled();
  });

  it("allows migration import when migrations.manage is granted", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockImplementation(
      async (
        _userId: string,
        _businessId: string,
        _role: string,
        permissionCode: string,
      ) => permissionCode === "migrations.manage",
    );
    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    importMigrationJob.mockResolvedValue({
      imported: {
        customersCreated: 1,
        customersMerged: 0,
        customersSkipped: 0,
        invalidRows: 0,
      },
      duplicatePolicy: "skip",
    });

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/job-1/import")
      .set("Authorization", "Bearer test-token")
      .send({
        duplicatePolicy: "skip",
        confirm: true,
      });

    expect(response.status).toBe(200);
    expect(importMigrationJob).toHaveBeenCalledOnce();
  });

  it("denies backup export when migrations.view is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(false);
    findUserOverride.mockResolvedValue({ allowed: false });

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/export")
      .set("Authorization", "Bearer test-token")
      .send({
        password: "secure-backup-password",
      });

    expect(response.status).toBe(403);
    expect(exportBusinessBackup).not.toHaveBeenCalled();
  });

  it("denies backup restore when migrations.manage is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(false);
    findUserOverride.mockResolvedValue({ allowed: false });

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Backup-Password", "secure-backup-password")
      .send(Buffer.from("backup"));

    expect(response.status).toBe(403);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });
});

describe("Migrations routes - existing role boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hasPermission.mockResolvedValue(true);

    findPermission.mockImplementation(async ({ where }: { where: { code: string } }) => ({
      id: `permission-${where.code}`,
    }));

    findUserOverride.mockResolvedValue(null);
    findRoleOverride.mockResolvedValue(null);

    analyzeMigrationSource.mockResolvedValue({
      job: { id: "job-1", sourceType: "backup" },
      summary: {
        files: 1,
        records: 1,
        supported: { customers: 1 },
      },
    });

    exportBusinessBackup.mockResolvedValue(Buffer.from("backup"));
    restoreBusinessBackup.mockResolvedValue({
      createdCustomers: 1,
      updatedCustomers: 0,
      skippedUsers: 0,
    });
    recordAuditEvent.mockResolvedValue(undefined);
  });

  it("allows a branch manager with default migrations.view permission to analyze", async () => {
    authAs("BRANCH_MANAGER");

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/analyze")
      .set("Authorization", "Bearer test-token")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("backup"));

    expect(response.status).toBe(201);
    expect(analyzeMigrationSource).toHaveBeenCalledOnce();
  });

  it("allows a user with migrations.view permission to export without a password", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/export")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(exportBusinessBackup).toHaveBeenCalledOnce();
    expect(exportBusinessBackup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it("does not allow STAFF to access migration analysis", async () => {
    authAs("STAFF");

    const response = await request(createApp())
      .post("/api/v1/migrations/jobs/analyze")
      .set("Authorization", "Bearer test-token")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("backup"));

    expect(response.status).toBe(403);
    expect(analyzeMigrationSource).not.toHaveBeenCalled();
  });

  it("allows a branch manager with backups.connections.view to list cloud backup connections", async () => {
    authAs("BRANCH_MANAGER");
    hasPermission.mockImplementation(async (_user, _business, _role, code) => code === "backups.connections.view");

    const response = await request(createApp())
      .get("/api/v1/migrations/backup/cloud/connections")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(listCloudConnectionsController).toHaveBeenCalled();
  });

  it("denies cloud connection creation when backups.connections.manage is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockImplementation(async (
      _userId: string,
      _businessId: string,
      _role: string,
      permissionCode: string,
    ) => permissionCode !== "backups.connections.manage");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/cloud/connections")
      .set("Authorization", "Bearer test-token")
      .send({
        provider: "S3_COMPATIBLE",
        displayName: "Test backup",
        endpoint: "https://storage.example.com",
        bucket: "backups",
        region: "us-east-1",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      });

    expect(response.status).toBe(403);
    expect(createCloudConnectionController).not.toHaveBeenCalled();
  });

  it("allows a branch manager with backups.schedules.view to list cloud backup schedules", async () => {
    authAs("BRANCH_MANAGER");
    hasPermission.mockImplementation(async (_user, _business, _role, code) => code === "backups.schedules.view");

    const response = await request(createApp())
      .get("/api/v1/migrations/backup/cloud/schedules")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(listCloudBackupSchedulesController).toHaveBeenCalled();
  });

  it("denies schedule creation when backups.schedules.manage is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockImplementation(async (
      _userId: string,
      _businessId: string,
      _role: string,
      permissionCode: string,
    ) => permissionCode !== "backups.schedules.manage");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/cloud/schedules")
      .set("Authorization", "Bearer test-token")
      .send({
        name: "Daily backup",
        enabled: false,
        frequency: "DAILY",
        dayOfWeek: 1,
        dayOfMonth: 1,
        hour: 2,
        minute: 0,
        clockFormat: "12H",
        timezone: "Africa/Lagos",
        retentionCount: 30,
        destinationConnectionId: null,
      });

    expect(response.status).toBe(403);
    expect(createCloudBackupScheduleController).not.toHaveBeenCalled();
  });

  it("denies a view-only user from running a cloud backup", async () => {
    authAs("BRANCH_MANAGER");
    hasPermission.mockImplementation(async (_user, _business, _role, code) => code === "backups.history.view");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/cloud/runs")
      .set("Authorization", "Bearer test-token")
      .send({ connectionId: "connection-1" });

    expect(response.status).toBe(403);
    expect(createCloudBackupRunController).not.toHaveBeenCalled();
  });

  it("rejects backup restore when the restore reason is missing", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("LABK1mock-backup"));

    expect(response.status).toBe(422);
    expect(response.body.error?.message ?? response.body.message).toMatch(/restore reason is required/i);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });

  it("rejects backup restore when the restore reason is shorter than 10 characters", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Restore-Reason", "Too short")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("LABK1mock-backup"));

    expect(response.status).toBe(422);
    expect(response.body.error?.message ?? response.body.message).toMatch(/between 10 and 500/i);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });

  it("rejects backup restore when the restore reason exceeds 500 characters", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Restore-Reason", "R".repeat(501))
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("LABK1mock-backup"));

    expect(response.status).toBe(422);
    expect(response.body.error?.message ?? response.body.message).toMatch(/between 10 and 500/i);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });

  it("rejects legacy backup passwords shorter than 5 characters", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Restore-Reason", "Approved legacy backup restore")
      .set("X-Backup-Password", "1234")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("LAUNDRYBKmock-backup"));

    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });


  it("accepts a legacy backup password of exactly 5 characters", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Restore-Reason", "Approved legacy backup restore")
      .set("X-Backup-Password", "12345")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("LAUNDRYBKmock-backup"));

    expect(response.status).toBe(200);
    expect(restoreBusinessBackup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Buffer),
      "12345",
      "Approved legacy backup restore",
    );
  });


  it("allows a branch manager with migrations.manage permission to restore a LABK1 backup", async () => {
    authAs("BRANCH_MANAGER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Restore-Reason", "Approved business backup recovery")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("LABK1mock-backup"));

    expect(response.status).toBe(200);
    expect(restoreBusinessBackup).toHaveBeenCalledOnce();
    expect(restoreBusinessBackup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Buffer),
      undefined,
      "Approved business backup recovery",
    );
  });
});

describe("business restore password authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authAs("BUSINESS_OWNER");
    hasPermission.mockImplementation(async (_userId, _businessId, _role, code) =>
      code === "backups.restore_password.view" || code === "backups.restore_password.manage");
    getBusinessRestorePassword.mockResolvedValue("secret-that-must-not-be-audited");
    changeBusinessRestorePassword.mockResolvedValue(undefined);
    recordAuditEvent.mockResolvedValue(undefined);
  });

  it("does not let a business-owner role bypass restore-password permissions", async () => {
    hasPermission.mockResolvedValue(false);
    const app = createApp();

    const read = await request(app)
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", "Bearer test-token");
    const change = await request(app)
      .put("/api/v1/migrations/backup/restore-password")
      .set("Authorization", "Bearer test-token")
      .send({ password: "replacement-secret-123" });

    expect(read.status).toBe(403);
    expect(change.status).toBe(403);
    expect(getBusinessRestorePassword).not.toHaveBeenCalled();
    expect(changeBusinessRestorePassword).not.toHaveBeenCalled();
  });

  it("requires separate view and manage grants and never audits the secret", async () => {
    hasPermission.mockImplementation(async (_userId, _businessId, _role, code) => code === "backups.restore_password.view");
    const app = createApp();
    const read = await request(app)
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", "Bearer test-token");
    const deniedChange = await request(app)
      .put("/api/v1/migrations/backup/restore-password")
      .set("Authorization", "Bearer test-token")
      .send({ password: "replacement-secret-123" });

    expect(read.status).toBe(200);
    expect(read.body.password).toBe("secret-that-must-not-be-audited");
    expect(deniedChange.status).toBe(403);
    expect(JSON.stringify(recordAuditEvent.mock.calls)).not.toContain("secret-that-must-not-be-audited");

    hasPermission.mockImplementation(async (_userId, _businessId, _role, code) => code === "backups.restore_password.manage");
    const allowedChange = await request(app)
      .put("/api/v1/migrations/backup/restore-password")
      .set("Authorization", "Bearer test-token")
      .send({ password: "replacement-secret-123" });
    expect(allowedChange.status).toBe(200);
    expect(changeBusinessRestorePassword).toHaveBeenCalledWith("business-1", "replacement-secret-123");
    expect(JSON.stringify(recordAuditEvent.mock.calls)).not.toContain("replacement-secret-123");
  });

  it("passes the authenticated tenant to restore-password lookup", async () => {
    verifyAccessToken.mockReturnValue({
      userId: "user-2", email: "staff@other.example", role: "STAFF", businessId: "business-2",
    });
    hasPermission.mockImplementation(async (_userId, businessId, _role, code) =>
      businessId === "business-2" && code === "backups.restore_password.view");

    const response = await request(createApp())
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(getBusinessRestorePassword).toHaveBeenCalledWith("business-2");
  });
});
