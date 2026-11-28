import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../src/modules/permissions/permissions.catalog.js";

const migrationSql = readFileSync(
  new URL(
    "../../prisma/migrations/20261117010000_sync_complete_permission_catalogue/migration.sql",
    import.meta.url,
  ),
  "utf8",
) + readFileSync(
  new URL(
    "../../prisma/migrations/20261122110000_backup_restore_password_and_permissions/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("complete permission catalogue migration", () => {
  it("seeds every application permission with matching metadata", () => {
    for (const permission of PERMISSIONS) {
      const values = [
        permission.code,
        permission.module,
        permission.action,
        permission.description,
      ]
        .map((value) => `'${value.replaceAll("'", "''")}'`)
        .join(", ");

      expect(migrationSql).toContain(values);
    }
  });

  it("upserts by code without replacing existing permission IDs", () => {
    expect(migrationSql).toContain('ON CONFLICT ("code") DO UPDATE');
    expect(migrationSql).toContain('"module" = EXCLUDED."module"');
    expect(migrationSql).toContain('"action" = EXCLUDED."action"');
    expect(migrationSql).toContain('"description" = EXCLUDED."description"');
    expect(migrationSql).not.toMatch(/DO UPDATE[\s\S]*?"id"\s*=/);
  });
});
