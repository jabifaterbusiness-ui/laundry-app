import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  register,
  status,
} from "./business-registration.controller.js";

export const businessRegistrationRouter = Router();

businessRegistrationRouter.get("/status", asyncHandler(status));
businessRegistrationRouter.post("/", asyncHandler(register));
