import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import type {
  CreateFinancialStatementRecipientInput,
  FinancialStatementConfigInput,
  UpdateFinancialStatementRecipientInput,
} from "./financial-statement-delivery.validation.js";

const CONFIG_SELECT = {
  id: true,
  businessId: true,
  enabled: true,
  dayOfMonth: true,
  hour: true,
  minute: true,
  emailEnabled: true,
  whatsappEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

const RECIPIENT_SELECT = {
  id: true,
  businessId: true,
  userId: true,
  whatsappNumber: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  },
} as const;

function assertBusinessUser(user: {
  id: string;
  businessId: string | null;
  isActive: boolean;
} | null, businessId: string) {
  if (!user || user.businessId !== businessId) {
    throw new AppError("User does not belong to this business", 404);
  }

  if (!user.isActive) {
    throw new AppError("Cannot configure an inactive user as a statement recipient", 400);
  }
}

export async function getFinancialStatementConfig(businessId: string) {
  const config = await prisma.financialStatementConfig.findUnique({
    where: { businessId },
    select: CONFIG_SELECT,
  });

  if (config) {
    return config;
  }

  return {
    id: null,
    businessId,
    enabled: true,
    dayOfMonth: 1,
    hour: 8,
    minute: 0,
    emailEnabled: true,
    whatsappEnabled: false,
    createdAt: null,
    updatedAt: null,
  };
}

export async function updateFinancialStatementConfig(
  businessId: string,
  input: FinancialStatementConfigInput,
  actorUserId: string,
  correlationId: string | null,
) {
  const config = await prisma.financialStatementConfig.upsert({
    where: { businessId },
    create: {
      businessId,
      ...input,
    },
    update: input,
    select: CONFIG_SELECT,
  });

  await recordAuditEvent({
    action: "financial_statement.config.updated",
    entityType: "FinancialStatementConfig",
    entityId: config.id,
    businessId,
    actorUserId,
    correlationId,
    metadata: {
      enabled: config.enabled,
      dayOfMonth: config.dayOfMonth,
      hour: config.hour,
      minute: config.minute,
      emailEnabled: config.emailEnabled,
      whatsappEnabled: config.whatsappEnabled,
    },
  });

  return config;
}

export async function listFinancialStatementRecipients(
  businessId: string,
) {
  return prisma.financialStatementRecipient.findMany({
    where: { businessId },
    orderBy: [
      { enabled: "desc" },
      { createdAt: "asc" },
    ],
    select: RECIPIENT_SELECT,
  });
}

export async function createFinancialStatementRecipient(
  businessId: string,
  input: CreateFinancialStatementRecipientInput,
  actorUserId: string,
  correlationId: string | null,
) {
  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      businessId,
    },
    select: {
      id: true,
      businessId: true,
      isActive: true,
    },
  });

  assertBusinessUser(user, businessId);

  const existing = await prisma.financialStatementRecipient.findUnique({
    where: {
      businessId_userId: {
        businessId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError("User is already a financial statement recipient", 409);
  }

  const recipient = await prisma.financialStatementRecipient.create({
    data: {
      businessId,
      userId: input.userId,
      ...(input.whatsappNumber !== undefined
        ? { whatsappNumber: input.whatsappNumber }
        : {}),
    },
    select: RECIPIENT_SELECT,
  });

  await recordAuditEvent({
    action: "financial_statement.recipient.created",
    entityType: "FinancialStatementRecipient",
    entityId: recipient.id,
    businessId,
    actorUserId,
    correlationId,
    metadata: {
      recipientUserId: recipient.userId,
      whatsappConfigured: Boolean(recipient.whatsappNumber),
    },
  });

  return recipient;
}

export async function updateFinancialStatementRecipient(
  businessId: string,
  recipientId: string,
  input: UpdateFinancialStatementRecipientInput,
  actorUserId: string,
  correlationId: string | null,
) {
  const existing = await prisma.financialStatementRecipient.findFirst({
    where: {
      id: recipientId,
      businessId,
    },
    select: {
      id: true,
      userId: true,
      enabled: true,
      whatsappNumber: true,
      user: {
        select: {
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError("Financial statement recipient not found", 404);
  }

  if (
    existing.user.isActive &&
    existing.user.role === "BUSINESS_OWNER" &&
    input.enabled === false
  ) {
    throw new AppError(
      "An active business owner must remain a financial statement recipient",
      409,
    );
  }

  const recipient = await prisma.financialStatementRecipient.update({
    where: { id: existing.id },
    data: {
      ...(input.whatsappNumber !== undefined
        ? { whatsappNumber: input.whatsappNumber }
        : {}),
      ...(input.enabled !== undefined
        ? { enabled: input.enabled }
        : {}),
    },
    select: RECIPIENT_SELECT,
  });

  await recordAuditEvent({
    action: "financial_statement.recipient.updated",
    entityType: "FinancialStatementRecipient",
    entityId: recipient.id,
    businessId,
    actorUserId,
    correlationId,
    metadata: {
      recipientUserId: recipient.userId,
      enabled: recipient.enabled,
      whatsappConfigured: Boolean(recipient.whatsappNumber),
    },
  });

  return recipient;
}

export async function removeFinancialStatementRecipient(
  businessId: string,
  recipientId: string,
  actorUserId: string,
  correlationId: string | null,
) {
  const existing = await prisma.financialStatementRecipient.findFirst({
    where: {
      id: recipientId,
      businessId,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError("Financial statement recipient not found", 404);
  }

  if (existing.user.isActive && existing.user.role === "BUSINESS_OWNER") {
    throw new AppError(
      "An active business owner must remain a financial statement recipient",
      409,
    );
  }

  await prisma.financialStatementRecipient.delete({
    where: { id: existing.id },
  });

  await recordAuditEvent({
    action: "financial_statement.recipient.removed",
    entityType: "FinancialStatementRecipient",
    entityId: existing.id,
    businessId,
    actorUserId,
    correlationId,
    metadata: {
      recipientUserId: existing.userId,
    },
  });

  return { removed: true };
}
