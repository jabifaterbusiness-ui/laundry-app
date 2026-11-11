import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { assertBranchResourceWriteAccess, getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

type CustomerAccountDb = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function calculateBalance(
  transactions: Array<{
    type: "CREDIT" | "DEBIT" | "ADJUSTMENT";
    amount: number;
  }>,
) {
  return transactions.reduce((balance, transaction) => {
    switch (transaction.type) {
      case "CREDIT":
        return balance + transaction.amount;
      case "DEBIT":
        return balance - transaction.amount;
      case "ADJUSTMENT":
        return balance + transaction.amount;
      default:
        return balance;
    }
  }, 0);
}

/**
 * A branch-level customer sharing rule can partition a customer's ledger.
 * Existing and unconfigured rules remain SHARED for backward compatibility.
 */
async function resolveCustomerAccountBranchId(input: {
  businessId: string;
  customerId: string;
  ownerBranchId: string | null;
  branchId: string;
  db: CustomerAccountDb;
}) {
  if (!input.ownerBranchId || input.ownerBranchId === input.branchId) return null;
  const share = await input.db.branchResourceShare.findFirst({
    where: {
      businessId: input.businessId,
      ownerBranchId: input.ownerBranchId,
      targetBranchId: input.branchId,
      resourceType: "CUSTOMERS",
      resourceId: null,
      userId: null,
    },
    select: { customerAccountMode: true },
  });
  return share?.customerAccountMode === "SEPARATE" ? input.branchId : null;
}
export async function getOrCreateCustomerAccount(
  customerId: string,
  businessId: string,
  branchId: string,
  userId: string,
  db: CustomerAccountDb = prisma,
) {
  const customerScope = await getBranchResourceScope(
    { businessId, branchId, userId, resourceType: "CUSTOMERS" },
    db,
  );
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      businessId,
      OR: [
        { ownerBranchId: { in: customerScope.ownerBranchIds } },
        { id: { in: customerScope.resourceIds } },
      ],
    },
    select: { id: true, ownerBranchId: true },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  // Account balances are shared business-wide, but a READ-only customer
  // share must not allow this branch to create or fund the shared account.
  await assertBranchResourceWriteAccess({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
    ownerBranchId: customer.ownerBranchId,
    resourceId: customer.id,
  }, db);

  const accountBranchId = await resolveCustomerAccountBranchId({
    businessId,
    customerId,
    ownerBranchId: customer.ownerBranchId,
    branchId,
    db,
  });
  const where = { businessId, customerId, branchId: accountBranchId };
  const include = {
    transactions: { orderBy: { createdAt: "asc" as const } },
  };
  const existing = await db.customerAccount.findFirst({ where, include });
  if (existing) return existing;

  try {
    return await db.customerAccount.create({
      data: { businessId, customerId, branchId: accountBranchId },
      include,
    });
  } catch (error) {
    // The partial unique index for the single shared account per customer
    // protects concurrent first-use requests. Re-read after a uniqueness race.
    const isUniqueConflict =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002";
    if (!isUniqueConflict) throw error;

    const createdByAnotherRequest = await db.customerAccount.findFirst({
      where,
      include,
    });
    if (createdByAnotherRequest) return createdByAnotherRequest;
    throw error;
  }
}

export async function getCustomerAccount(
  customerId: string,
  businessId: string,
  branchId: string,
  userId: string,
) {
  const customerScope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
  });
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      businessId,
      OR: [
        { ownerBranchId: { in: customerScope.ownerBranchIds } },
        { id: { in: customerScope.resourceIds } },
      ],
    },
    select: { id: true, ownerBranchId: true },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  const accountBranchId = await resolveCustomerAccountBranchId({
    businessId,
    customerId,
    ownerBranchId: customer.ownerBranchId,
    branchId,
    db: prisma,
  });
  const account = await prisma.customerAccount.findFirst({
    where: {
      customerId,
      businessId,
      branchId: accountBranchId,
    },
    include: {
      transactions: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!account) {
    return {
      id: null,
      customerId,
      businessId,
      branchId: accountBranchId,
      balance: 0,
      transactions: [],
    };
  }

  return {
    ...account,
    balance: calculateBalance(account.transactions),
  };
}

export async function fundCustomerAccount(data: {
  customerId: string;
  businessId: string;
  branchId: string;
  userId: string;
  amount: number;
  note?: string;
}) {
  if (!Number.isInteger(data.amount) || data.amount <= 0) {
    throw new AppError(
      "Account funding amount must be a positive whole number",
      422,
    );
  }

  return prisma.$transaction(async (tx) => {
    const account = await getOrCreateCustomerAccount(
      data.customerId,
      data.businessId,
      data.branchId,
      data.userId,
      tx,
    );

    return tx.customerAccountTransaction.create({
      data: {
        businessId: data.businessId,
        branchId: data.branchId,
        customerAccountId: account.id,
        type: "CREDIT",
        amount: data.amount,
        ...(data.note !== undefined && {
          note: data.note,
        }),
      },
    });
  }, { isolationLevel: "Serializable" });
}
