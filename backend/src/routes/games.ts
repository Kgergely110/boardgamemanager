import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();
const getUploadDirectory = () =>
  resolve(process.env.UPLOAD_DIR || "./uploads");
const gameIdSchema = z.string().uuid();
const tagAssociationSchema = z.object({ tagId: z.string().uuid() });
const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().max(100_000),
});
const updateDocumentSchema = createDocumentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one document field");
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const imageUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (value.startsWith("/uploads/") && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
});

const gameFields = {
  name: z.string().trim().min(1).max(120),
  maker: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  releaseYear: z.number().int().min(1800).max(2200).optional(),
  minPlayers: z.number().int().min(1).max(100).optional(),
  maxPlayers: z.number().int().min(1).max(100).optional(),
  ageLimit: z.number().int().min(0).max(100).optional(),
  playTime: z.number().int().min(1).max(10000).optional(),
  shelfId: z.string().uuid(),
  shelfNumber: z.number().int().min(1).max(100).default(1),
  orientation: z.enum(["vertical", "horizontal", "flat", "stacked"]).default("vertical"),
  stackedOnId: z.string().uuid().nullable().optional(),
  imageUrl: imageUrlSchema.optional(),
};

const createGameSchema = z
  .object(gameFields)
  .superRefine(({ minPlayers, maxPlayers, orientation, stackedOnId }, context) => {
    if (
      minPlayers !== undefined &&
      maxPlayers !== undefined &&
      minPlayers > maxPlayers
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPlayers"],
        message: "Must be at least the minimum players",
      });
    }
    if (orientation === "stacked" && !stackedOnId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stackedOnId"],
        message: "Choose the game this one will be stacked on",
      });
    }
    if (orientation !== "stacked" && stackedOnId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stackedOnId"],
        message: "Only stacked games can be placed on another game",
      });
    }
  });
const updateGameSchema = z
  .object({
    ...gameFields,
    imageUrl: imageUrlSchema.nullable().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field");
const restoreGameSchema = createGameSchema.and(z.object({ deletedGameId: gameIdSchema }));
const deletedMatchQuerySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
const arrangementSchema = z.object({
  shelfId: z.string().uuid(),
  shelfNumber: z.number().int().min(1).max(100),
  items: z.array(z.object({
    id: gameIdSchema,
    order: z.number().int().min(1).max(2000),
    stackedOnId: gameIdSchema.nullable(),
    orientation: z.enum(["vertical", "horizontal", "flat"]).optional(),
  })).min(1).max(2000),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      callback(new Error("Upload a JPEG, PNG, or WebP image"));
      return;
    }
    callback(null, true);
  },
});

function parseImageUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single("image")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Image must be 8 MB or smaller"
            : "Invalid image upload",
      });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid image upload",
    });
  });
}

