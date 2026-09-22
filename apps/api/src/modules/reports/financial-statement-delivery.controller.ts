import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import {
  createFinancialStatementRecipientSchema,
  financialStatementConfigSchema,
  financialStatementRecipientIdParamSchema,
  updateFinancialStatementRecipientSchema,
} from "./financial-statement-delivery.validation.js";
import {
  createFinancialStatementRecipient,
  getFinancialStatementConfig,
  listFinancialStatementRecipients,
  removeFinancialStatementRecipient,
  updateFinancialStatementConfig,
  updateFinancialStatementRecipient,
} from "./financial-statement-delivery.service.js";

function requireBusinessId(req: Request) {
  if (!req.user?.businessId) {
    throw new AppError("This action requires an account scoped to a business", 403);
  }

  return req.user.businessId;
}

function actor(req: Request) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  return {
    actorUserId: req.user.id,
    correlationId: req.correlationId ?? null,
  };
}

export async function getStatementConfig(req: Request, res: Response) {
  res.status(200).json(
    await getFinancialStatementConfig(requireBusinessId(req)),
  );
}

export async function updateStatementConfig(req: Request, res: Response) {
  const input = financialStatementConfigSchema.parse(req.body);

  res.status(200).json(
    await updateFinancialStatementConfig(
      requireBusinessId(req),
      input,
      actor(req).actorUserId,
      actor(req).correlationId,
    ),
  );
}

export async function listStatementRecipients(
  req: Request,
  res: Response,
) {
  res.status(200).json(
    await listFinancialStatementRecipients(requireBusinessId(req)),
  );
}

export async function createStatementRecipient(
  req: Request,
  res: Response,
) {
  const input = createFinancialStatementRecipientSchema.parse(req.body);
  const requestActor = actor(req);

  res.status(201).json(
    await createFinancialStatementRecipient(
      requireBusinessId(req),
      input,
      requestActor.actorUserId,
      requestActor.correlationId,
    ),
  );
}

export async function updateStatementRecipient(
  req: Request,
  res: Response,
) {
  const { recipientId } =
    financialStatementRecipientIdParamSchema.parse(req.params);
  const input = updateFinancialStatementRecipientSchema.parse(req.body);
  const requestActor = actor(req);

  res.status(200).json(
    await updateFinancialStatementRecipient(
      requireBusinessId(req),
      recipientId,
      input,
      requestActor.actorUserId,
      requestActor.correlationId,
    ),
  );
}

export async function removeStatementRecipient(
  req: Request,
  res: Response,
) {
  const { recipientId } =
    financialStatementRecipientIdParamSchema.parse(req.params);
  const requestActor = actor(req);

  res.status(200).json(
    await removeFinancialStatementRecipient(
      requireBusinessId(req),
      recipientId,
      requestActor.actorUserId,
      requestActor.correlationId,
    ),
  );
}
