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
  status: "active" | "dormant" | "blocked" | "blacklisted" | "merged" | "inactive" | "all";
}

export async function listCustomers(params: ListParams) {
  const { businessId, branchId, userId, page, pageSize, search, status } = params;
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMERS" });

  const where: Prisma.CustomerWhereInput = {
    businessId,
    OR: [
      
      { ownerBranchId: { in: scope.ownerBranchIds } },
      { id: { in: scope.resourceIds } },
    ],
  };

  if (status !== "all") {
    if (status === "inactive") {
      where.isActive = false;
      where.lifecycleStatus = { not: "MERGED" };
    } else {
      const lifecycleStatus =
        status === "active"
          ? "ACTIVE"
          : status === "dormant"
            ? "DORMANT"
            : status === "blocked"
              ? "BLOCKED"
              : status === "merged"
                ? "MERGED"
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
      include: {
        ownerBranch: { select: { id: true, name: true } },
        mergedIntoCustomer: { select: { id: true, name: true } },
      },
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
      OR: [{ ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }],
    },
    include: {
      ownerBranch: { select: { id: true, name: true } },
      mergedIntoCustomer: { select: { id: true, name: true } },
    },
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
      OR: [{ ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }],
      phone: normalizedPhone,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, phone: true },
  });
}

export async function listUnassignedLegacyCustomers(input: {
  businessId: string;
  page: number;
  pageSize: number;
  search?: string;
}) {
  const where: Prisma.CustomerWhereInput = {
    businessId: input.businessId,
    ownerBranchId: null,
    ...(input.search ? {
      OR: [
        { name: { contains: input.search, mode: "insensitive" } },
        { phone: { contains: input.search } },
        { email: { contains: input.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true, address: true,
        lifecycleStatus: true, createdAt: true, updatedAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);
  return {
    data,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function assignLegacyCustomerOwnerBranch(input: {
  customerId: string;
  businessId: string;
  branchId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, businessId: input.businessId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new AppError("Choose an active branch belonging to this business", 422);

    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId, ownerBranchId: null },
      select: { id: true },
    });
    if (!customer) {
      const existing = await tx.customer.findFirst({
        where: { id: input.customerId, businessId: input.businessId },
        select: { id: true, ownerBranchId: true },
      });
      if (!existing) throw new AppError("Customer not found", 404);
      throw new AppError("This customer has already been assigned to a branch", 409);
    }

    const updated = await tx.customer.updateMany({
      where: { id: customer.id, businessId: input.businessId, ownerBranchId: null },
      data: { ownerBranchId: branch.id },
    });
    if (!updated.count) throw new AppError("Customer ownership changed. Refresh the review list and try again.", 409);

    return tx.customer.findFirstOrThrow({
      where: { id: customer.id, businessId: input.businessId },
      include: { ownerBranch: { select: { id: true, name: true } } },
    });
  }, { isolationLevel: "Serializable" });
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
  if (db === prisma) {
    return prisma.$transaction(
      (tx) => updateCustomerWithDb(id, businessId, branchId, userId, data, tx),
      { isolationLevel: "Serializable" },
    );
  }

  return updateCustomerWithDb(id, businessId, branchId, userId, data, db);
}

async function updateCustomerWithDb(
  id: string,
  businessId: string,
  branchId: string,
  userId: string,
  data: UpdateCustomerData,
  db: CustomerDb,
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

  const phoneChanged = data.phone !== undefined && data.phone !== existing.phone;
  if (phoneChanged && data.whatsappOptIn !== true) {
    // Consent belongs to the phone number that was originally verified.
    // A changed destination must opt in again before business-initiated sends.
    patch.whatsappOptIn = false;
    // Preserve the original consent timestamp/source and any prior opt-out
    // timestamp as historical evidence; only invalidate its current validity.
  }

  if (data.whatsappOptIn === true && (!existing.whatsappOptIn || phoneChanged)) {
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
      where: { id, businessId, OR: [{ ownerBranchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] },
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
  }, { isolationLevel: "Serializable" });
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
  if (customer.lifecycleStatus === "MERGED") {
    throw new AppError("Merged customer archives are read-only. Use the destination customer instead.", 409);
  }
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
  customer: { id: string; ownerBranchId: string | null },
  businessId: string,
  branchId: string,
) {
  // Separate-account mode is configured by an all-customer share from the
  // owning branch to this branch. Individual customer shares and legacy
  // business-wide customers continue to use the shared ledger.
  const sharingRule = customer.ownerBranchId && customer.ownerBranchId !== branchId
    ? await tx.branchResourceShare.findFirst({
        where: {
          businessId,
          ownerBranchId: customer.ownerBranchId,
          targetBranchId: branchId,
          resourceType: "CUSTOMERS",
          resourceId: null,
          userId: null,
        },
        select: { customerAccountMode: true },
      })
    : null;
  const accountBranchId = sharingRule?.customerAccountMode === "SEPARATE" ? branchId : null;
  const account = await tx.customerAccount.findFirst({
    where: { customerId: customer.id, businessId, branchId: accountBranchId },
    select: { id: true, branchId: true },
  });
  return { account, accountBranchId };
}

/**
 * Transfers the selected branch's orders and that branch's configured
 * customer account ledger. Customer visibility and edit access are checked for both
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
      tx, customer, businessId, branchId,
    );
    const targetAccount = await getEditableCustomerAccountForBranch(
      tx, targetCustomer, businessId, branchId,
    );
    if (sourceAccount.account && sourceAccount.accountBranchId !== targetAccount.accountBranchId) {
      throw new AppError("Customer accounts belong to different branches and cannot be transferred together", 409);
    }
    if (sourceAccount.account && targetAccount.account) {
      await tx.customerAccountTransaction.updateMany({
        where: { businessId, customerAccountId: sourceAccount.account.id },
        data: { customerAccountId: targetAccount.account.id },
      });
      await tx.customerAccount.delete({ where: { id: sourceAccount.account.id } });
    } else if (sourceAccount.account && !targetAccount.account) {
      await tx.customerAccount.update({
        where: { id: sourceAccount.account.id },
        data: { customerId: targetCustomer.id },
      });
    }

    return {
      customer,
      targetCustomer,
      transferredOrderCount: orders.length,
      transferredOrders: orders,
    };
  }, { isolationLevel: "Serializable" });
}

/**
 * Consolidates all supported customer-linked records inside the selected branch.
 * Historical order/payment/delivery records retain their original timestamps and
 * values; the source customer remains as a MERGED archive linked to its target.
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

    if (customer.ownerBranchId !== branchId || targetCustomer.ownerBranchId !== branchId) {
      throw new AppError("Both customers must belong to the currently selected branch to be merged", 409);
    }
    if (customer.lifecycleStatus === "MERGED") {
      throw new AppError("This customer has already been merged into another account", 409);
    }
    if (targetCustomer.lifecycleStatus === "MERGED") {
      throw new AppError("Choose an active customer record, not an already merged account", 409);
    }

    // Do not consolidate a record that is still referenced by another branch.
    // The check is inside the serializable transaction and happens before any
    // source-linked record is changed.
    const [
      otherBranchOrder,
      otherBranchAccount,
      otherBranchServicePrice,
      otherBranchDiscount,
      otherBranchTargetOrder,
      otherBranchTargetAccount,
      otherBranchTargetServicePrice,
      otherBranchTargetDiscount,
      externalShare,
      targetExternalShare,
    ] = await Promise.all([
      tx.order.findFirst({
        where: { businessId, customerId: customer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.customerAccount.findFirst({
        where: { businessId, customerId: customer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.customerServicePrice.findFirst({
        where: { businessId, customerId: customer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.priceAdjustment.findFirst({
        where: { businessId, customerId: customer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.order.findFirst({
        where: { businessId, customerId: targetCustomer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.customerAccount.findFirst({
        where: { businessId, customerId: targetCustomer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.customerServicePrice.findFirst({
        where: { businessId, customerId: targetCustomer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.priceAdjustment.findFirst({
        where: { businessId, customerId: targetCustomer.id, branchId: { not: branchId } },
        select: { id: true },
      }),
      tx.branchResourceShare.findFirst({
        where: {
          businessId,
          ownerBranchId: branchId,
          targetBranchId: { not: branchId },
          resourceType: "CUSTOMERS",
          OR: [{ resourceId: null }, { resourceId: customer.id }],
        },
        select: { id: true },
      }),
      tx.branchResourceShare.findFirst({
        where: {
          businessId,
          ownerBranchId: branchId,
          targetBranchId: { not: branchId },
          resourceType: "CUSTOMERS",
          OR: [{ resourceId: null }, { resourceId: targetCustomer.id }],
        },
        select: { id: true },
      }),
    ]);
    if (
      otherBranchOrder ||
      otherBranchAccount ||
      otherBranchServicePrice ||
      otherBranchDiscount ||
      otherBranchTargetOrder ||
      otherBranchTargetAccount ||
      otherBranchTargetServicePrice ||
      otherBranchTargetDiscount ||
      externalShare ||
      targetExternalShare
    ) {
      throw new AppError(
        "Customer records have links or records in another branch and cannot be merged here",
        409,
      );
    }

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

    // Merge branch-scoped price overrides. If the target already has an
    // override for the same service/branch, retain the source row on the
    // archived customer as a conflict snapshot; otherwise reassign it intact.
    const sourcePrices = await tx.customerServicePrice.findMany({
      where: { businessId, customerId: customer.id },
    });
    let movedServicePriceCount = 0;
    let retainedServicePriceConflictCount = 0;
    for (const sourcePrice of sourcePrices) {
      const targetPrice = await tx.customerServicePrice.findFirst({
        where: {
          businessId,
          customerId: targetCustomer.id,
          serviceId: sourcePrice.serviceId,
          branchId: sourcePrice.branchId,
        },
        select: { id: true },
      });
      if (!targetPrice) {
        await tx.customerServicePrice.update({
          where: { id: sourcePrice.id },
          data: { customerId: targetCustomer.id },
        });
        movedServicePriceCount += 1;
      } else {
        retainedServicePriceConflictCount += 1;
      }
    }

    // Preserve customer-group membership without violating the unique
    // (groupId, customerId) key when both records belong to the same group.
    const sourceGroupMemberships = await tx.customerGroupMember.findMany({
      where: { businessId, customerId: customer.id },
      select: { id: true, groupId: true, createdAt: true },
    });
    for (const membership of sourceGroupMemberships) {
      const existing = await tx.customerGroupMember.findFirst({
        where: { groupId: membership.groupId, customerId: targetCustomer.id },
        select: { id: true, createdAt: true },
      });
      if (existing) {
        await tx.customerGroupMember.update({
          where: { id: existing.id },
          data: { createdAt: membership.createdAt < existing.createdAt ? membership.createdAt : existing.createdAt },
        });
        await tx.customerGroupMember.delete({ where: { id: membership.id } });
      } else {
        await tx.customerGroupMember.update({
          where: { id: membership.id },
          data: { customerId: targetCustomer.id },
        });
      }
    }

    // Campaign recipient uniqueness is also per campaign/customer. Keep the
    // existing target recipient when both accounts were already included.
    const sourceRecipients = await tx.announcementRecipient.findMany({
      where: { customerId: customer.id },
      select: { id: true, campaignId: true, createdAt: true },
    });
    for (const recipient of sourceRecipients) {
      const existing = await tx.announcementRecipient.findFirst({
        where: { campaignId: recipient.campaignId, customerId: targetCustomer.id },
        select: { id: true, createdAt: true },
      });
      if (existing) {
        await tx.announcementRecipient.update({
          where: { id: existing.id },
          data: { createdAt: recipient.createdAt < existing.createdAt ? recipient.createdAt : existing.createdAt },
        });
        await tx.announcementRecipient.delete({ where: { id: recipient.id } });
      } else {
        await tx.announcementRecipient.update({
          where: { id: recipient.id },
          data: { customerId: targetCustomer.id },
        });
      }
    }

    const sourceAccount = await getEditableCustomerAccountForBranch(
      tx, customer, businessId, branchId,
    );
    const targetAccount = await getEditableCustomerAccountForBranch(
      tx, targetCustomer, businessId, branchId,
    );
    if (sourceAccount.account && sourceAccount.accountBranchId !== targetAccount.accountBranchId) {
      throw new AppError("Customer accounts belong to different branches and cannot be merged together", 409);
    }
    if (sourceAccount.account && targetAccount.account) {
      await tx.customerAccountTransaction.updateMany({
        where: { businessId, customerAccountId: sourceAccount.account.id },
        data: { customerAccountId: targetAccount.account.id },
      });
      await tx.customerAccount.delete({ where: { id: sourceAccount.account.id } });
    } else if (sourceAccount.account && !targetAccount.account) {
      await tx.customerAccount.update({
        where: { id: sourceAccount.account.id },
        data: { customerId: targetCustomer.id },
      });
    }

    // Delivery rows are historical records, not disposable notifications.
    // Repoint them to the canonical customer while retaining all delivery
    // timestamps, destinations, statuses, provider IDs and retry metadata.
    await tx.communicationDelivery.updateMany({
      where: { businessId, customerId: customer.id },
      data: { customerId: targetCustomer.id },
    });
    await tx.orderStatusNotificationDelivery.updateMany({
      where: { businessId, customerId: customer.id },
      data: { customerId: targetCustomer.id },
    });
    await tx.priceAdjustment.updateMany({
      where: { businessId, customerId: customer.id },
      data: { customerId: targetCustomer.id },
    });

    // Retain the source profile as the archive, while filling missing target
    // profile fields from it. Explicit target contact/consent choices win.
    const targetProfileUpdate: Prisma.CustomerUpdateInput = {};
    if (!targetCustomer.email && customer.email) targetProfileUpdate.email = customer.email;
    if (!targetCustomer.address && customer.address) targetProfileUpdate.address = customer.address;
    if (!targetCustomer.notes && customer.notes) targetProfileUpdate.notes = customer.notes;
    else if (customer.notes?.trim() && targetCustomer.notes?.trim() !== customer.notes.trim()) {
      targetProfileUpdate.notes = [targetCustomer.notes?.trim(), customer.notes.trim()]
        .filter(Boolean).join("\n\n[Notes retained from merged customer]\n");
    }
    if (!targetCustomer.customerInstructions && customer.customerInstructions) {
      targetProfileUpdate.customerInstructions = customer.customerInstructions;
    } else if (
      customer.customerInstructions?.trim() &&
      targetCustomer.customerInstructions?.trim() !== customer.customerInstructions.trim()
    ) {
      targetProfileUpdate.customerInstructions = [
        targetCustomer.customerInstructions?.trim(),
        customer.customerInstructions.trim(),
      ].filter(Boolean).join("\n\n[Instructions retained from merged customer]\n");
    }
    if (
      !targetCustomer.whatsappOptIn &&
      !targetCustomer.whatsappOptOutAt &&
      customer.whatsappOptIn
    ) {
      targetProfileUpdate.whatsappOptIn = true;
      targetProfileUpdate.whatsappOptInAt = customer.whatsappOptInAt;
      targetProfileUpdate.whatsappOptInSource = customer.whatsappOptInSource;
    }
    if (Object.keys(targetProfileUpdate).length > 0) {
      await tx.customer.update({
        where: { id: targetCustomer.id },
        data: targetProfileUpdate,
      });
    }

    const previousStatus = customer.lifecycleStatus;
    const statusChangedAt = new Date();
    const archiveResult = await tx.customer.updateMany({
      where: {
        id: customer.id,
        businessId,
        ownerBranchId: branchId,
        lifecycleStatus: { not: "MERGED" },
      },
      data: {
        isActive: false,
        lifecycleStatus: "MERGED",
        statusReason: `Merged into customer ${targetCustomer.id}`,
        statusChangedAt,
        statusChangedById: userId,
        mergedIntoCustomerId: targetCustomer.id,
      },
    });
    if (archiveResult.count !== 1) {
      throw new AppError("Source customer changed during merge. Refresh and try again.", 409);
    }
    await tx.customerStatusHistory.create({
      data: {
        customerId: customer.id,
        businessId,
        previousStatus,
        newStatus: "MERGED",
        reason: `Merged into customer ${targetCustomer.id}`,
        changedById: userId,
      },
    });

    const archivedCustomer = {
      ...customer,
      isActive: false,
      lifecycleStatus: "MERGED" as const,
      statusReason: `Merged into customer ${targetCustomer.id}`,
      statusChangedAt,
      statusChangedById: userId,
      mergedIntoCustomerId: targetCustomer.id,
    };

    return {
      customer: archivedCustomer,
      targetCustomer,
      mergedOrderCount: orders.length,
      mergedOrders: orders,
      mergedServicePriceCount: movedServicePriceCount,
      retainedServicePriceConflictCount,
      mergedGroupMembershipCount: sourceGroupMemberships.length,
      mergedAnnouncementRecipientCount: sourceRecipients.length,
      sourceDeactivated: true,
      sourceArchived: true,
      mergedIntoCustomerId: targetCustomer.id,
    };
  }, { isolationLevel: "Serializable" });
}

/**
 * Atomically assigns a selected set of unassigned legacy customers, or
 * every currently unassigned legacy customer, to one active branch.
 * The tenant and unassigned predicates are part of the UPDATE itself.
 */
export async function assignLegacyCustomerOwnersBulk(input: {
  businessId: string;
  branchId: string;
  customerIds?: string[];
  all?: boolean;
}) {
  const customerIds = input.customerIds ? [...new Set(input.customerIds)] : undefined;
  if (!input.all && (!customerIds || customerIds.length === 0)) {
    throw new AppError("Select at least one customer or choose all unassigned customers", 422);
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, businessId: input.businessId, isActive: true },
      select: { id: true, name: true },
    });
    if (!branch) throw new AppError("Choose an active branch belonging to this business", 422);

    const result = await tx.customer.updateMany({
      where: {
        businessId: input.businessId,
        ownerBranchId: null,
        ...(input.all ? {} : { id: { in: customerIds! } }),
      },
      data: { ownerBranchId: branch.id },
    });

    if (!input.all && result.count !== customerIds!.length) {
      throw new AppError(
        "One or more selected customers are no longer unassigned. Refresh the review queue and try again; no customers were changed.",
        409,
      );
    }

    return {
      assignedCount: result.count,
      branchId: branch.id,
      branchName: branch.name,
      assignmentScope: input.all ? "ALL_UNASSIGNED" as const : "SELECTED" as const,
    };
  }, { isolationLevel: "Serializable" });
}
