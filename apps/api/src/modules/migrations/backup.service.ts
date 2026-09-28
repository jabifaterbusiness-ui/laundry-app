import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { requireReason } from "../../lib/reason.js";

const MAGIC = Buffer.from("LAUNDRYBK");
const VERSION = 2;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

type JsonRecord = Record<string, unknown>;

interface BackupPayload {
  format: "laundry-business-backup";
  version: 2;
  exportedAt: string;
  business: JsonRecord;
  branches: JsonRecord[];
  users: JsonRecord[];
  userBranches: JsonRecord[];
  customers: JsonRecord[];
  customerStatusHistory: JsonRecord[];
  services: JsonRecord[];
  colors: JsonRecord[];
  orderNumberSequence: JsonRecord | null;
  orders: JsonRecord[];
  orderItems: JsonRecord[];
  garments: JsonRecord[];
  invoices: JsonRecord[];
  invoiceItems: JsonRecord[];
  invoiceHistory: JsonRecord[];
  payments: JsonRecord[];
  inventoryItems: JsonRecord[];
  inventoryStock: JsonRecord[];
  inventoryMovements: JsonRecord[];
  expenses: JsonRecord[];
  employeeCompensation: JsonRecord[];
  payrollPeriods: JsonRecord[];
  payrollRecords: JsonRecord[];
  payrollDeductions: JsonRecord[];
  payrollPayments: JsonRecord[];
  ious: JsonRecord[];
  loans: JsonRecord[];
  financialRepayments: JsonRecord[];
  businessRolePermissions: JsonRecord[];
  userPermissionOverrides: JsonRecord[];
  financialStatementConfig: JsonRecord | null;
  financialStatementRecipients: JsonRecord[];
  financialStatements: JsonRecord[];
  financialStatementDeliveries: JsonRecord[];
}

interface BackupCounts {
  business: number;
  branches: number;
  users: number;
  userBranches: number;
  customers: number;
  customerStatusHistory: number;
  services: number;
  colors: number;
  orderNumberSequence: number;
  orders: number;
  orderItems: number;
  garments: number;
  invoices: number;
  invoiceItems: number;
  invoiceHistory: number;
  payments: number;
  inventoryItems: number;
  inventoryStock: number;
  inventoryMovements: number;
  expenses: number;
  employeeCompensation: number;
  payrollPeriods: number;
  payrollRecords: number;
  payrollDeductions: number;
  payrollPayments: number;
  ious: number;
  loans: number;
  financialRepayments: number;
  businessRolePermissions: number;
  userPermissionOverrides: number;
  financialStatementConfig: number;
  financialStatementRecipients: number;
  financialStatements: number;
  financialStatementDeliveries: number;
}

interface RestoreCounts extends BackupCounts {
  created: number;
  updated: number;
  mapped: number;
  skippedUsers: number;
}

interface Delegate {
  findUnique(args: unknown): Promise<JsonRecord | null>;
  findFirst(args: unknown): Promise<JsonRecord | null>;
  findMany(args: unknown): Promise<JsonRecord[]>;
  create(args: unknown): Promise<JsonRecord>;
  update(args: unknown): Promise<JsonRecord>;
  upsert(args: unknown): Promise<JsonRecord>;
}

type TxClient = Record<string, Delegate>;

function delegate(tx: unknown, model: string): Delegate {
  const value = (tx as TxClient)[model];
  if (!value) throw new Error(`Backup restore model is unavailable: ${model}`);
  return value;
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

function serializeRecord(value: JsonRecord): JsonRecord {
  return serialize(value) as JsonRecord;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  if (password.length < 12) {
    throw new AppError("Backup password must be at least 12 characters", 422);
  }
  return scryptSync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

function encrypt(payload: BackupPayload, password: string): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(password, salt);
  const compressed = gzipSync(
    Buffer.from(JSON.stringify(payload), "utf8"),
    { level: 9 },
  );
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    salt,
    iv,
    tag,
    ciphertext,
  ]);
}

