import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID, createHash, randomBytes, scryptSync, createCipheriv } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { prisma } from "../../src/lib/prisma.js";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config/index.js";
import { issueSensitiveAuthorization } from "../../src/modules/auth/sensitive-authorization.service.js";
import { decryptBackupData } from "../../src/modules/migrations/backup-crypto.service.js";

const app = createApp();
const businessId = randomUUID();
const branchId = randomUUID();
const userId = randomUUID();
const sessionId = randomUUID();
const staffUserId = randomUUID();
const staffSessionId = randomUUID();
const otherBusinessId = randomUUID();
const otherUserId = randomUUID();
const otherSessionId = randomUUID();
const serviceId = randomUUID();
const cloudConnectionId = randomUUID();
let customerId = "";
let accessToken = "";
let staffToken = "";
let otherBusinessToken = "";
let businessName = "";
let phoneUserId = "";
const createdOrderKey = randomUUID();
const rollbackOrderKey = randomUUID();

function createLegacyBackupFixture(labkBackup: Buffer, password: string): Buffer {
  const compressedPayload = decryptBackupData(labkBackup, { businessId, purpose: "artifact" });
  const legacyCompressed = gzipSync(gunzipSync(compressedPayload), { level: 9 });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(legacyCompressed), cipher.final()]);
  return Buffer.concat([
    Buffer.from("LAUNDRYBK", "ascii"),
    Buffer.from([2]),
    salt,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

beforeAll(async () => {
  Reflect.set(config.backups, "encryptionKey", "ab".repeat(32));
  businessName = `Database Order Test ${businessId.slice(0, 8)}`;
  await prisma.business.create({
    data: { id: businessId, name: businessName, slug: `db-order-${businessId}` },
  });
  await prisma.branch.create({ data: { id: branchId, businessId, name: "Test Main Branch" } });
  await prisma.user.create({
    data: {
      id: userId,
      businessId,
      email: `${userId}@example.test`,
      fullName: "Isolated Order Test User",
      passwordHash: "not-used-by-this-test",
      role: "Owner",
      securityRole: "BUSINESS_OWNER",
    },
  });
  await prisma.userBranch.create({ data: { userId, branchId } });
  await prisma.subscription.create({
    data: {
      businessId,
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
    },
  });
  await prisma.refreshToken.create({
    data: {
      userId,
      sessionId,
      tokenHash: createHash("sha256").update(sessionId).digest("hex"),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await prisma.user.create({
    data: {
      id: staffUserId,
      businessId,
      email: `${staffUserId}@example.test`,
      fullName: "View Only Backup Test User",
      passwordHash: "not-used-by-this-test",
      role: "Staff",
      securityRole: "STAFF",
    },
  });
  await prisma.refreshToken.create({
    data: {
      userId: staffUserId,
      sessionId: staffSessionId,
      tokenHash: createHash("sha256").update(staffSessionId).digest("hex"),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const viewPermission = await prisma.permission.upsert({
    where: { code: "backups.connections.view" },
    create: { code: "backups.connections.view", module: "backups", action: "connections_view" },
    update: {},
  });
  for (const code of ["backups.run", "backups.restore_password.view"]) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, module: "backups", action: code.split(".").at(-1)! },
      update: {},
    });
  }
  await prisma.userPermissionOverride.create({
    data: { businessId, userId: staffUserId, permissionId: viewPermission.id, allowed: true },
  });
  await prisma.backupCloudConnection.create({
    data: {
      id: cloudConnectionId,
      businessId,
      provider: "GOOGLE_DRIVE",
      displayName: "Test Drive Destination",
      credentialsCiphertext: "test-only-ciphertext",
      status: "CONNECTED",
      verifiedAt: new Date(),
    },
  });
  await prisma.business.create({
    data: { id: otherBusinessId, name: "Other Isolated Business", slug: `db-order-other-${otherBusinessId}` },
  });
  await prisma.user.create({
    data: {
      id: otherUserId,
      businessId: otherBusinessId,
      email: `${otherUserId}@example.test`,
      fullName: "Other Business Owner",
      passwordHash: "not-used-by-this-test",
      role: "Owner",
      securityRole: "BUSINESS_OWNER",
    },
  });
  await prisma.refreshToken.create({
    data: {
      userId: otherUserId,
      sessionId: otherSessionId,
      tokenHash: createHash("sha256").update(otherSessionId).digest("hex"),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await prisma.service.create({
    data: { id: serviceId, businessId, ownerBranchId: branchId, name: "Complete Agbada", pieces: 3, unitPrice: 4500 },
  });
  accessToken = jwt.sign({
    sub: userId,
    sid: sessionId,
    email: `${userId}@example.test`,
    securityRole: "BUSINESS_OWNER",
    businessId,
  }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: "15m" });
  staffToken = jwt.sign({ sub: staffUserId, sid: staffSessionId, email: `${staffUserId}@example.test`, securityRole: "STAFF", businessId }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: "15m" });
  otherBusinessToken = jwt.sign({ sub: otherUserId, sid: otherSessionId, email: `${otherUserId}@example.test`, securityRole: "BUSINESS_OWNER", businessId: otherBusinessId }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: "15m" });

  const customerResponse = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${accessToken}`)
    .set("X-Branch-Id", branchId)
    .send({ name: "email and whatsapp test", phone: "08088761675", email: `${userId}@customer.example.test` });
  expect(customerResponse.status, JSON.stringify(customerResponse.body)).toBe(201);
  customerId = customerResponse.body.id;
});

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { businessId } });
  await prisma.order.deleteMany({ where: { businessId } });
  await prisma.orderNumberSequence.deleteMany({ where: { businessId } });
  await prisma.auditLog.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.service.deleteMany({ where: { businessId } });
  await prisma.userBranch.deleteMany({ where: { userId: { in: [userId, staffUserId, phoneUserId] } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [userId, staffUserId, otherUserId] } } });
  await prisma.subscription.deleteMany({ where: { businessId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, staffUserId, otherUserId, phoneUserId] } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.business.deleteMany({ where: { id: otherBusinessId } });
});

describe("real database order creation integration", () => {
  it("creates customer and order, snapshots garments and invoice totals, and safely replays a duplicate request", async () => {
    const payload = {
      customerId,
      items: [{ serviceId, quantity: 2, colors: ["Navy"] }],
      garmentNote: "Handle carefully",
      internalNote: "Keep separate",
    };
    const first = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Branch-Id", branchId)
      .set("Idempotency-Key", createdOrderKey)
      .send(payload);

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ businessId, branchId, customerId, orderTotal: 9000 });
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      serviceName: "Complete Agbada", piecesPerUnit: 3, quantity: 2, totalPieces: 6, unitPrice: 4500, lineTotal: 9000,
    });

    const invoice = await prisma.invoice.findUnique({ where: { orderId: first.body.id }, include: { items: true } });
    const garments = await prisma.garment.findMany({ where: { orderId: first.body.id } });
    expect(invoice).toMatchObject({ businessId, branchId, customerName: "email and whatsapp test", companyName: businessName, subtotal: 9000, totalAmount: 9000 });
    expect(invoice?.items).toHaveLength(1);
    expect(garments).toHaveLength(6);

    const duplicate = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Branch-Id", branchId)
      .set("Idempotency-Key", createdOrderKey)
      .send(payload);
    expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(200);
    expect(duplicate.body.id).toBe(first.body.id);
    expect(await prisma.order.count({ where: { businessId } })).toBe(1);
    expect(await prisma.invoice.count({ where: { businessId } })).toBe(1);
  });

  it("rolls back order, item, garments, invoice and sequence changes after invoice setup fails", async () => {
    const before = await prisma.order.count({ where: { businessId } });
    await prisma.business.update({ where: { id: businessId }, data: { defaultCustomerAgreement: "" } });
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Branch-Id", branchId)
      .set("Idempotency-Key", rollbackOrderKey)
      .send({ customerId, items: [{ serviceId, quantity: 1 }] });
    await prisma.business.update({ where: { id: businessId }, data: { defaultCustomerAgreement: "Customer agrees to the laundry service terms and conditions." } });

    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(response.body.error?.message).toMatch(/agreement/i);
    expect(await prisma.order.count({ where: { businessId } })).toBe(before);
    expect(await prisma.invoice.count({ where: { businessId } })).toBe(1);
    expect(await prisma.garment.count({ where: { businessId } })).toBe(6);
    expect((await prisma.orderNumberSequence.findUnique({ where: { businessId } }))?.nextNumber).toBe(2);
  });

  it("returns a useful not-found response without saving partial order records", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Branch-Id", branchId)
      .set("Idempotency-Key", randomUUID())
      .send({ customerId: randomUUID(), items: [{ serviceId, quantity: 1 }] });

    expect(response.status).toBe(404);
    expect(response.body.error?.message).toBe("Customer not found");
    expect(await prisma.order.count({ where: { businessId } })).toBe(1);
  });

  it("persists optional user phone values on create, update and clear", async () => {
    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        fullName: "Phone Workflow User",
        email: `${randomUUID()}@example.test`,
        password: "Synthetic Test Password 2026!",
        role: "Staff",
        branchIds: [branchId],
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    phoneUserId = created.body.id;
    expect(created.body.phone).toBeNull();

    const withPhone = await request(app)
      .patch(`/api/v1/users/${phoneUserId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ phone: "+1 (202) 555-0101" });
    expect(withPhone.status, JSON.stringify(withPhone.body)).toBe(200);
    expect(withPhone.body.phone).toBe("+12025550101");
    expect((await prisma.user.findUnique({ where: { id: phoneUserId } }))?.phone).toBe("+12025550101");

    const cleared = await request(app)
      .patch(`/api/v1/users/${phoneUserId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ phone: "" });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect(cleared.body.phone).toBeNull();
    expect((await prisma.user.findUnique({ where: { id: phoneUserId } }))?.phone).toBeNull();

    const listed = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.find((user: { id: string }) => user.id === phoneUserId)?.phone).toBeNull();
  });

  it("enforces database-backed backup permissions and tenant isolation", async () => {
    const visibleConnections = await request(app)
      .get("/api/v1/migrations/backup/cloud/connections")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(visibleConnections.status, JSON.stringify(visibleConnections.body)).toBe(200);
    expect(visibleConnections.body.connections).toHaveLength(1);
    expect(visibleConnections.body.connections[0].id).toBe(cloudConnectionId);

    const deniedRun = await request(app)
      .post("/api/v1/migrations/backup/cloud/runs")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({ connectionId: cloudConnectionId, idempotencyKey: randomUUID() });
    expect(deniedRun.status).toBe(403);

    const deniedPassword = await request(app)
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(deniedPassword.status).toBe(403);
    expect(JSON.stringify(deniedPassword.body)).not.toContain("restore password");

    const otherBusinessConnections = await request(app)
      .get("/api/v1/migrations/backup/cloud/connections")
      .set("Authorization", `Bearer ${otherBusinessToken}`);
    expect(otherBusinessConnections.status).toBe(200);
    expect(otherBusinessConnections.body.connections).toEqual([]);

    const sensitive = await issueSensitiveAuthorization({ userId: otherUserId, businessId: otherBusinessId });
    const crossTenantRun = await request(app)
      .post("/api/v1/migrations/backup/cloud/runs")
      .set("Authorization", `Bearer ${otherBusinessToken}`)
      .set("X-Sensitive-Authorization", sensitive.token)
      .send({ connectionId: cloudConnectionId, idempotencyKey: randomUUID() });
    expect(crossTenantRun.status).toBe(404);
  });

  it("restores an actual legacy backup after the business restore password changes", async () => {
    const initialRestorePassword = "Initial Restore Password 2026";
    const changedRestorePassword = "Changed Restore Password 2026";
    const legacyCreatorPassword = "Original Legacy Backup Password";

    const setInitial = await request(app)
      .put("/api/v1/migrations/backup/restore-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: initialRestorePassword });
    expect(setInitial.status, JSON.stringify(setInitial.body)).toBe(200);

    const readPassword = await request(app)
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(readPassword.status).toBe(200);
    expect(readPassword.body.password).toBe(initialRestorePassword);
    let storedBusiness = await prisma.business.findUnique({ where: { id: businessId } });
    expect(storedBusiness?.backupRestorePasswordCiphertext).not.toContain(initialRestorePassword);

    const otherPassword = await request(app)
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", `Bearer ${otherBusinessToken}`);
    expect(otherPassword.status).toBe(200);
    expect(otherPassword.body.password).not.toBe(initialRestorePassword);

    const labkBackup = await (await import("../../src/modules/migrations/backup.service.js"))
      .exportBusinessBackup(businessId, userId);
    const legacyBackup = createLegacyBackupFixture(labkBackup, legacyCreatorPassword);
    await prisma.business.update({ where: { id: businessId }, data: { name: "Mutated Before Restore" } });

    const setChanged = await request(app)
      .put("/api/v1/migrations/backup/restore-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: changedRestorePassword });
    expect(setChanged.status).toBe(200);
    storedBusiness = await prisma.business.findUnique({ where: { id: businessId } });
    const changedCiphertext = storedBusiness?.backupRestorePasswordCiphertext;

    const rejectedOldPassword = await request(app)
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "application/octet-stream")
      .set("X-Organization-Restore-Password", initialRestorePassword)
      .set("X-Backup-Password", legacyCreatorPassword)
      .set("X-Restore-Reason", "Verify that password rotation is enforced")
      .send(legacyBackup);
    expect(rejectedOldPassword.status).toBe(403);
    expect(JSON.stringify(rejectedOldPassword.body)).not.toContain(initialRestorePassword);
    expect((await prisma.business.findUnique({ where: { id: businessId } }))?.name).toBe("Mutated Before Restore");

    const restored = await request(app)
      .post("/api/v1/migrations/backup/restore")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "application/octet-stream")
      .set("X-Organization-Restore-Password", changedRestorePassword)
      .set("X-Backup-Password", legacyCreatorPassword)
      .set("X-Restore-Reason", "Restore actual encrypted legacy fixture")
      .send(legacyBackup);
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await prisma.business.findUnique({ where: { id: businessId } }))?.name).toBe(businessName);
    expect(await prisma.order.count({ where: { businessId } })).toBe(1);
    const ciphertextAfterRestore = (await prisma.business.findUnique({
      where: { id: businessId }, select: { backupRestorePasswordCiphertext: true },
    }))?.backupRestorePasswordCiphertext;
    expect(ciphertextAfterRestore).toBe(changedCiphertext);

    const readChanged = await request(app)
      .get("/api/v1/migrations/backup/restore-password")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(readChanged.body.password).toBe(changedRestorePassword);
    const auditEvents = await prisma.auditLog.findMany({ where: { businessId } });
    expect(JSON.stringify(auditEvents)).not.toContain(initialRestorePassword);
    expect(JSON.stringify(auditEvents)).not.toContain(changedRestorePassword);
    expect(JSON.stringify(auditEvents)).not.toContain(legacyCreatorPassword);
  });
});
