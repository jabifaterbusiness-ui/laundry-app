import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { normalizePhone } from "./customers.validation.js";
import { assertBranchResourceWriteAccess, getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

export { normalizePhone };

interface ListParams {
  businessId: string;
  branchId: string;
  userId: string;
  page: number;
  pageSize: number;
  search?: string;
  status: "active" | "dormant" | "blocked" | "blacklisted" | "inactive" | "all";
}

export async function listCustomers(params: ListParams) {
  const { businessId, branchId, userId, page, pageSize, search, status } = params;
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMERS" });

  const where: Prisma.CustomerWhereInput = {
    businessId,
    OR: [
      { ownerBranchId: null },
      { ownerBranchId: { in: scope.ownerBranchIds } },
      { id: { in: scope.resourceIds } },
    ],
  };

  if (status !== "all") {
    if (status === "inactive") {
      where.isActive = false;
    } else {
      const lifecycleStatus =
        status === "active"
          ? "ACTIVE"
          : status === "dormant"
            ? "DORMANT"
            : status === "blocked"
              ? "BLOCKED"
              : "BLACKLISTED";

      where.lifecycleStatus = lifecycleStatus;
    }
  }

  if (search) {
    const normalizedSearch = normalizePhone(search);
    const searchClauses: Prisma.CustomerWhereInput[] = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      {
        orders: {
          some: {
            branchId,
          orderNumber: { contains: search, mode: "insensitive" },
          },
        },
      },
      {
        orders: {
          some: {
            branchId,
            invoice: {
              is: {
                invoiceNumber: { contains: search, mode: "insensitive" },
              },
            },
          },
        },
      },
    ];

    // Only add a phone clause if the search string contains at least one
    // digit - otherwise a pure-name search like "an" would also
    // (uselessly, since normalizedSearch would be "") match every phone.
    if (normalizedSearch.replace(/[^0-9]/g, "").length > 0) {
      searchClauses.push({ phone: { contains: normalizedSearch } });
    }

    where.AND = [{ OR: searchClauses }];
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/**
 * Tenant-scoped single-record lookup. Combines the id and businessId in
 * ONE query (rather than fetching by id and separately checking
 * ownership) so a cross-business lookup returns null exactly like a
 * nonexistent id does - the caller can't distinguish "doesn't exist"
 * from "exists but isn't yours" (LOCKED tenant-isolation decision).
 */
type CustomerDb = typeof prisma | Prisma.TransactionClient;

export async function getCustomerForBusiness(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
  db: CustomerDb = prisma,
) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMERS" }, db);
  return db.customer.findFirst({
    where: {
      id,
      businessId,
      OR: [{ ownerBranchId: null }, { ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }],
    },
    include: { ownerBranch: { select: { id: true, name: true } } },
  });
}

/**
 * Soft duplicate check (see docs/CUSTOMERS.md section E): looks for an
 * existing, active customer in the same business with the same
 * normalized phone number. Returns matches without blocking anything -
 * the caller decides what to do (customers.controller.ts turns this
 * into a 409 unless the request opted in with confirmDuplicate: true).
 *
 * `excludeId` is used by the update flow so a customer's own existing
 * phone number never counts as a "duplicate" of itself - only used for
 * PATCH, never for POST (create has no record to exclude).
 */
export async function findPossibleDuplicates(
  businessId: string,
  branchId: string,
  userId: string,
  normalizedPhone: string,
  excludeId?: string,
  db: CustomerDb = prisma,
) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMERS" }, db);
  return db.customer.findMany({
    where: {
      businessId,
      OR: [{ ownerBranchId: null }, { ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }],
      phone: normalizedPhone,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, phone: true },
  });
}

export interface CreateCustomerData {
  businessId: string;
  branchId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  whatsappOptIn?: boolean;
  whatsappOptInSource?: string;
}

export async function createCustomer(
  data: CreateCustomerData,
  db: CustomerDb = prisma,
) {
  return db.customer.create({
    data: {
      businessId: data.businessId,
      ownerBranchId: data.branchId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      whatsappOptIn: data.whatsappOptIn ?? false,
      whatsappOptInAt: data.whatsappOptIn ? new Date() : null,
      whatsappOptInSource: data.whatsappOptIn ? data.whatsappOptInSource ?? null : null,
    },
  });
}

export interface UpdateCustomerData {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  whatsappOptIn?: boolean;
  whatsappOptInSource?: string;
}

/**
 * Tenant-scoped update: uses updateMany with {id, businessId} in the
 * where clause (not a bare update-by-id) so it's structurally impossible
 * to update a record that isn't in the caller's business, and re-reads
 * afterward for the response. Throws 404 if nothing matched - same
 * anti-leak reasoning as getCustomerForBusiness.
 */
