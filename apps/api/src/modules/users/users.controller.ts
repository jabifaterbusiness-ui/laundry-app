import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { requireReason } from "../../lib/reason.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userActionReasonSchema,
  userIdParamSchema,
} from "./users.validation.js";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  setUserActiveStatus,
  updateUser,
} from "./users.service.js";

function businessContext(req: Request) {
  if (!req.user?.businessId) {
    throw new AppError("Business context required", 403);
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

export async function list(req: Request, res: Response) {
  const businessId = businessContext(req);
  const query = listUsersQuerySchema.parse(req.query);

  const users = await listUsers(businessId, {
    status: query.status,
    ...(query.search !== undefined && { search: query.search }),
    ...(query.role !== undefined && { role: query.role }),
  });

  res.status(200).json(users);
}

export async function get(req: Request, res: Response) {
  const businessId = businessContext(req);
  const { userId } = userIdParamSchema.parse(req.params);

  res.status(200).json(await getUser(userId, businessId));
}

export async function create(req: Request, res: Response) {
  const businessId = businessContext(req);
  const input = createUserSchema.parse(req.body);

  res.status(201).json(
    await createUser(
      {
        ...input,
      },
      {
        businessId,
        ...actor(req),
      },
    ),
  );
}

export async function update(req: Request, res: Response) {
  const businessId = businessContext(req);
  const { userId } = userIdParamSchema.parse(req.params);
  const input = updateUserSchema.parse(req.body);

  const updateInput = {
    ...(input.fullName !== undefined && { fullName: input.fullName }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.password !== undefined && { password: input.password }),
    ...(input.role !== undefined && { role: input.role }),
        ...(input.branchIds !== undefined && { branchIds: input.branchIds }),
  };

  res.status(200).json(
    await updateUser(userId, updateInput, {
      businessId,
      ...actor(req),
    }),
  );
}

export async function activate(req: Request, res: Response) {
  const businessId = businessContext(req);
  const { userId } = userIdParamSchema.parse(req.params);

  res.status(200).json(
    await setUserActiveStatus(userId, true, {
      businessId,
      ...actor(req),
    }),
  );
}

export async function deactivate(req: Request, res: Response) {
  const businessId = businessContext(req);
  const { userId } = userIdParamSchema.parse(req.params);
  const { reason } = userActionReasonSchema.parse(req.body);

  res.status(200).json(
    await setUserActiveStatus(userId, false, {
      businessId,
      ...actor(req),
      reason: requireReason(reason),
    }),
  );
}


export async function remove(req: Request, res: Response) {
  const businessId = businessContext(req);
  const { userId } = userIdParamSchema.parse(req.params);
  const { reason } = userActionReasonSchema.parse(req.body);

  res.status(200).json(
    await deleteUser(userId, {
      businessId,
      ...actor(req),
      reason: requireReason(reason),
    }),
  );
}
