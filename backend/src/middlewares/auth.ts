import { Request, Response, NextFunction } from "express";
import { verifyToken, JWTPayload } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  try {
    req.user = verifyToken(authHeader.slice("Bearer ".length));
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}
