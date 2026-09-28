import type { Request, Response } from "express";
import { businessRegistrationSchema } from "./business-registration.validation.js";
import {
  getBusinessRegistrationStatus,
  registerBusiness,
} from "./business-registration.service.js";

export async function status(_req: Request, res: Response) {
  res.status(200).json(await getBusinessRegistrationStatus());
}

export async function register(req: Request, res: Response) {
  const input = businessRegistrationSchema.parse(req.body);
  res.status(201).json(await registerBusiness(input));
}
