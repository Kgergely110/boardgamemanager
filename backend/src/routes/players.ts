import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const players = await prisma.player.findMany({
    where: { username: { not: null } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
  res.json({ data: players });
});

export default router;
