import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { sendApiError, sendValidationError } from "../lib/http.js";

const router = Router();

export const createShelfSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["shelf", "cupboard", "desk", "cabinet", "other"]),
  color: z.string().trim().max(32).optional(),
  cabinetColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  shelfCount: z.number().int().min(1).max(100).default(1),
  width: z.number().int().min(1).max(10000).optional(),
  height: z.number().int().min(1).max(10000).optional(),
  depth: z.number().int().min(1).max(10000).optional(),
  description: z.string().trim().max(500).optional(),
});
export const updateShelfSchema = createShelfSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field");
export const shelfIdSchema = z.string().uuid();

router.get("/", async (_req: Request, res: Response) => {
  const shelves = await prisma.shelf.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { games: { where: { deletedGame: { is: null } } } } } },
  });
  res.json({ data: shelves });
});

router.post("/", async (req: Request, res: Response) => {
  const result = createShelfSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error, "Invalid shelf");
    return;
  }

  const position = (await prisma.shelf.count()) + 1;
  const shelf = await prisma.shelf.create({
    data: { ...result.data, position },
    include: { _count: { select: { games: { where: { deletedGame: { is: null } } } } } },
  });
  res.status(201).json({ data: shelf });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = shelfIdSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid container id");
    return;
  }
  const result = updateShelfSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error, "Invalid container update");
    return;
  }

  const existing = await prisma.shelf.findUnique({
    where: { id: id.data },
    select: { id: true },
  });
  if (!existing) {
    sendApiError(res, 404, "Container not found");
    return;
  }

  if (result.data.shelfCount !== undefined) {
    const gamesOnRemovedLevels = await prisma.game.count({
      where: {
        shelfId: existing.id,
        shelfNumber: { gt: result.data.shelfCount },
        deletedGame: { is: null },
      },
    });
    if (gamesOnRemovedLevels > 0) {
      sendApiError(res, 409, "Move games off the removed levels before reducing the level count");
      return;
    }
  }

  const shelf = await prisma.shelf.update({
    where: { id: existing.id },
    data: result.data,
    include: { _count: { select: { games: { where: { deletedGame: { is: null } } } } } },
  });
  res.json({ data: shelf });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = shelfIdSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid container id");
    return;
  }
  const shelf = await prisma.shelf.findUnique({
    where: { id: id.data },
    select: { id: true },
  });
  if (!shelf) {
    sendApiError(res, 404, "Container not found");
    return;
  }

  const gameCount = await prisma.game.count({ where: { shelfId: shelf.id } });
  if (gameCount > 0) {
    sendApiError(res, 409, "Move or remove all games before deleting this container", "CONFLICT", {
      gameCount,
    });
    return;
  }

  await prisma.shelf.delete({ where: { id: shelf.id } });
  res.status(204).end();
});

export default router;