function decrypt(buffer: Buffer, password: string): BackupPayload {
  const headerLength =
    MAGIC.length + 1 + SALT_BYTES + IV_BYTES + TAG_BYTES;

  if (
    buffer.length <= headerLength ||
    !buffer.subarray(0, MAGIC.length).equals(MAGIC) ||
    buffer[MAGIC.length] !== VERSION
  ) {
    throw new AppError("Unsupported or invalid Laundry backup file", 422);
  }

  const saltStart = MAGIC.length + 1;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const salt = buffer.subarray(saltStart, ivStart);
  const iv = buffer.subarray(ivStart, tagStart);
  const tag = buffer.subarray(tagStart, headerLength);
  const ciphertext = buffer.subarray(headerLength);

  const key = deriveKey(password, salt);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const payload = JSON.parse(
      gunzipSync(compressed).toString("utf8"),
    ) as BackupPayload;

    if (
      payload.format !== "laundry-business-backup" ||
      payload.version !== VERSION
    ) {
      throw new Error("Unsupported backup version");
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Backup password is incorrect or the backup is corrupted",
      422,
    );
  }
}

function countsFromPayload(payload: BackupPayload): BackupCounts {
  return {
    business: 1,
    branches: payload.branches.length,
    users: payload.users.length,
    userBranches: payload.userBranches.length,
    customers: payload.customers.length,
    customerStatusHistory: payload.customerStatusHistory.length,
    services: payload.services.length,
    colors: payload.colors.length,
    orderNumberSequence: payload.orderNumberSequence ? 1 : 0,
    orders: payload.orders.length,
    orderItems: payload.orderItems.length,
    garments: payload.garments.length,
    invoices: payload.invoices.length,
    invoiceItems: payload.invoiceItems.length,
    invoiceHistory: payload.invoiceHistory.length,
    payments: payload.payments.length,
    inventoryItems: payload.inventoryItems.length,
    inventoryStock: payload.inventoryStock.length,
    inventoryMovements: payload.inventoryMovements.length,
    expenses: payload.expenses.length,
    employeeCompensation: payload.employeeCompensation.length,
    payrollPeriods: payload.payrollPeriods.length,
    payrollRecords: payload.payrollRecords.length,
    payrollDeductions: payload.payrollDeductions.length,
    payrollPayments: payload.payrollPayments.length,
    ious: payload.ious.length,
    loans: payload.loans.length,
    financialRepayments: payload.financialRepayments.length,
    businessRolePermissions: payload.businessRolePermissions.length,
    userPermissionOverrides: payload.userPermissionOverrides.length,
    financialStatementConfig: payload.financialStatementConfig ? 1 : 0,
    financialStatementRecipients: payload.financialStatementRecipients.length,
    financialStatements: payload.financialStatements.length,
    financialStatementDeliveries: payload.financialStatementDeliveries.length,
  };
}

const BUSINESS_MODELS = [
  "branch",
  "customer",
  "service",
  "color",
  "orderNumberSequence",
  "order",
  "garment",
  "invoice",
  "inventoryItem",
  "inventoryStock",
  "inventoryMovement",
  "expense",
  "employeeCompensation",
  "payrollPeriod",
  "payrollRecord",
  "payrollDeduction",
  "payrollPayment",
  "iOU",
  "loan",
  "financialRepayment",
  "businessRolePermission",
  "userPermissionOverride",
  "financialStatementConfig",
  "financialStatementRecipient",
  "financialStatement",
] as const;

async function assertExistingBelongsToBusiness(
  tx: unknown,
  model: string,
  id: string,
  businessId: string,
): Promise<JsonRecord | null> {
  const existing = await delegate(tx, model).findUnique({ where: { id } });
  if (existing && existing.businessId !== businessId) {
    throw new AppError(
      `Backup restore refused: ${model} ${id} belongs to another business`,
      409,
    );
  }
  return existing;
}

async function upsertBusinessRecord(
  tx: unknown,
  model: string,
  record: JsonRecord,
  businessId: string,
): Promise<"created" | "updated"> {
  const id = record.id;
  if (typeof id !== "string" || !id) {
    throw new AppError(`Backup contains an invalid ${model} ID`, 422);
  }

  const existing = await assertExistingBelongsToBusiness(
    tx,
    model,
    id,
    businessId,
  );

  if (existing) {
    const data = { ...record };
    delete (data as Record<string, unknown>).id;
    delete (data as Record<string, unknown>).businessId;
    await delegate(tx, model).update({
      where: { id },
      data,
    });
    return "updated";
  }

  await delegate(tx, model).create({ data: { ...record, businessId } });
  return "created";
}