function detectedImageExtension(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function validateGameQuery(query: Request["query"]) {
  return z
    .object({
      q: z.string().trim().max(100).optional(),
      shelfId: z.string().uuid().optional(),
    })
    .safeParse(query);
}

async function findStackRoot(game: {
  id: string;
  shelfId: string;
  shelfNumber: number;
  stackedOnId: string | null;
  position: number;
}) {
  let root = game;
  const visited = new Set<string>([game.id]);
  while (root.stackedOnId) {
    if (visited.has(root.stackedOnId)) return null;
    visited.add(root.stackedOnId);
    const parent = await prisma.game.findFirst({
      where: { id: root.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true, position: true },
    });
    if (!parent || parent.shelfId !== game.shelfId || parent.shelfNumber !== game.shelfNumber) {
      return null;
    }
    root = parent;
  }
  return root;
}

router.get("/", async (req: Request, res: Response) => {
  const query = validateGameQuery(req.query);
  if (!query.success) {
    res.status(400).json({
      error: "Invalid search",
      details: query.error.flatten().fieldErrors,
    });
    return;
  }

  const { q, shelfId } = query.data;
  const games = await prisma.game.findMany({
    where: {
      deletedGame: { is: null },
      ...(shelfId ? { shelfId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { maker: { contains: q, mode: "insensitive" } },
              { tags: { some: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ shelfId: "asc" }, { shelfNumber: "asc" }, { position: "asc" }, { id: "asc" }],
    include: {
      shelf: { select: { id: true, name: true, type: true } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });
  res.json({ data: games });
});

router.post("/", async (req: Request, res: Response) => {
  const result = createGameSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid game",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: result.data.shelfId },
    select: { id: true, shelfCount: true },
  });
  if (!shelf) {
    res.status(404).json({ error: "Container not found" });
    return;
  }
  if (result.data.shelfNumber > shelf.shelfCount) {
    res.status(400).json({ error: "Level exceeds this container's level count" });
    return;
  }

  if (result.data.stackedOnId) {
    const stackTarget = await prisma.game.findFirst({
      where: { id: result.data.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true },
    });
    if (!stackTarget) {
      res.status(404).json({ error: "Game to stack on not found" });
      return;
    }
    const targetAbove = await prisma.game.findFirst({
      where: { stackedOnId: stackTarget.id, deletedGame: { is: null } },
      select: { id: true },
    });
    if (targetAbove) {
      res.status(400).json({ error: "Choose the topmost game in the stack" });
      return;
    }
    if (
      stackTarget.shelfId !== result.data.shelfId ||
      stackTarget.shelfNumber !== result.data.shelfNumber
    ) {
      res.status(400).json({ error: "Stacked games must share the same container and level" });
      return;
    }
  }

  let position: number;
  if (result.data.stackedOnId) {
    const target = await prisma.game.findFirst({
      where: { id: result.data.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true, position: true },
    });
    const root = target ? await findStackRoot(target) : null;
    if (!root) {
      res.status(409).json({ error: "The selected stack is no longer available" });
      return;
    }
    position = root.position;
  } else {
    const latest = await prisma.game.aggregate({
      where: {
        shelfId: shelf.id,
        shelfNumber: result.data.shelfNumber,
        stackedOnId: null,
        deletedGame: { is: null },
      },
      _max: { position: true },
    });
    position = (latest._max.position ?? 0) + 1;
  }

  const game = await prisma.game.create({
    data: {
      ...result.data,
      position,
      documents: { create: { title: "Rules", content: "", order: -1 } },
    },
    include: {
      shelf: { select: { id: true, name: true, type: true } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });
  res.status(201).json({ data: game });
});

router.get("/deleted-matches", async (req: Request, res: Response) => {
  const query = deletedMatchQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid game name", details: query.error.flatten().fieldErrors });
    return;
  }
  const where = { name: { equals: query.data.name, mode: "insensitive" as const } };
  const [matches, total] = await Promise.all([
    prisma.deletedGame.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      take: 20,
      select: { id: true, gameId: true, name: true, maker: true, releaseYear: true, deletedAt: true },
    }),
    prisma.deletedGame.count({ where }),
  ]);
  res.json({ data: matches, total, truncated: total > matches.length });
});

router.post("/restore", async (req: Request, res: Response) => {
  const result = restoreGameSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid game restoration",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const { deletedGameId, ...gameData } = result.data;
  const archived = await prisma.deletedGame.findUnique({
    where: { id: deletedGameId },
    include: { game: { select: { id: true } } },
  });
  if (!archived || archived.name.toLocaleLowerCase() !== gameData.name.toLocaleLowerCase()) {
    res.status(404).json({ error: "Matching archived game not found" });
    return;
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: gameData.shelfId },
    select: { id: true, shelfCount: true },
  });
  if (!shelf) {
    res.status(404).json({ error: "Container not found" });
    return;
  }
  if (gameData.shelfNumber > shelf.shelfCount) {
    res.status(400).json({ error: "Level exceeds this container's level count" });
    return;
  }

  let position: number;
  if (gameData.stackedOnId) {
    const target = await prisma.game.findFirst({
      where: { id: gameData.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true, position: true },
    });
    if (!target || target.shelfId !== shelf.id || target.shelfNumber !== gameData.shelfNumber) {
      res.status(400).json({ error: "Stacked games must share the same container and level" });
      return;
    }
    const targetAbove = await prisma.game.findFirst({
      where: { stackedOnId: target.id, deletedGame: { is: null } },
      select: { id: true },
    });
    if (targetAbove) {
      res.status(400).json({ error: "Choose the topmost game in the stack" });
      return;
    }
    const root = await findStackRoot(target);
    if (!root) {
      res.status(409).json({ error: "The selected stack is no longer available" });
      return;
    }
    position = root.position;
  } else {
    const latest = await prisma.game.aggregate({
      where: {
        shelfId: shelf.id,
        shelfNumber: gameData.shelfNumber,
        stackedOnId: null,
        deletedGame: { is: null },
      },
      _max: { position: true },
    });
    position = (latest._max.position ?? 0) + 1;
  }

  const game = await prisma.$transaction(async (transaction) => {
    const restored = await transaction.game.update({
      where: { id: archived.gameId },
      data: { ...gameData, position },
      include: {
        shelf: { select: { id: true, name: true, type: true } },
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    await transaction.deletedGame.delete({ where: { id: archived.id } });
    return restored;
  });
  res.json({ data: game });
});

router.put("/arrangement", async (req: Request, res: Response) => {
  const result = arrangementSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid shelf arrangement",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const { shelfId, shelfNumber, items } = result.data;
  const itemIds = items.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) {
    res.status(400).json({ error: "A game can only appear once in an arrangement" });
    return;
  }
  const currentGames = await prisma.game.findMany({
    where: { shelfId, shelfNumber, deletedGame: { is: null } },
    select: { id: true, orientation: true },
  });
  const currentIds = new Set(currentGames.map((game) => game.id));
  if (currentIds.size !== itemIds.length || itemIds.some((id) => !currentIds.has(id))) {
    res.status(409).json({ error: "The shelf changed while it was being arranged. Refresh and try again." });
    return;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const childCount = new Map<string, number>();
  for (const item of items) {
    if (!item.stackedOnId) continue;
    if (item.stackedOnId === item.id || !byId.has(item.stackedOnId)) {
      res.status(400).json({ error: "Stacked games must target another game on the same level" });
      return;
    }
    childCount.set(item.stackedOnId, (childCount.get(item.stackedOnId) ?? 0) + 1);
    if ((childCount.get(item.stackedOnId) ?? 0) > 1) {
      res.status(400).json({ error: "A game can have only one game directly above it" });
      return;
    }
  }

  const roots = items.filter((item) => item.stackedOnId === null).sort((left, right) => left.order - right.order);
  if (roots.some((root, index) => root.order !== index + 1)) {
    res.status(400).json({ error: "Shelf order must be a continuous sequence" });
    return;
  }
  const rootOrder = new Map(roots.map((root) => [root.id, root.order]));
  for (const item of items) {
    let current = item;
    const visited = new Set<string>();
    while (current.stackedOnId) {
      if (visited.has(current.id)) {
        res.status(400).json({ error: "Game stacks cannot contain a cycle" });
        return;
      }
      visited.add(current.id);
      const parent = byId.get(current.stackedOnId);
      if (!parent) {
        res.status(400).json({ error: "Stacked games must target another game on the same level" });
        return;
      }
      current = parent;
    }
    if (rootOrder.get(current.id) !== item.order) {
      res.status(400).json({ error: "Stacked games must keep their base game's shelf order" });
      return;
    }
  }

  const currentById = new Map(currentGames.map((game) => [game.id, game]));
  await prisma.$transaction(
    items.map((item) => {
      const previous = currentById.get(item.id);
      const orientation = item.stackedOnId
        ? "stacked"
        : item.orientation ??
          (previous?.orientation === "stacked" ? "vertical" : previous?.orientation ?? "vertical");
      return prisma.game.update({
        where: { id: item.id },
        data: { position: item.order, stackedOnId: item.stackedOnId, orientation },
      });
    }),
  );
  res.json({
    data: items.map((item) => {
      const previous = currentById.get(item.id);
      return {
        id: item.id,
        position: item.order,
        stackedOnId: item.stackedOnId,
        orientation: item.stackedOnId
          ? "stacked"
          : item.orientation ?? (previous?.orientation === "stacked" ? "vertical" : previous?.orientation),
      };
    }),
  });
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid game id" });
    return;
  }

  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    include: {
      shelf: {
        select: {
          id: true,
          name: true,
          type: true,
          color: true,
          shelfCount: true,
          width: true,
          height: true,
          depth: true,
        },
      },
      tags: { select: { id: true, name: true, color: true } },
      documents: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, content: true, order: true },
      },
    },
  });
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.json({ data: game });
});

