import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

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
 * Customer accounts are business-wide by design. Every branch sees the
 * same balance and complete ledger; the branchId on each transaction records
 * where that transaction originated, not ownership of a separate account.
 */
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
        { ownerBranchId: null },
        { ownerBranchId: { in: customerScope.ownerBranchIds } },
        { id: { in: customerScope.resourceIds } },
      ],
    },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  return db.customerAccount.upsert({
    where: {
      customerId_branchId: { customerId, branchId: null },
    },
    create: {
      businessId,
      customerId,
      branchId: null,
    },
    update: {},
    include: {
      transactions: { orderBy: { createdAt: "asc" } },
    },
  });
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
        { ownerBranchId: null },
        { ownerBranchId: { in: customerScope.ownerBranchIds } },
        { id: { in: customerScope.resourceIds } },
      ],
    },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  const account = await prisma.customerAccount.findFirst({
    where: {
      customerId,
      businessId,
      branchId: null,
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
      branchId: null,
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
  });
}