async function upsertByNameWhenAllowed(
  tx: unknown,
  model: string,
  record: JsonRecord,
  businessId: string,
): Promise<{ status: "created" | "updated" | "mapped"; id: string }> {
  const id = record.id;
  if (typeof id !== "string" || !id) {
    throw new AppError(`Backup contains an invalid ${model} ID`, 422);
  }

  const existingById = await assertExistingBelongsToBusiness(
    tx,
    model,
    id,
    businessId,
  );

  if (existingById) {
    const data = { ...record };
    delete (data as Record<string, unknown>).id;
    delete (data as Record<string, unknown>).businessId;
    await delegate(tx, model).update({ where: { id }, data });
    return { status: "updated", id };
  }

  const name = record.name;
  if (typeof name !== "string" || !name) {
    throw new AppError(`Backup contains an invalid ${model} name`, 422);
  }

  const existingByName = await delegate(tx, model).findFirst({
    where: { businessId, name },
  });

  if (existingByName) {
    return { status: "mapped", id: String(existingByName.id) };
  }

  await delegate(tx, model).create({
    data: { ...record, businessId },
  });

  return { status: "created", id };
}

async function restoreChild(
  tx: unknown,
  model: string,
  record: JsonRecord,
  relationIdFields: Array<[string, Map<string, string>]>,
  extraData: JsonRecord = {},
): Promise<"created" | "updated"> {
  const id = record.id;
  if (typeof id !== "string" || !id) {
    throw new AppError(`Backup contains an invalid ${model} ID`, 422);
  }

  const data: JsonRecord = { ...record, ...extraData };

  for (const [field, map] of relationIdFields) {
    const original = data[field];
    if (typeof original !== "string") {
      throw new AppError(
        `Backup ${model} ${id} is missing required ${field}`,
        422,
      );
    }
    const mapped = map.get(original);
    if (!mapped) {
      throw new AppError(
        `Backup ${model} ${id} references missing ${field} ${original}`,
        409,
      );
    }
    data[field] = mapped;
  }

  const existing = await delegate(tx, model).findUnique({ where: { id } });

  if (existing) {
    await delegate(tx, model).update({
      where: { id },
      data: Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "id"),
      ),
    });
    return "updated";
  }

  await delegate(tx, model).create({ data });
  return "created";
}

