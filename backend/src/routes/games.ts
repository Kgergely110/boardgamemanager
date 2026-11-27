import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { sendApiError, sendValidationError } from "../lib/http.js";
import prisma from "../lib/prisma.js";
import {
  arrangementSchema,
  createGameSchema,
  deletedMatchQuerySchema,
  gameIdSchema,
  gameListQuerySchema,
  restoreGameSchema,
  updateGameSchema,
} from "../schemas/games.js";

const router = Router();
class WishlistItemAlreadyAcquiredError extends Error {}

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
  const query = gameListQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendValidationError(res, query.error, "Invalid search");
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

router.get("/collection-pulse", async (_req: Request, res: Response) => {
  const windowDays = 90;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [summaryRows, recentGames, restingGames, neverPlayedGames, tags] = await Promise.all([
    prisma.$queryRaw<{
      totalGames: number;
      playedRecently: number;
      neverPlayed: number;
      restingGameCount: number;
    }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "totalGames",
        COUNT(*) FILTER (WHERE activity."playCount" = 0)::int AS "neverPlayed",
        COUNT(*) FILTER (
          WHERE activity."lastPlayedAt" IS NOT NULL
            AND activity."lastPlayedAt" < ${cutoff}
        )::int AS "restingGameCount",
        COUNT(*) FILTER (
          WHERE activity."lastPlayedAt" >= ${cutoff}
        )::int AS "playedRecently"
      FROM "Game" g
      LEFT JOIN "DeletedGame" dg ON dg."gameId" = g."id"
      LEFT JOIN LATERAL (
        SELECT COUNT(pl."id")::int AS "playCount", MAX(pl."playedAt") AS "lastPlayedAt"
        FROM "PlayLog" pl
        WHERE pl."gameId" = g."id"
      ) activity ON true
      WHERE dg."id" IS NULL
    `),
    prisma.$queryRaw<{
      id: string;
      name: string;
      plays: number;
    }[]>(Prisma.sql`
      SELECT g."id", g."name", COUNT(pl."id")::int AS "plays"
      FROM "Game" g
      INNER JOIN "PlayLog" pl ON pl."gameId" = g."id" AND pl."playedAt" >= ${cutoff}
      LEFT JOIN "DeletedGame" dg ON dg."gameId" = g."id"
      WHERE dg."id" IS NULL
      GROUP BY g."id", g."name"
      ORDER BY "plays" DESC, g."name" ASC, g."id" ASC
      LIMIT 5
    `),
    prisma.$queryRaw<{
      id: string;
      name: string;
      lastPlayedAt: Date;
    }[]>(Prisma.sql`
      SELECT g."id", g."name", MAX(pl."playedAt") AS "lastPlayedAt"
      FROM "Game" g
      INNER JOIN "PlayLog" pl ON pl."gameId" = g."id"
      LEFT JOIN "DeletedGame" dg ON dg."gameId" = g."id"
      WHERE dg."id" IS NULL
      GROUP BY g."id", g."name"
      HAVING MAX(pl."playedAt") < ${cutoff}
      ORDER BY "lastPlayedAt" ASC, g."name" ASC, g."id" ASC
      LIMIT 5
    `),
    prisma.game.findMany({
      where: {
        deletedGame: { is: null },
        playLogs: { none: {} },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.tag.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        _count: {
          select: {
            games: { where: { deletedGame: { is: null } } },
          },
        },
      },
    }),
  ]);
  const summary = summaryRows[0] ?? {
    totalGames: 0,
    playedRecently: 0,
    neverPlayed: 0,
    restingGameCount: 0,
  };

  res.json({
    data: {
      windowDays,
      ...summary,
      recentGames,
      restingGames,
      neverPlayedGames,
      popularTags: tags
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          gameCount: tag._count.games,
        }))
        .filter((tag) => tag.gameCount > 0)
        .sort((left, right) => right.gameCount - left.gameCount || left.name.localeCompare(right.name))
        .slice(0, 6),
    },
  });
});

router.post("/", async (req: Request, res: Response) => {
  const result = createGameSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error, "Invalid game");
    return;
  }

  const { wishlistItemId, ...gameFieldsToCreate } = result.data;
  const wishlistItem = wishlistItemId
    ? await prisma.wishlistItem.findUnique({
      where: { id: wishlistItemId },
      select: { id: true, gameId: true, status: true, tags: { select: { id: true } } },
    })
    : null;
  if (wishlistItemId && !wishlistItem) {
    sendApiError(res, 404, "Wishlist item not found");
    return;
  }
  if (wishlistItem && (wishlistItem.gameId || wishlistItem.status === "ACQUIRED" || wishlistItem.status === "ARCHIVED")) {
    sendApiError(res, 409, "This wishlist item can no longer be added to the collection");
    return;
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: gameFieldsToCreate.shelfId },
    select: { id: true, shelfCount: true },
  });
  if (!shelf) {
    sendApiError(res, 404, "Container not found");
    return;
  }
  if (gameFieldsToCreate.shelfNumber > shelf.shelfCount) {
    sendApiError(res, 422, "Level exceeds this container's level count");
    return;
  }

  if (gameFieldsToCreate.stackedOnId) {
    const stackTarget = await prisma.game.findFirst({
      where: { id: gameFieldsToCreate.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true },
    });
    if (!stackTarget) {
      sendApiError(res, 404, "Game to stack on not found");
      return;
    }
    const targetAbove = await prisma.game.findFirst({
      where: { stackedOnId: stackTarget.id, deletedGame: { is: null } },
      select: { id: true },
    });
    if (targetAbove) {
      sendApiError(res, 422, "Choose the topmost game in the stack");
      return;
    }
    if (
      stackTarget.shelfId !== gameFieldsToCreate.shelfId ||
      stackTarget.shelfNumber !== gameFieldsToCreate.shelfNumber
    ) {
      sendApiError(res, 422, "Stacked games must share the same container and level");
      return;
    }
  }

  let position: number;
  if (gameFieldsToCreate.stackedOnId) {
    const target = await prisma.game.findFirst({
      where: { id: gameFieldsToCreate.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true, position: true },
    });
    const root = target ? await findStackRoot(target) : null;
    if (!root) {
      sendApiError(res, 409, "The selected stack is no longer available");
      return;
    }
    position = root.position;
  } else {
    const latest = await prisma.game.aggregate({
      where: {
        shelfId: shelf.id,
        shelfNumber: gameFieldsToCreate.shelfNumber,
        stackedOnId: null,
        deletedGame: { is: null },
      },
      _max: { position: true },
    });
    position = (latest._max.position ?? 0) + 1;
  }

  let game;
  try {
    game = await prisma.$transaction(async (transaction) => {
      const created = await transaction.game.create({
        data: {
          ...gameFieldsToCreate,
          position,
          ...(wishlistItem ? { tags: { connect: wishlistItem.tags } } : {}),
          documents: { create: { title: "Rules", content: "", order: -1 } },
        },
        include: {
          shelf: { select: { id: true, name: true, type: true } },
          tags: { select: { id: true, name: true, color: true } },
        },
      });
      if (wishlistItem) {
        const acquired = await transaction.wishlistItem.updateMany({
          where: {
            id: wishlistItem.id,
            gameId: null,
            status: { in: ["CONSIDERING", "WANTED", "ORDERED"] },
          },
          data: { gameId: created.id, status: "ACQUIRED", acquiredAt: new Date() },
        });
        if (acquired.count !== 1) throw new WishlistItemAlreadyAcquiredError();
      }
      return created;
    });
  } catch (error) {
    if (error instanceof WishlistItemAlreadyAcquiredError) {
      sendApiError(res, 409, "This wishlist item was added to the collection by someone else");
      return;
    }
    throw error;
  }
  res.status(201).json({ data: game });
});

router.get("/deleted-matches", async (req: Request, res: Response) => {
  const query = deletedMatchQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendValidationError(res, query.error, "Invalid game name");
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
    sendValidationError(res, result.error, "Invalid game restoration");
    return;
  }

  const { deletedGameId, ...gameData } = result.data;
  const archived = await prisma.deletedGame.findUnique({
    where: { id: deletedGameId },
    include: { game: { select: { id: true } } },
  });
  if (!archived || archived.name.toLocaleLowerCase() !== gameData.name.toLocaleLowerCase()) {
    sendApiError(res, 404, "Matching archived game not found");
    return;
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: gameData.shelfId },
    select: { id: true, shelfCount: true },
  });
  if (!shelf) {
    sendApiError(res, 404, "Container not found");
    return;
  }
  if (gameData.shelfNumber > shelf.shelfCount) {
    sendApiError(res, 422, "Level exceeds this container's level count");
    return;
  }

  let position: number;
  if (gameData.stackedOnId) {
    const target = await prisma.game.findFirst({
      where: { id: gameData.stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true, position: true },
    });
    if (!target) {
      sendApiError(res, 404, "Game to stack on not found");
      return;
    }
    if (target.shelfId !== shelf.id || target.shelfNumber !== gameData.shelfNumber) {
      sendApiError(res, 422, "Stacked games must share the same container and level");
      return;
    }
    const targetAbove = await prisma.game.findFirst({
      where: { stackedOnId: target.id, deletedGame: { is: null } },
      select: { id: true },
    });
    if (targetAbove) {
      sendApiError(res, 422, "Choose the topmost game in the stack");
      return;
    }
    const root = await findStackRoot(target);
    if (!root) {
      sendApiError(res, 409, "The selected stack is no longer available");
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
    sendValidationError(res, result.error, "Invalid shelf arrangement");
    return;
  }

  const { shelfId, shelfNumber, items } = result.data;
  const itemIds = items.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) {
    sendApiError(res, 422, "A game can only appear once in an arrangement");
    return;
  }
  const currentGames = await prisma.game.findMany({
    where: { shelfId, shelfNumber, deletedGame: { is: null } },
    select: { id: true, orientation: true },
  });
  const currentIds = new Set(currentGames.map((game) => game.id));
  if (currentIds.size !== itemIds.length || itemIds.some((id) => !currentIds.has(id))) {
    sendApiError(res, 409, "The shelf changed while it was being arranged. Refresh and try again.");
    return;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const childCount = new Map<string, number>();
  for (const item of items) {
    if (!item.stackedOnId) continue;
    if (item.stackedOnId === item.id || !byId.has(item.stackedOnId)) {
      sendApiError(res, 422, "Stacked games must target another game on the same level");
      return;
    }
    childCount.set(item.stackedOnId, (childCount.get(item.stackedOnId) ?? 0) + 1);
    if ((childCount.get(item.stackedOnId) ?? 0) > 1) {
      sendApiError(res, 422, "A game can have only one game directly above it");
      return;
    }
  }

  const roots = items.filter((item) => item.stackedOnId === null).sort((left, right) => left.order - right.order);
  if (roots.some((root, index) => root.order !== index + 1)) {
    sendApiError(res, 422, "Shelf order must be a continuous sequence");
    return;
  }
  const rootOrder = new Map(roots.map((root) => [root.id, root.order]));
  for (const item of items) {
    let current = item;
    const visited = new Set<string>();
    while (current.stackedOnId) {
      if (visited.has(current.id)) {
        sendApiError(res, 422, "Game stacks cannot contain a cycle");
        return;
      }
      visited.add(current.id);
      const parent = byId.get(current.stackedOnId);
      if (!parent) {
        sendApiError(res, 422, "Stacked games must target another game on the same level");
        return;
      }
      current = parent;
    }
    if (rootOrder.get(current.id) !== item.order) {
      sendApiError(res, 422, "Stacked games must keep their base game's shelf order");
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
    sendValidationError(res, id.error, "Invalid game id");
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
    sendApiError(res, 404, "Game not found");
    return;
  }

  res.json({ data: game });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = gameIdSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game id");
    return;
  }
  const result = updateGameSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error, "Invalid game update");
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
    sendApiError(res, 404, "Game not found");
    return;
  }

  const minPlayers = result.data.minPlayers ?? existing.minPlayers ?? undefined;
  const maxPlayers = result.data.maxPlayers ?? existing.maxPlayers ?? undefined;
  if (minPlayers !== undefined && maxPlayers !== undefined && minPlayers > maxPlayers) {
    sendApiError(res, 422, "Maximum players must be at least the minimum");
    return;
  }

  const shelfId = result.data.shelfId ?? existing.shelfId;
  const shelfNumber = result.data.shelfNumber ?? existing.shelfNumber;
  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId },
    select: { id: true, shelfCount: true },
  });
  if (!shelf) {
    sendApiError(res, 404, "Container not found");
    return;
  }
  if (shelfNumber > shelf.shelfCount) {
    sendApiError(res, 422, "Level exceeds this container's level count");
    return;
  }

  const moved =
    shelf.id !== existing.shelfId || shelfNumber !== existing.shelfNumber;
  if (moved && existing._count.stackedGames > 0) {
    sendApiError(res, 409, "Games stacked on this one must be unstacked before it can be moved");
    return;
  }

  const orientation = result.data.orientation ?? existing.orientation;
  if (orientation === "stacked" && existing._count.stackedGames > 0) {
    sendApiError(res, 409, "Games stacked on this one must be unstacked first");
    return;
  }
  const stackedOnId =
    result.data.stackedOnId !== undefined
      ? result.data.stackedOnId
      : orientation === "stacked"
        ? existing.stackedOnId
        : null;
  if (orientation === "stacked" && !stackedOnId) {
    sendApiError(res, 422, "Choose the game this one will be stacked on");
    return;
  }
  if (orientation !== "stacked" && stackedOnId) {
    sendApiError(res, 422, "Only stacked games can be placed on another game");
    return;
  }
  if (stackedOnId) {
    const stackTarget = await prisma.game.findFirst({
      where: { id: stackedOnId, deletedGame: { is: null } },
      select: { id: true, shelfId: true, shelfNumber: true, stackedOnId: true },
    });
    if (!stackTarget) {
      sendApiError(res, 404, "Game to stack on not found");
      return;
    }
    const targetAbove = await prisma.game.findFirst({
      where: { stackedOnId: stackTarget.id, deletedGame: { is: null } },
      select: { id: true },
    });
    if (stackTarget.id === existing.id || (targetAbove && targetAbove.id !== existing.id)) {
      sendApiError(res, 422, "Choose a different topmost game in this stack");
      return;
    }
    if (stackTarget.shelfId !== shelf.id || stackTarget.shelfNumber !== shelfNumber) {
      sendApiError(res, 422, "Stacked games must share the same container and level");
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
        sendApiError(res, 409, "The selected stack is no longer available");
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
    sendValidationError(res, id.error, "Invalid game id");
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
    sendApiError(res, 404, "Game not found");
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

export default router;
