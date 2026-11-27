import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { generateToken } from "../lib/auth.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = Router();

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128),
});

const setupSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1).max(80),
});

class SetupClosedError extends Error {}

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: "Invalid request",
    details: error.flatten().fieldErrors,
  });
}

router.get("/status", async (_req: Request, res: Response) => {
  const accountCount = await prisma.player.count({
    where: { password: { not: null } },
  });
  res.json({ setupRequired: accountCount === 0 });
});

router.post("/setup", async (req: Request, res: Response) => {
  const result = setupSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const password = await bcrypt.hash(result.data.password, 12);
  try {
    const player = await prisma.$transaction(
      async (tx) => {
        const accountCount = await tx.player.count({
          where: { password: { not: null } },
        });
        if (accountCount > 0) {
          throw new SetupClosedError();
        }

        return tx.player.create({
          data: {
            username: result.data.username,
            password,
            fullName: result.data.fullName,
            isAdmin: true,
          },
          select: {
            id: true,
            username: true,
            fullName: true,
            isAdmin: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    res.status(201).json({
      token: generateToken({
        playerId: player.id,
        username: result.data.username,
      }),
      player,
    });
  } catch (error) {
    if (error instanceof SetupClosedError) {
      res.status(409).json({ error: "Initial setup has already been completed" });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      res.status(409).json({ error: "Initial setup has already been completed" });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ error: "That username is already in use" });
      return;
    }
    throw error;
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const result = credentialsSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const player = await prisma.player.findUnique({
    where: { username: result.data.username },
    select: {
      id: true,
      username: true,
      fullName: true,
      password: true,
      isAdmin: true,
    },
  });

  const validPassword =
    player?.password &&
    (await bcrypt.compare(result.data.password, player.password));
  if (!player || !validPassword || !player.username) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const { password: _password, ...publicPlayer } = player;
  res.json({
    token: generateToken({ playerId: player.id, username: player.username }),
    player: publicPlayer,
  });
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  const playerId = req.user?.playerId;
  if (!playerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      username: true,
      fullName: true,
      isAdmin: true,
    },
  });
  if (!player) {
    res.status(401).json({ error: "Account no longer exists" });
    return;
  }
  res.json({ player });
});

export default router;
