import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { migrationsRouter } from "../../src/modules/migrations/migrations.routes.js";
import { AppError } from "../../src/middleware/error-handler.js";

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
  recordAuditEvent,
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
  recordAuditEvent: vi.fn(),
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
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
        return;
      }
      res.status(500).json({ message: "Internal server error" });
    },
  );
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
    expect(response.body.message).toBe("Insufficient permissions for this action");
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
      .set("X-Backup-Reason", "Testing empty backup rejection")
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
      .set("X-Backup-Reason", "Testing oversized backup rejection")
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

  it("denies migration import when migrations.view is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(false);
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

  it("denies backup export when migrations.view is explicitly denied", async () => {
    authAs("BUSINESS_OWNER");
    hasPermission.mockResolvedValue(false);
    findUserOverride.mockResolvedValue({ allowed: false });

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/export")
      .set("Authorization", "Bearer test-token")
      .send({
        password: "secure-backup-password",
        reason: "Creating a backup for authorized business data protection",
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
      .set("X-Backup-Reason", "Restoring authorized business data after verification")
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

  it("allows a business owner with default migrations.view permission to export", async () => {
    authAs("BUSINESS_OWNER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/export")
      .set("Authorization", "Bearer test-token")
      .send({
        password: "secure-backup-password",
        reason: "Creating a backup for authorized business data protection",
      });

    expect(response.status).toBe(200);
    expect(exportBusinessBackup).toHaveBeenCalledOnce();
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

  it("does not allow a branch manager to restore a backup", async () => {
    authAs("BRANCH_MANAGER");

    const response = await request(createApp())
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", "Bearer test-token")
      .set("X-Backup-Password", "secure-backup-password")
      .set("X-Backup-Reason", "Restoring authorized business data after verification")
      .send(Buffer.from("backup"));

    expect(response.status).toBe(403);
    expect(restoreBusinessBackup).not.toHaveBeenCalled();
  });
});