export async function updateCustomer(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
  data: UpdateCustomerData,
  db: CustomerDb = prisma,
) {
  const existing = await getCustomerForBusiness(id, businessId, branchId, userId, db);
  if (!existing) throw new AppError("Customer not found", 404);
  await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "CUSTOMERS", ownerBranchId: existing.ownerBranchId, resourceId: id }, db);
  const patch: Prisma.CustomerUpdateManyMutationInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.email !== undefined) patch.email = data.email;
  if (data.address !== undefined) patch.address = data.address;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.whatsappOptIn === true && !existing.whatsappOptIn) {
    patch.whatsappOptIn = true;
    patch.whatsappOptInAt = new Date();
    patch.whatsappOptInSource = data.whatsappOptInSource ?? null;
    patch.whatsappOptOutAt = null;
  } else if (data.whatsappOptIn === false && existing.whatsappOptIn) {
    patch.whatsappOptIn = false;
    patch.whatsappOptOutAt = new Date();
  }

  const result = await db.customer.updateMany({
    where: { id, businessId },
    data: patch,
  });

  if (result.count === 0) {
    throw new AppError("Customer not found", 404);
  }

  return getCustomerForBusiness(id, businessId, branchId, userId, db);
}

export async function setCustomerLifecycleStatus(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
  status: "ACTIVE" | "DORMANT" | "BLOCKED" | "BLACKLISTED",
  reason: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMERS" }, tx);
    const customer = await tx.customer.findFirst({
      where: { id, businessId, OR: [{ ownerBranchId: null }, { ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] },
      select: { id: true, lifecycleStatus: true, ownerBranchId: true },
    });

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "CUSTOMERS", ownerBranchId: customer.ownerBranchId, resourceId: id }, tx);

    if (customer.lifecycleStatus === status) {
      throw new AppError("Customer is already in this status", 409);
    }

    const updated = await tx.customer.update({
      where: { id: customer.id },
      data: {
        lifecycleStatus: status,
        isActive: status === "ACTIVE",
        statusReason: reason,
        statusChangedAt: new Date(),
        statusChangedById: actorUserId,
      },
    });

    await tx.customerStatusHistory.create({
      data: {
        customerId: customer.id,
        businessId,
        previousStatus: customer.lifecycleStatus,
        newStatus: status,
        reason,
        changedById: actorUserId,
      },
    });

    return {
      customer: updated,
      previousStatus: customer.lifecycleStatus,
    };
  });
}

/**
 * Merges everything represented by a customer's order history into another
 * customer account within the same business.
 *
 * Orders are reassigned to the target customer in one transaction. Their
 * related order items, garments, invoices, and payments remain attached to
 * those orders/invoices, so the complete transactional history moves with
 * the account without rewriting historical invoice/payment snapshots.
 *
 * Customer records themselves are not deleted or merged here. Full duplicate
 * account consolidation belongs to MA.
 */
async function getEditableCustomerForBranch(
  tx: CustomerDb,
  customerId: string,
  businessId: string,
  branchId: string,
  userId: string,
  notFoundMessage: string,
) {
  const customer = await getCustomerForBusiness(customerId, businessId, branchId, userId, tx);
  if (!customer) throw new AppError(notFoundMessage, 404);
  await assertBranchResourceWriteAccess({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
    ownerBranchId: customer.ownerBranchId,
    resourceId: customer.id,
  }, tx);
  return customer;
}

async function getEditableCustomerAccountForBranch(
  tx: CustomerDb,
  customerId: string,
  businessId: string,
) {
  // Customer account balances and ledgers are shared business-wide. The
  // branch ID belongs to each ledger transaction, not to the account.
  return tx.customerAccount.findFirst({
    where: { customerId, businessId, branchId: null },
    select: { id: true, branchId: true },
  });
}

/**
 * Transfers the selected branch's orders and the customer's business-wide
 * account ledger. Customer visibility and edit access are checked for both
 * customer records before the transfer begins.
 */
