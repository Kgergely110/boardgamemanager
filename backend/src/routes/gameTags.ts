import { Router, Request, Response } from "express";
import { sendApiError, sendValidationError } from "../lib/http.js";
import prisma from "../lib/prisma.js";
import { gameIdSchema, tagAssociationSchema } from "../schemas/games.js";

const router = Router();

router.post("/:id/tags", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const association = tagAssociationSchema.safeParse(req.body);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid tag assignment");
    return;
  }
  if (!association.success) {
    sendValidationError(res, association.error, "Invalid tag assignment");
    return;
  }

  const [game, tag] = await Promise.all([
    prisma.game.findFirst({
      where: { id: id.data, deletedGame: { is: null } },
      select: { id: true },
    }),
    prisma.tag.findUnique({ where: { id: association.data.tagId }, select: { id: true } }),
  ]);
  if (!game) {
    sendApiError(res, 404, "Game not found");
    return;
  }
  if (!tag) {
    sendApiError(res, 404, "Tag not found");
    return;
  }

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: { tags: { connect: { id: tag.id } } },
    select: { tags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
  });
  res.json({ data: updated.tags });
});

router.delete("/:id/tags/:tagId", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const tagId = gameIdSchema.safeParse(req.params.tagId);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game or tag id");
    return;
  }
  if (!tagId.success) {
    sendValidationError(res, tagId.error, "Invalid game or tag id");
    return;
  }

  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: { id: true },
  });
  if (!game) {
    sendApiError(res, 404, "Game not found");
    return;
  }

  const tag = await prisma.tag.findUnique({
    where: { id: tagId.data },
    select: { id: true },
  });
  if (!tag) {
    sendApiError(res, 404, "Tag not found");
    return;
  }

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: { tags: { disconnect: { id: tag.id } } },
    select: { tags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
  });
  res.json({ data: updated.tags });
});

export default router;
