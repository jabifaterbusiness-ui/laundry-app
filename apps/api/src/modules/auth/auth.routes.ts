import { Router } from "express";
import { forgotPassword, login, logout, me, refresh, resetPasswordController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(login));
authRouter.post("/forgot-password", asyncHandler(forgotPassword));
authRouter.post("/reset-password", asyncHandler(resetPasswordController));
authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", requireAuth, asyncHandler(me));
