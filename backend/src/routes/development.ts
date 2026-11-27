import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = Router();

const userSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128),
});

router.use(authenticateToken);

router.post("/users", async (req: Request, res: Response) => {
  const playerId = req.user?.playerId;
  if (!playerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const actor = await prisma.player.findUnique({
    where: { id: playerId },
    select: { isAdmin: true },
  });
  if (!actor?.isAdmin) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }

  const result = userSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid request",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const password = await bcrypt.hash(result.data.password, 12);
  try {
    const user = await prisma.player.create({
      data: {
        fullName: result.data.fullName,
        username: result.data.username,
        password,
        isAdmin: false,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        isAdmin: true,
      },
    });
    res.status(201).json({ data: user });
  } catch (error) {
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

export default router;
