import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

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

export async function getOrCreateCustomerAccount(
  customerId: string,
  businessId: string,
  db: CustomerAccountDb = prisma,
) {
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      businessId,
    },
    select: {
      id: true,
    },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  return db.customerAccount.upsert({
    where: {
      customerId,
    },
    create: {
      businessId,
      customerId,
    },
    update: {},
    include: {
      transactions: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function getCustomerAccount(
  customerId: string,
  businessId: string,
) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      businessId,
    },
    select: {
      id: true,
    },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  const account = await prisma.customerAccount.findFirst({
    where: {
      customerId,
      businessId,
    },
    include: {
      transactions: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!account) {
    return {
      id: null,
      customerId,
      businessId,
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
      tx,
    );

    const transaction = await tx.customerAccountTransaction.create({
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

    return transaction;
  });
}
