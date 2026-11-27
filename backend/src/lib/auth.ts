import jwt from "jsonwebtoken";

export interface JWTPayload {
  playerId: string;
  username: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return secret;
}

export function assertJwtConfiguration(): void {
  getJwtSecret();
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: 60 * 60 * 24 * 7,
  });
}

export function verifyToken(token: string): JWTPayload {
  const payload = jwt.verify(token, getJwtSecret());
  if (
    typeof payload !== "object" ||
    typeof payload.playerId !== "string" ||
    typeof payload.username !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  return { playerId: payload.playerId, username: payload.username };
}