router.post("/:id/documents", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const result = createDocumentSchema.safeParse(req.body);
  if (!id.success || !result.success) {
    res.status(400).json({
      error: "Invalid game document",
      ...(result.success ? {} : { details: result.error.flatten().fieldErrors }),
    });
    return;
  }

  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: { id: true },
  });
  if (!game) {
    res.status(404).json({ error: "Game not found" });
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
    res.status(409).json({ error: "A document with this title already exists for the game" });
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
  if (!id.success || !documentId.success || !result.success) {
    res.status(400).json({
      error: "Invalid game document update",
      ...(result.success ? {} : { details: result.error.flatten().fieldErrors }),
    });
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
    res.status(404).json({ error: "Game document not found" });
    return;
  }

  const isRulesDocument = existing.title.toLocaleLowerCase() === "rules";
  if (isRulesDocument && result.data.title !== undefined && result.data.title !== "Rules") {
    res.status(400).json({ error: "The required Rules document cannot be renamed" });
    return;
  }
  if (!isRulesDocument && result.data.title?.toLocaleLowerCase() === "rules") {
    res.status(409).json({ error: "The title Rules is reserved for the required rules document" });
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
      res.status(409).json({ error: "A document with this title already exists for the game" });
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
  if (!id.success || !documentId.success) {
    res.status(400).json({ error: "Invalid game or document id" });
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
    res.status(404).json({ error: "Game document not found" });
    return;
  }
  if (document.title.toLocaleLowerCase() === "rules") {
    res.status(409).json({ error: "The required Rules document cannot be deleted" });
    return;
  }

  await prisma.gameDocument.delete({ where: { id: document.id } });
  res.status(204).end();
});