export async function transferCustomer(
  customerId: string,
  businessId: string,
  branchId: string,
  userId: string,
  targetCustomerId: string,
) {
  return prisma.$transaction(async (tx) => {
    const customer = await getEditableCustomerForBranch(
      tx, customerId, businessId, branchId, userId, "Customer not found",
    );
    if (customer.id === targetCustomerId) {
      throw new AppError("Customer cannot be transferred to the same customer", 422);
    }
    const targetCustomer = await getEditableCustomerForBranch(
      tx, targetCustomerId, businessId, branchId, userId, "Target customer not found",
    );

    const orders = await tx.order.findMany({
      where: { businessId, branchId, customerId: customer.id },
      select: { id: true, orderNumber: true, branchId: true },
      orderBy: { createdAt: "asc" },
    });
    if (orders.length > 0) {
      await tx.order.updateMany({
        where: { businessId, branchId, customerId: customer.id },
        data: { customerId: targetCustomer.id },
      });
    }

    const sourceAccount = await getEditableCustomerAccountForBranch(
      tx, customer.id, businessId,
    );
    const targetAccount = await getEditableCustomerAccountForBranch(
      tx, targetCustomer.id, businessId,
    );
    if (sourceAccount && targetAccount && sourceAccount.branchId !== targetAccount.branchId) {
      throw new AppError("Customer accounts belong to different branches and cannot be transferred together", 409);
    }
    if (sourceAccount && targetAccount) {
      await tx.customerAccountTransaction.updateMany({
        where: { businessId, customerAccountId: sourceAccount.id },
        data: { customerAccountId: targetAccount.id },
      });
      await tx.customerAccount.delete({ where: { id: sourceAccount.id } });
    } else if (sourceAccount && !targetAccount) {
      await tx.customerAccount.update({
        where: { id: sourceAccount.id },
        data: { customerId: targetCustomer.id },
      });
    }

    return {
      customer,
      targetCustomer,
      transferredOrderCount: orders.length,
      transferredOrders: orders,
    };
  });
}

/**
 * Merges order records in the selected branch and combines the customer's
 * business-wide account ledger. The source customer is deactivated only when
 * it is owned by this branch and no other branch still references or shares it.
 */
export async function mergeCustomer(
  customerId: string,
  businessId: string,
  branchId: string,
  userId: string,
  targetCustomerId: string,
) {
  return prisma.$transaction(async (tx) => {
    const customer = await getEditableCustomerForBranch(
      tx, customerId, businessId, branchId, userId, "Customer not found",
    );
    if (customer.id === targetCustomerId) {
      throw new AppError("Customer cannot be merged into the same customer", 422);
    }
    const targetCustomer = await getEditableCustomerForBranch(
      tx, targetCustomerId, businessId, branchId, userId, "Target customer not found",
    );

    const orders = await tx.order.findMany({
      where: { businessId, branchId, customerId: customer.id },
      select: { id: true, orderNumber: true, branchId: true },
      orderBy: { createdAt: "asc" },
    });
    if (orders.length > 0) {
      await tx.order.updateMany({
        where: { businessId, branchId, customerId: customer.id },
        data: { customerId: targetCustomer.id },
      });
    }

    const sourceAccount = await getEditableCustomerAccountForBranch(
      tx, customer.id, businessId,
    );
    const targetAccount = await getEditableCustomerAccountForBranch(
      tx, targetCustomer.id, businessId,
    );
    if (sourceAccount && targetAccount && sourceAccount.branchId !== targetAccount.branchId) {
      throw new AppError("Customer accounts belong to different branches and cannot be merged together", 409);
    }
    if (sourceAccount && targetAccount) {
      await tx.customerAccountTransaction.updateMany({
        where: { businessId, customerAccountId: sourceAccount.id },
        data: { customerAccountId: targetAccount.id },
      });
      await tx.customerAccount.delete({ where: { id: sourceAccount.id } });
    } else if (sourceAccount && !targetAccount) {
      await tx.customerAccount.update({
        where: { id: sourceAccount.id },
        data: { customerId: targetCustomer.id },
      });
    }

    const [otherBranchOrder, otherBranchAccount, externalShare] = await Promise.all([
      tx.order.findFirst({
        where: { businessId, customerId: customer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.customerAccount.findFirst({
        where: { businessId, customerId: customer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      customer.ownerBranchId === branchId
        ? tx.branchResourceShare.findFirst({
            where: {
              businessId,
              ownerBranchId: branchId,
              targetBranchId: { not: branchId },
              resourceType: "CUSTOMERS",
              OR: [{ resourceId: null }, { resourceId: customer.id }],
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    const sourceDeactivated = customer.ownerBranchId === branchId &&
      !otherBranchOrder && !otherBranchAccount && !externalShare;

    if (sourceDeactivated) {
      await tx.customer.updateMany({
        where: { id: customer.id, businessId, ownerBranchId: branchId },
        data: { isActive: false },
      });
    }

    return {
      customer,
      targetCustomer,
      mergedOrderCount: orders.length,
      mergedOrders: orders,
      sourceDeactivated,
    };
  });
}
