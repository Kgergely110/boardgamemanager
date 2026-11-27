import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();
const createTagSchema = z.object({
  name: z.string().trim().transform((name) => name.replace(/^#+\s*/, "")).pipe(z.string().min(1).max(40)),
});

router.get("/", async (_req: Request, res: Response) => {
  const tags = await prisma.tag.findMany({
    where: { games: { some: { deletedGame: { is: null } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  res.json({ data: tags });
});

router.post("/", async (req: Request, res: Response) => {
  const result = createTagSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid tag",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const existing = await prisma.tag.findFirst({
    where: { name: { equals: result.data.name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      color: true,
      games: {
        where: { deletedGame: { is: null } },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (existing) {
    if (existing.games.length === 0) {
      res.json({
        data: { id: existing.id, name: existing.name, color: existing.color },
      });
      return;
    }
    res.status(409).json({ error: "A tag with this name already exists" });
    return;
  }

  const tag = await prisma.tag.create({
    data: { name: result.data.name },
    select: { id: true, name: true, color: true },
  });
  res.status(201).json({ data: tag });
});

export default router;
