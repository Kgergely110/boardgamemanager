import { Request, Response, NextFunction } from "express";
import { verifyToken, JWTPayload } from "../lib/auth.js";
import { sendApiError } from "../lib/http.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: JWTPayload;
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendApiError(res, 401, "Missing authorization token");
    return;
  }

  try {
    req.user = verifyToken(authHeader.slice("Bearer ".length));
  } catch {
    sendApiError(res, 401, "Invalid or expired token");
    return;
  }
  next();
}
