import { Router, Request, Response } from "express";
import { sendApiError, sendValidationError } from "../lib/http.js";
import prisma from "../lib/prisma.js";
import {
  createDocumentSchema,
  gameIdSchema,
  updateDocumentSchema,
} from "../schemas/games.js";

const router = Router();

router.post("/:id/documents", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const result = createDocumentSchema.safeParse(req.body);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game document");
    return;
  }
  if (!result.success) {
    sendValidationError(res, result.error, "Invalid game document");
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

  const duplicate = await prisma.gameDocument.findFirst({
    where: {
      gameId: game.id,
      title: { equals: result.data.title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    sendApiError(res, 409, "A document with this title already exists for the game");
    return;
  }

  const latest = await prisma.gameDocument.aggregate({
    where: { gameId: game.id },
    _max: { order: true },
  });
  const document = await prisma.gameDocument.create({
    data: {
      ...result.data,
      gameId: game.id,
      order: result.data.title.toLocaleLowerCase() === "rules"
        ? -1
        : (latest._max.order ?? -1) + 1,
    },
  });
  res.status(201).json({ data: document });
});

router.patch("/:id/documents/:documentId", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const documentId = gameIdSchema.safeParse(req.params.documentId);
  const result = updateDocumentSchema.safeParse(req.body);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game document update");
    return;
  }
  if (!documentId.success) {
    sendValidationError(res, documentId.error, "Invalid game document update");
    return;
  }
  if (!result.success) {
    sendValidationError(res, result.error, "Invalid game document update");
    return;
  }

  const existing = await prisma.gameDocument.findFirst({
    where: {
      id: documentId.data,
      gameId: id.data,
      game: { is: { deletedGame: { is: null } } },
    },
    select: { id: true, title: true },
  });
  if (!existing) {
    sendApiError(res, 404, "Game document not found");
    return;
  }

  const isRulesDocument = existing.title.toLocaleLowerCase() === "rules";
  if (isRulesDocument && result.data.title !== undefined && result.data.title !== "Rules") {
    sendApiError(res, 422, "The required Rules document cannot be renamed");
    return;
  }
  if (!isRulesDocument && result.data.title?.toLocaleLowerCase() === "rules") {
    sendApiError(res, 409, "The title Rules is reserved for the required rules document");
    return;
  }
  if (result.data.title) {
    const duplicate = await prisma.gameDocument.findFirst({
      where: {
        gameId: id.data,
        id: { not: existing.id },
        title: { equals: result.data.title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      sendApiError(res, 409, "A document with this title already exists for the game");
      return;
    }
  }

  const document = await prisma.gameDocument.update({
    where: { id: existing.id },
    data: result.data,
  });
  res.json({ data: document });
});

router.delete("/:id/documents/:documentId", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const documentId = gameIdSchema.safeParse(req.params.documentId);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game or document id");
    return;
  }
  if (!documentId.success) {
    sendValidationError(res, documentId.error, "Invalid game or document id");
    return;
  }

  const document = await prisma.gameDocument.findFirst({
    where: {
      id: documentId.data,
      gameId: id.data,
      game: { is: { deletedGame: { is: null } } },
    },
    select: { id: true, title: true },
  });
  if (!document) {
    sendApiError(res, 404, "Game document not found");
    return;
  }
  if (document.title.toLocaleLowerCase() === "rules") {
    sendApiError(res, 409, "The required Rules document cannot be deleted");
    return;
  }

  await prisma.gameDocument.delete({ where: { id: document.id } });
  res.status(204).end();
});

export default router;