export async function exportBusinessBackup(
  businessId: string,
  userId: string,
  password: string,
  rawReason?: unknown,
): Promise<Buffer> {
  const reason = requireReason(rawReason);

  const [
    business,
    branches,
    users,
    userBranches,
    customers,
    customerStatusHistory,
    services,
    colors,
    orderNumberSequence,
    orders,
    orderItems,
    garments,
    invoices,
    invoiceItems,
    invoiceHistory,
    payments,
    inventoryItems,
    inventoryStock,
    inventoryMovements,
    expenses,
    employeeCompensation,
    payrollPeriods,
    payrollRecords,
    payrollDeductions,
    payrollPayments,
    ious,
    loans,
    financialRepayments,
    businessRolePermissions,
    userPermissionOverrides,
    financialStatementConfig,
    financialStatementRecipients,
    financialStatements,
    financialStatementDeliveries,
  ] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.branch.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { businessId },
      orderBy: { email: "asc" },
    }),
    prisma.userBranch.findMany({
      where: { user: { businessId } },
    }),
    prisma.customer.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    }),
    prisma.customerStatusHistory.findMany({ where: { businessId } }),
    prisma.service.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.color.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.orderNumberSequence.findUnique({ where: { businessId } }),
    prisma.order.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.orderItem.findMany({ where: { order: { businessId } } }),
    prisma.garment.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.invoice.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.invoiceItem.findMany({ where: { invoice: { businessId } } }),
    prisma.invoiceHistory.findMany({ where: { businessId } }),
    prisma.payment.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.inventoryItem.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.inventoryStock.findMany({ where: { businessId } }),
    prisma.inventoryMovement.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.expense.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.employeeCompensation.findMany({ where: { businessId } }),
    prisma.payrollPeriod.findMany({ where: { businessId }, orderBy: { periodStart: "asc" } }),
    prisma.payrollRecord.findMany({ where: { businessId } }),
    prisma.payrollDeduction.findMany({ where: { businessId } }),
    prisma.payrollPayment.findMany({ where: { businessId } }),
    prisma.iOU.findMany({ where: { businessId } }),
    prisma.loan.findMany({ where: { businessId } }),
    prisma.financialRepayment.findMany({ where: { businessId } }),
    prisma.businessRolePermission.findMany({ where: { businessId } }),
    prisma.userPermissionOverride.findMany({ where: { businessId } }),
    prisma.financialStatementConfig.findUnique({ where: { businessId } }),
    prisma.financialStatementRecipient.findMany({ where: { businessId } }),
    prisma.financialStatement.findMany({ where: { businessId } }),
    prisma.financialStatementDelivery.findMany({
      where: { statement: { businessId } },
    }),
  ]);

  if (!business) throw new AppError("Business not found", 404);

  const permissionIds = [
    ...businessRolePermissions.map((item) => item.permissionId),
    ...userPermissionOverrides.map((item) => item.permissionId),
  ];
  const permissions = permissionIds.length
    ? await prisma.permission.findMany({
        where: { id: { in: permissionIds } },
        select: { id: true, code: true },
      })
    : [];
  const permissionCodeById = new Map(
    permissions.map((permission) => [permission.id, permission.code]),
  );

  const sanitizedUsers = users.map((user) => {
    const record = serializeRecord({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    return record;
  });

  const payload: BackupPayload = {
    format: "laundry-business-backup",
    version: VERSION,
    exportedAt: new Date().toISOString(),
    business: serializeRecord(business),
    branches: branches.map(serializeRecord),
    users: sanitizedUsers,
    userBranches: userBranches.map(serializeRecord),
    customers: customers.map(serializeRecord),
    customerStatusHistory: customerStatusHistory.map(serializeRecord),
    services: services.map(serializeRecord),
    colors: colors.map(serializeRecord),
    orderNumberSequence: orderNumberSequence
      ? serializeRecord(orderNumberSequence)
      : null,
    orders: orders.map(serializeRecord),
    orderItems: orderItems.map(serializeRecord),
    garments: garments.map(serializeRecord),
    invoices: invoices.map(serializeRecord),
    invoiceItems: invoiceItems.map(serializeRecord),
    invoiceHistory: invoiceHistory.map(serializeRecord),
    payments: payments.map(serializeRecord),
    inventoryItems: inventoryItems.map(serializeRecord),
    inventoryStock: inventoryStock.map(serializeRecord),
    inventoryMovements: inventoryMovements.map(serializeRecord),
    expenses: expenses.map(serializeRecord),
    employeeCompensation: employeeCompensation.map(serializeRecord),
    payrollPeriods: payrollPeriods.map(serializeRecord),
    payrollRecords: payrollRecords.map(serializeRecord),
    payrollDeductions: payrollDeductions.map(serializeRecord),
    payrollPayments: payrollPayments.map(serializeRecord),
    ious: ious.map(serializeRecord),
    loans: loans.map(serializeRecord),
    financialRepayments: financialRepayments.map(serializeRecord),
    businessRolePermissions: businessRolePermissions.map((item) => ({
      ...serializeRecord(item),
      permissionCode: permissionCodeById.get(item.permissionId),
    })),
    userPermissionOverrides: userPermissionOverrides.map((item) => ({
      ...serializeRecord(item),
      permissionCode: permissionCodeById.get(item.permissionId),
    })),
    financialStatementConfig: financialStatementConfig
      ? serializeRecord(financialStatementConfig)
      : null,
    financialStatementRecipients: financialStatementRecipients.map(
      serializeRecord,
    ),
    financialStatements: financialStatements.map(serializeRecord),
    financialStatementDeliveries: financialStatementDeliveries.map(
      serializeRecord,
    ),
  };

  const encrypted = encrypt(payload, password);
  const counts = countsFromPayload(payload);

  await recordAuditEvent({
    action: "backup.exported",
    entityType: "BusinessBackup",
    businessId,
    actorUserId: userId,
    correlationId: null,
    metadata: {
      version: VERSION,
      sha256: createHash("sha256").update(encrypted).digest("hex"),
      ...counts,
      reason,
    },
  });

  return encrypted;
}

export async function restoreBusinessBackup(
  businessId: string,
  userId: string,
  buffer: Buffer,
  password: string,
  rawReason?: unknown,
): Promise<RestoreCounts> {
  const reason = requireReason(rawReason);
  const payload = decrypt(buffer, password);

  if (payload.business.id !== businessId) {
    throw new AppError(
      "Backup belongs to a different business and cannot be restored here",
      409,
    );
  }

  if (typeof payload.business.name !== "string" || !payload.business.name) {
    throw new AppError("Backup does not contain a valid business", 422);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const counts: RestoreCounts = {
        ...countsFromPayload(payload),
        created: 0,
        updated: 0,
        mapped: 0,
        skippedUsers: 0,
      };

      const businessRecord = await delegate(tx, "business").findUnique({
        where: { id: businessId },
      });
      if (!businessRecord) {
        throw new AppError("Target business not found", 404);
      }

      const businessData = { ...payload.business };
      delete businessData.id;
      delete businessData.createdAt;
      delete businessData.updatedAt;
      delete businessData.slug;
      await delegate(tx, "business").update({
        where: { id: businessId },
        data: businessData,
      });
      counts.updated += 1;

      const branchMap = new Map<string, string>();
      for (const branch of payload.branches) {
        const status = await upsertBusinessRecord(
          tx,
          "branch",
          branch,
          businessId,
        );
        branchMap.set(String(branch.id), String(branch.id));
        counts[status] += 1;
      }

      const targetUsers = await delegate(tx, "user").findMany({
        where: { businessId },
      });
      const userMap = new Map<string, string>();
      const targetUsersByEmail = new Map(
        targetUsers
          .filter((user) => typeof user.email === "string")
          .map((user) => [String(user.email).toLowerCase(), String(user.id)]),
      );

      for (const backupUser of payload.users) {
        const backupId = String(backupUser.id);
        const byId = targetUsers.find((user) => user.id === backupId);
        const mappedId =
          byId?.id ??
          targetUsersByEmail.get(String(backupUser.email).toLowerCase());

        if (mappedId) {
          userMap.set(backupId, String(mappedId));
        } else {
          counts.skippedUsers += 1;
        }
      }

      for (const userBranch of payload.userBranches) {
        const userIdFromBackup = String(userBranch.userId);
        const branchIdFromBackup = String(userBranch.branchId);
        const mappedUser = userMap.get(userIdFromBackup);
        const mappedBranch = branchMap.get(branchIdFromBackup);

        if (!mappedUser || !mappedBranch) continue;

        const existing = await delegate(tx, "userBranch").findUnique({
          where: {
            userId_branchId: {
              userId: mappedUser,
              branchId: mappedBranch,
            },
          },
        });

        if (!existing) {
          await delegate(tx, "userBranch").create({
            data: {
              id: userBranch.id,
              userId: mappedUser,
              branchId: mappedBranch,
              createdAt: userBranch.createdAt,
            },
          });
          counts.created += 1;
        } else {
          counts.updated += 1;
        }
      }

      const customerMap = new Map<string, string>();
      for (const customer of payload.customers) {
        const status = await upsertBusinessRecord(
          tx,
          "customer",
          customer,
          businessId,
        );
        customerMap.set(String(customer.id), String(customer.id));
        counts[status] += 1;
      }

      for (const history of payload.customerStatusHistory) {
        await restoreChild(tx, "customerStatusHistory", history, [
          ["customerId", customerMap],
        ]);
        counts.updated += 1;
      }

      const serviceMap = new Map<string, string>();
      for (const service of payload.services) {
        const result = await upsertByNameWhenAllowed(
          tx,
          "service",
          service,
          businessId,
        );
        serviceMap.set(String(service.id), result.id);
        counts[result.status] += 1;
      }

      const colorMap = new Map<string, string>();
      for (const color of payload.colors) {
        const result = await upsertByNameWhenAllowed(
          tx,
          "color",
          color,
          businessId,
        );
        colorMap.set(String(color.id), result.id);
        counts[result.status] += 1;
      }

      if (payload.orderNumberSequence) {
        const status = await upsertBusinessRecord(
          tx,
          "orderNumberSequence",
          payload.orderNumberSequence,
          businessId,
        );
        counts[status] += 1;
      }

      const orderMap = new Map<string, string>();
      for (const order of payload.orders) {
        const backupId = String(order.id);
        const existing = await assertExistingBelongsToBusiness(
          tx,
          "order",
          backupId,
          businessId,
        );

        if (!existing) {
          const conflicting = await delegate(tx, "order").findFirst({
            where: {
              businessId,
              orderNumber: order.orderNumber,
            },
          });
          if (conflicting) {
            throw new AppError(
              `Unsafe restore conflict: order number ${String(order.orderNumber)} already belongs to another order`,
              409,
            );
          }
        }

        const data = { ...order };
        data.branchId = branchMap.get(String(order.branchId));
        data.customerId = customerMap.get(String(order.customerId));

        if (!data.branchId || !data.customerId) {
          throw new AppError(
            `Order ${backupId} references a missing branch or customer`,
            409,
          );
        }

        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;

        if (existing) {
          await delegate(tx, "order").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "order").create({
            data: { id: backupId, businessId, ...data },
          });
          counts.created += 1;
        }

        orderMap.set(backupId, backupId);
      }

      const orderItemMap = new Map<string, string>();
      for (const item of payload.orderItems) {
        const backupId = String(item.id);
        const data = {
          ...item,
          orderId: orderMap.get(String(item.orderId)),
          serviceId: serviceMap.get(String(item.serviceId)),
        };

        if (!data.orderId || !data.serviceId) {
          throw new AppError(
            `Order item ${backupId} references a missing order or service`,
            409,
          );
        }

        const existing = await delegate(tx, "orderItem").findUnique({
          where: { id: backupId },
        });

        delete (data as Record<string, unknown>).id;

        if (existing) {
          await delegate(tx, "orderItem").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "orderItem").create({
            data: { id: backupId, ...data },
          });
          counts.created += 1;
        }

        orderItemMap.set(backupId, backupId);
      }

      for (const garment of payload.garments) {
        const data = {
          ...garment,
          branchId: branchMap.get(String(garment.branchId)),
          orderId: orderMap.get(String(garment.orderId)),
          orderItemId: orderItemMap.get(String(garment.orderItemId)),
        };

        if (!data.branchId || !data.orderId || !data.orderItemId) {
          throw new AppError(
            `Garment ${String(garment.id)} references missing dependencies`,
            409,
          );
        }

        const backupId = String(garment.id);
        const existing = await delegate(tx, "garment").findUnique({
          where: { id: backupId },
        });

        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;

        if (existing) {
          await delegate(tx, "garment").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "garment").create({
            data: {
              id: backupId,
              businessId,
              ...data,
            },
          });
          counts.created += 1;
        }
      }

      const invoiceMap = new Map<string, string>();
      for (const invoice of payload.invoices) {
        const backupId = String(invoice.id);
        const existing = await assertExistingBelongsToBusiness(
          tx,
          "invoice",
          backupId,
          businessId,
        );

        if (!existing) {
          const conflicting = await delegate(tx, "invoice").findFirst({
            where: {
              businessId,
              invoiceNumber: invoice.invoiceNumber,
            },
          });
          if (conflicting) {
            throw new AppError(
              `Unsafe restore conflict: invoice number ${String(invoice.invoiceNumber)} already belongs to another invoice`,
              409,
            );
          }
        }

        const data = { ...invoice };
        data.branchId = branchMap.get(String(invoice.branchId));
        data.orderId = orderMap.get(String(invoice.orderId));

        if (!data.branchId || !data.orderId) {
          throw new AppError(
            `Invoice ${backupId} references missing branch or order`,
            409,
          );
        }

        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;

        if (existing) {
          await delegate(tx, "invoice").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "invoice").create({
            data: { id: backupId, businessId, ...data },
          });
          counts.created += 1;
        }

        invoiceMap.set(backupId, backupId);
      }

      for (const item of payload.invoiceItems) {
        const status = await restoreChild(tx, "invoiceItem", item, [
          ["invoiceId", invoiceMap],
        ]);
        counts[status] += 1;
      }

      for (const history of payload.invoiceHistory) {
        const status = await restoreChild(tx, "invoiceHistory", history, [
          ["invoiceId", invoiceMap],
        ]);
        counts[status] += 1;
      }

      const originalPayments = payload.payments.filter(
        (payment) => !payment.refundOfPaymentId,
      );
      const refundPayments = payload.payments.filter(
        (payment) => Boolean(payment.refundOfPaymentId),
      );
      const paymentMap = new Map<string, string>();

      for (const payment of [...originalPayments, ...refundPayments]) {
        const backupId = String(payment.id);
        const existing = await assertExistingBelongsToBusiness(
          tx,
          "payment",
          backupId,
          businessId,
        );

        const data = { ...payment };
        data.branchId = branchMap.get(String(payment.branchId));
        data.invoiceId = invoiceMap.get(String(payment.invoiceId));

        if (!data.branchId || !data.invoiceId) {
          throw new AppError(
            `Payment ${backupId} references missing branch or invoice`,
            409,
          );
        }

        if (payment.refundOfPaymentId) {
          const original = paymentMap.get(String(payment.refundOfPaymentId));
          if (!original) {
            throw new AppError(
              `Refund payment ${backupId} references a missing original payment`,
              409,
            );
          }
          data.refundOfPaymentId = original;
        }

        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;

        if (existing) {
          await delegate(tx, "payment").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "payment").create({
            data: { id: backupId, businessId, ...data },
          });
          counts.created += 1;
        }

        paymentMap.set(backupId, backupId);
      }

      const inventoryMap = new Map<string, string>();
      for (const item of payload.inventoryItems) {
        const result = await upsertByNameWhenAllowed(
          tx,
          "inventoryItem",
          item,
          businessId,
        );
        inventoryMap.set(String(item.id), result.id);
        counts[result.status] += 1;
      }

      for (const stock of payload.inventoryStock) {
        const data = {
          ...stock,
          branchId: branchMap.get(String(stock.branchId)),
          inventoryItemId: inventoryMap.get(String(stock.inventoryItemId)),
        };

        if (!data.branchId || !data.inventoryItemId) {
          throw new AppError(
            `Inventory stock ${String(stock.id)} references missing dependencies`,
            409,
          );
        }

        const backupId = String(stock.id);
        const existing = await delegate(tx, "inventoryStock").findUnique({
          where: { id: backupId },
        });

        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;

        if (existing) {
          await delegate(tx, "inventoryStock").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "inventoryStock").create({
            data: {
              id: backupId,
              businessId,
              ...data,
            },
          });
          counts.created += 1;
        }
      }

      for (const movement of payload.inventoryMovements) {
        const data = {
          ...movement,
          branchId: branchMap.get(String(movement.branchId)),
          inventoryItemId: inventoryMap.get(String(movement.inventoryItemId)),
          createdById: userMap.get(String(movement.createdById)),
        };

        if (!data.branchId || !data.inventoryItemId || !data.createdById) {
          throw new AppError(
            `Inventory movement ${String(movement.id)} references missing dependencies or user`,
            409,
          );
        }

        const backupId = String(movement.id);
        const existing = await delegate(tx, "inventoryMovement").findUnique({
          where: { id: backupId },
        });

        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;

        if (existing) {
          await delegate(tx, "inventoryMovement").update({
            where: { id: backupId },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "inventoryMovement").create({
            data: {
              id: backupId,
              businessId,
              ...data,
            },
          });
          counts.created += 1;
        }
      }

      const branchRequiredModels: Array<[string, JsonRecord[]]> = [
        ["expense", payload.expenses],
        ["employeeCompensation", payload.employeeCompensation],
        ["payrollPeriod", payload.payrollPeriods],
        ["payrollRecord", payload.payrollRecords],
        ["payrollDeduction", payload.payrollDeductions],
        ["payrollPayment", payload.payrollPayments],
        ["iOU", payload.ious],
        ["loan", payload.loans],
        ["financialRepayment", payload.financialRepayments],
      ];

      for (const [model, records] of branchRequiredModels) {
        for (const record of records) {
          const data = { ...record };

          if ("branchId" in data) {
            data.branchId = branchMap.get(String(data.branchId));
          }
          if ("employeeId" in data) {
            data.employeeId = userMap.get(String(data.employeeId));
          }
          if ("createdById" in data) {
            data.createdById = userMap.get(String(data.createdById));
          }
          if ("approvedById" in data && data.approvedById) {
            data.approvedById = userMap.get(String(data.approvedById)) ?? null;
          }
          if ("recognizedById" in data && data.recognizedById) {
            data.recognizedById =
              userMap.get(String(data.recognizedById)) ?? null;
          }
          if ("payrollPeriodId" in data) {
            const period = payload.payrollPeriods.find(
              (item) => item.id === record.payrollPeriodId,
            );
            if (!period) throw new AppError("Missing payroll period", 409);
          }
          if ("payrollRecordId" in data) {
            const recordExists = payload.payrollRecords.some(
              (item) => item.id === record.payrollRecordId,
            );
            if (!recordExists) throw new AppError("Missing payroll record", 409);
          }
          if ("iouId" in data && data.iouId) {
            const mapped = payload.ious.some((item) => item.id === data.iouId);
            if (!mapped) throw new AppError("Missing IOU reference", 409);
          }
          if ("loanId" in data && data.loanId) {
            const mapped = payload.loans.some((item) => item.id === data.loanId);
            if (!mapped) throw new AppError("Missing loan reference", 409);
          }

          if (
            ("branchId" in data && !data.branchId) ||
            ("employeeId" in data && !data.employeeId) ||
            ("createdById" in data && !data.createdById)
          ) {
            throw new AppError(
              `Backup ${model} ${String(record.id)} references a missing required user or branch`,
              409,
            );
          }

          const backupId = String(record.id);
          const existing = await assertExistingBelongsToBusiness(
            tx,
            model,
            backupId,
            businessId,
          );

          delete (data as Record<string, unknown>).id;
          delete (data as Record<string, unknown>).businessId;

          if (existing) {
            await delegate(tx, model).update({
              where: { id: backupId },
              data,
            });
            counts.updated += 1;
          } else {
            await delegate(tx, model).create({
              data: {
                id: backupId,
                businessId,
                ...data,
              },
            });
            counts.created += 1;
          }
        }
      }

      const permissionRows = await delegate(tx, "permission").findMany({});
      const permissionMap = new Map(
        permissionRows
          .filter((permission) => typeof permission.code === "string")
          .map((permission) => [String(permission.code), String(permission.id)]),
      );

      for (const item of payload.businessRolePermissions) {
        const permissionId = permissionMap.get(String(item.permissionCode));
        if (!permissionId) {
          throw new AppError(
            `Backup references missing permission code ${String(item.permissionCode)}`,
            409,
          );
        }

        const existing = await delegate(
          tx,
          "businessRolePermission",
        ).findUnique({
          where: {
            businessId_role_permissionId: {
              businessId,
              role: item.role,
              permissionId,
            },
          },
        });

        const data = {
          ...item,
          businessId,
          permissionId,
        };
        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).permissionCode;

        if (existing) {
          await delegate(tx, "businessRolePermission").update({
            where: { id: String(existing.id) },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "businessRolePermission").create({
            data: {
              id: item.id,
              ...data,
            },
          });
          counts.created += 1;
        }
      }

      for (const item of payload.userPermissionOverrides) {
        const mappedUser = userMap.get(String(item.userId));
        const permissionId = permissionMap.get(String(item.permissionCode));

        if (!mappedUser) continue;
        if (!permissionId) {
          throw new AppError(
            `Backup references missing permission code ${String(item.permissionCode)}`,
            409,
          );
        }

        const existing = await delegate(
          tx,
          "userPermissionOverride",
        ).findUnique({
          where: {
            businessId_userId_permissionId: {
              businessId,
              userId: mappedUser,
              permissionId,
            },
          },
        });

        const data = {
          ...item,
          businessId,
          userId: mappedUser,
          permissionId,
        };
        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).permissionCode;

        if (existing) {
          await delegate(tx, "userPermissionOverride").update({
            where: { id: String(existing.id) },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "userPermissionOverride").create({
            data: {
              id: item.id,
              ...data,
            },
          });
          counts.created += 1;
        }
      }

      if (payload.financialStatementConfig) {
        const data = { ...payload.financialStatementConfig };
        delete (data as Record<string, unknown>).id;
        delete (data as Record<string, unknown>).businessId;
        delete data.createdAt;
        delete data.updatedAt;

        await delegate(tx, "financialStatementConfig").upsert({
          where: { businessId },
          create: {
            id: payload.financialStatementConfig.id,
            businessId,
            ...data,
          },
          update: data,
        });
        counts.updated += 1;
      }

      const statementMap = new Map<string, string>();
      for (const statement of payload.financialStatements) {
        const status = await upsertBusinessRecord(
          tx,
          "financialStatement",
          statement,
          businessId,
        );
        statementMap.set(String(statement.id), String(statement.id));
        counts[status] += 1;
      }

      for (const recipient of payload.financialStatementRecipients) {
        const mappedUser = userMap.get(String(recipient.userId));
        if (!mappedUser) continue;

        const data = {
          ...recipient,
          businessId,
          userId: mappedUser,
        };
        delete (data as Record<string, unknown>).id;

        const existing = await delegate(
          tx,
          "financialStatementRecipient",
        ).findUnique({
          where: {
            businessId_userId: {
              businessId,
              userId: mappedUser,
            },
          },
        });

        if (existing) {
          await delegate(tx, "financialStatementRecipient").update({
            where: { id: String(existing.id) },
            data,
          });
          counts.updated += 1;
        } else {
          await delegate(tx, "financialStatementRecipient").create({
            data: {
              id: recipient.id,
              ...data,
            },
          });
          counts.created += 1;
        }
      }

      for (const delivery of payload.financialStatementDeliveries) {
        const status = await restoreChild(
          tx,
          "financialStatementDelivery",
          delivery,
          [["statementId", statementMap]],
          {
            recipientId: delivery.recipientId,
          },
        );
        counts[status] += 1;
      }

      return counts;
    },
    {
      timeout: 120_000,
      maxWait: 10_000,
    },
  );

  await recordAuditEvent({
    action: "backup.restored",
    entityType: "BusinessBackup",
    businessId,
    actorUserId: userId,
    correlationId: null,
    metadata: {
      version: VERSION,
      ...result,
      reason,
    },
  });

  return result;
}

export const __backupTestHooks = {
  encrypt,
  decrypt,
  countsFromPayload,
};
