import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginCloudOAuth: vi.fn(),
  completeCloudOAuth: vi.fn(),
  recordAuditEvent: vi.fn(),
  createCloudBackupRun: vi.fn(),
  listCloudBackupRuns: vi.fn(),
  verifyBackupCloudConnection: vi.fn(),
  createBackupConnection: vi.fn(),
  deleteBackupConnection: vi.fn(),
  getBackupSettings: vi.fn(),
  listBackupConnections: vi.fn(),
  saveBackupSettings: vi.fn(),
  listBackupSchedules: vi.fn(),
  createBackupSchedule: vi.fn(),
  updateBackupSchedule: vi.fn(),
  deleteBackupSchedule: vi.fn(),
}));

vi.mock("../../src/modules/migrations/backup-cloud-oauth.service.js", () => ({
  beginCloudOAuth: mocks.beginCloudOAuth,
  completeCloudOAuth: mocks.completeCloudOAuth,
}));

vi.mock("../../src/modules/migrations/backup-cloud-runs.service.js", () => ({
  createCloudBackupRun: mocks.createCloudBackupRun,
  listCloudBackupRuns: mocks.listCloudBackupRuns,
  verifyBackupCloudConnection: mocks.verifyBackupCloudConnection,
}));

vi.mock("../../src/modules/migrations/backup-cloud.service.js", () => ({
  createBackupConnection: mocks.createBackupConnection,
  deleteBackupConnection: mocks.deleteBackupConnection,
  getBackupSettings: mocks.getBackupSettings,
  listBackupConnections: mocks.listBackupConnections,
  saveBackupSettings: mocks.saveBackupSettings,
  listBackupSchedules: mocks.listBackupSchedules,
  createBackupSchedule: mocks.createBackupSchedule,
  updateBackupSchedule: mocks.updateBackupSchedule,
  deleteBackupSchedule: mocks.deleteBackupSchedule,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { startCloudOAuthController } from "../../src/modules/migrations/backup-cloud.controller.js";

describe("business cloud backup OAuth controller", () => {
  it("rejects OneDrive start requests directly before business lookup or OAuth service invocation", async () => {
    const req = {
      body: { provider: "ONEDRIVE", displayName: "Restricted OneDrive" },
    } as never;

    await expect(startCloudOAuthController(req, {} as never)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("restricted to Platform Admin"),
    });

    expect(mocks.beginCloudOAuth).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects OAuth initiation for a business-scoped user without calling the OAuth service", async () => {
    const req = {
      body: { provider: "ONEDRIVE", displayName: "Restricted OneDrive" },
      user: { businessId: "business-1", id: "user-1" },
    } as never;

    await expect(startCloudOAuthController(req, {} as never)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("restricted to Platform Admin"),
    });

    expect(mocks.beginCloudOAuth).not.toHaveBeenCalled();
  });
});
