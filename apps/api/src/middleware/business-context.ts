import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { AppError } from "./error-handler.js";

export async function requireBusinessContext(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }

  if (!req.user.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  const business = await prisma.business.findFirst({
    where: {
      id: req.user.businessId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    throw new AppError("Business account not found or inactive", 403);
  }

  next();
}