router.post("/:id/tags", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  const association = tagAssociationSchema.safeParse(req.body);
  if (!id.success || !association.success) {
    res.status(400).json({
      error: "Invalid tag assignment",
      ...(association.success ? {} : { details: association.error.flatten().fieldErrors }),
    });
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
    res.status(404).json({ error: "Game not found" });
    return;
  }
  if (!tag) {
    res.status(404).json({ error: "Tag not found" });
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
  if (!id.success || !tagId.success) {
    res.status(400).json({ error: "Invalid game or tag id" });
    return;
  }

  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: { id: true },
  });
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const tag = await prisma.tag.findUnique({
    where: { id: tagId.data },
    select: { id: true },
  });
  if (!tag) {
    res.status(404).json({ error: "Tag not found" });
    return;
  }

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: { tags: { disconnect: { id: tag.id } } },
    select: { tags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
  });
  res.json({ data: updated.tags });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid game id" });
    return;
  }
  const result = updateGameSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid game update",
      details: result.error.flatten().fieldErrors,
    });
    return;
  }

  const existing = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: {
      id: true,
      shelfId: true,
      shelfNumber: true,
      minPlayers: true,
      maxPlayers: true,
      orientation: true,
      stackedOnId: true,
      _count: { select: { stackedGames: { where: { deletedGame: { is: null } } } } },
    },
  });
  if (!existing) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const minPlayers = result.data.minPlayers ?? existing.minPlayers ?? undefined;
  const maxPlayers = result.data.maxPlayers ?? existing.maxPlayers ?? undefined;
  if (minPlayers !== undefined && maxPlayers !== undefined && minPlayers > maxPlayers) {
    res.status(400).json({ error: "Maximum players must be at least the minimum" });
    return;
  }

  const shelfId = result.data.shelfId ?? existing.shelfId;
  const shelfNumber = result.data.shelfNumber ?? existing.shelfNumber;
  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId },
    select: { id: true, shelfCount: true },
  });
  if (!shelf) {
    res.status(404).json({ error: "Container not found" });
    return;
  }
  if (shelfNumber > shelf.shelfCount) {
    res.status(400).json({ error: "Level exceeds this container's level count" });
    return;
  }

  const moved =
    shelf.id !== existing.shelfId || shelfNumber !== existing.shelfNumber;
  if (moved && existing._count.stackedGames > 0) {
    res.status(409).json({
      error: "Games stacked on this one must be unstacked before it can be moved",
    });
    return;
  }

  const orientation = result.data.orientation ?? existing.orientation;
  if (orientation === "stacked" && existing._count.stackedGames > 0) {
    res.status(409).json({
      error: "Games stacked on this one must be unstacked first",
    });
    return;
  }
  const stackedOnId =
    result.data.stackedOnId !== undefined
      ? result.data.stackedOnId
      : orientation === "stacked"
        ? existing.stackedOnId
        : null;
  if (orientation === "stacked" && !stackedOnId) {
    res.status(400).json({ error: "Choose the game this one will be stacked on" });
    return;
  }
  if (orientation !== "stacked" && stackedOnId) {
    res.status(400).json({ error: "Only stacked games can be placed on another game" });
    return;
  }
  if (stackedOnId) {
    const stackTarget = await prisma.game.findFirst({
      where: { id: stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true },
    });
    if (!stackTarget) {
      res.status(404).json({ error: "Game to stack on not found" });
      return;
    }
    const targetAbove = await prisma.game.findFirst({
      where: { stackedOnId: stackTarget.id, deletedGame: { is: null } },
      select: { id: true },
    });
    if (stackTarget.id === existing.id || (targetAbove && targetAbove.id !== existing.id)) {
      res.status(400).json({ error: "Choose a different topmost game in this stack" });
      return;
    }
    if (stackTarget.shelfId !== shelf.id || stackTarget.shelfNumber !== shelfNumber) {
      res.status(400).json({ error: "Stacked games must share the same container and level" });
      return;
    }
  }

  let position: number | undefined;
  if (moved || stackedOnId !== existing.stackedOnId) {
    if (stackedOnId) {
      const target = await prisma.game.findFirst({
        where: { id: stackedOnId, deletedGame: { is: null } },
        select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true, position: true },
      });
      const root = target ? await findStackRoot(target) : null;
      if (!root) {
        res.status(409).json({ error: "The selected stack is no longer available" });
        return;
      }
      position = root.position;
    } else {
      const latest = await prisma.game.aggregate({
        where: {
          shelfId: shelf.id,
          shelfNumber,
          stackedOnId: null,
          deletedGame: { is: null },
        },
        _max: { position: true },
      });
      position = (latest._max.position ?? 0) + 1;
    }
  }

  const game = await prisma.game.update({
    where: { id: existing.id },
    data: {
      ...result.data,
      orientation,
      stackedOnId,
      ...(position === undefined ? {} : { position }),
    },
    include: {
      shelf: { select: { id: true, name: true, type: true } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });
  res.json({ data: game });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid game id" });
    return;
  }
  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: {
      id: true,
      name: true,
      maker: true,
      releaseYear: true,
      shelfId: true,
      shelfNumber: true,
      position: true,
      stackedOnId: true,
    },
  });
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const stackRoot = await findStackRoot(game);
  const arrangement = await prisma.$transaction(async (transaction) => {
    const levelGames = await transaction.game.findMany({
      where: {
        shelfId: game.shelfId,
        shelfNumber: game.shelfNumber,
        deletedGame: { is: null },
      },
      select: { id: true, position: true, orientation: true, stackedOnId: true },
    });
    const gamesById = new Map(levelGames.map((item) => [item.id, item]));
    function stackLocation(item: (typeof levelGames)[number]) {
      let current = item;
      let depth = 0;
      const visited = new Set<string>([item.id]);
      while (current.stackedOnId) {
        const parent = gamesById.get(current.stackedOnId);
        if (!parent || visited.has(parent.id)) break;
        visited.add(parent.id);
        current = parent;
        depth += 1;
      }
      return { rootId: current.id, depth };
    }
    const stackRootId = stackRoot?.id ?? game.id;
    const stackItems = levelGames
      .filter((item) => stackLocation(item).rootId === stackRootId)
      .sort((left, right) => {
        const depthDifference = stackLocation(left).depth - stackLocation(right).depth;
        return depthDifference || left.position - right.position || left.id.localeCompare(right.id);
      });
    const deletedIndex = stackItems.findIndex((item) => item.id === game.id);
    const fallingGameIds = deletedIndex < 0
      ? []
      : stackItems.slice(deletedIndex + 1).map((item) => item.id);
    const fallingGames = stackItems.filter((item) => item.id !== game.id);
    let parentId: string | null = null;
    for (const fallingGame of fallingGames) {
      await transaction.game.update({
        where: { id: fallingGame.id },
        data: {
          stackedOnId: parentId,
          position: stackRoot?.position ?? game.position,
          orientation: parentId
            ? "stacked"
            : fallingGame.orientation === "stacked"
              ? "vertical"
              : fallingGame.orientation,
        },
      });
      parentId = fallingGame.id;
    }

    await transaction.deletedGame.create({
      data: {
        gameId: game.id,
        name: game.name,
        maker: game.maker,
        releaseYear: game.releaseYear,
      },
    });

    const roots = await transaction.game.findMany({
      where: {
        shelfId: game.shelfId,
        shelfNumber: game.shelfNumber,
        stackedOnId: null,
        deletedGame: { is: null },
      },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    for (const [index, root] of roots.entries()) {
      await transaction.game.update({
        where: { id: root.id },
        data: { position: index + 1 },
      });
    }
    const updatedGames = await transaction.game.findMany({
      where: {
        shelfId: game.shelfId,
        shelfNumber: game.shelfNumber,
        deletedGame: { is: null },
      },
      select: { id: true, position: true, stackedOnId: true, orientation: true },
    });
    return { fallingGameIds, games: updatedGames };
  });
  res.json({ data: arrangement });
});

router.post("/:id/image", parseImageUpload, async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid game id" });
    return;
  }
  const game = await prisma.game.findFirst({
    where: { id: id.data, deletedGame: { is: null } },
    select: { id: true },
  });
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Choose an image to upload" });
    return;
  }

  const extension = detectedImageExtension(req.file.buffer);
  if (!extension || imageExtensions[req.file.mimetype] !== extension) {
    res.status(400).json({ error: "File content does not match a supported image type" });
    return;
  }

  const uploadDirectory = getUploadDirectory();
  await mkdir(uploadDirectory, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  const filePath = resolve(getUploadDirectory(), fileName);
  await writeFile(filePath, req.file.buffer, { flag: "wx" });
  const imageUrl = `/uploads/${fileName}`;

  try {
    const updated = await prisma.game.update({
      where: { id: game.id },
      data: { imageUrl },
      include: {
        shelf: { select: { id: true, name: true, type: true } },
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    res.json({ data: updated });
  } catch (error) {
    try {
      await unlink(filePath);
    } catch (cleanupError) {
      console.error("Could not remove an image after the game update failed", cleanupError);
    }
    throw error;
  }
});

export default router;
