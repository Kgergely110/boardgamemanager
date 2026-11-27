import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();
const idSchema = z.string().uuid();

const participantSchema = z.object({
  playerId: idSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
  placement: z.number().int().min(1).max(1000).nullable().optional(),
  score: z.number().int().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
}).refine((participant) => Boolean(participant.playerId) !== Boolean(participant.name), {
  message: "Choose an app player or enter a guest name",
});

const playLogSchema = z.object({
  gameId: idSchema.optional(),
  guestGameName: z.string().trim().min(1).max(120).optional(),
  playedAt: z.string().datetime({ offset: true }),
  duration: z.number().int().min(1).max(2_147_483_647).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  participants: z.array(participantSchema).min(1).max(100),
}).refine(
  (log) => Boolean(log.gameId) !== Boolean(log.guestGameName),
  { message: "Choose either a library game or a guest game name", path: ["gameId"] },
);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  gameId: idSchema.optional(),
  guestGame: z.string().trim().max(120).optional(),
  tagId: idSchema.optional(),
  winner: z.string().trim().max(100).optional(),
  minDuration: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  maxDuration: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  location: z.string().trim().max(120).optional(),
}).refine(
  (query) => query.minDuration === undefined || query.maxDuration === undefined ||
    query.minDuration <= query.maxDuration,
  { message: "Minimum playtime cannot exceed maximum playtime" },
).refine(
  (query) => query.from === undefined || query.to === undefined || query.from <= query.to,
  { message: "Start date cannot be after end date" },
);
const guestGameListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

type ParticipantInput = z.infer<typeof participantSchema>;
type PlayLogInput = z.infer<typeof playLogSchema>;
type PlayLogFilters = Omit<z.infer<typeof listQuerySchema>, "page">;
type ResolvedGameReference =
  | { gameId: string; guestGameId: null; kind: "library" }
  | { gameId: null; guestGameId: string; kind: "guest" };

async function resolveGameReference(
  input: Pick<PlayLogInput, "gameId" | "guestGameName">,
): Promise<ResolvedGameReference | null> {
  if (input.gameId) {
    const game = await prisma.game.findFirst({
      where: { id: input.gameId, deletedGame: { is: null } },
      select: { id: true },
    });
    return game ? { gameId: game.id, guestGameId: null, kind: "library" } : null;
  }

  const name = input.guestGameName?.trim().replace(/\s+/g, " ");
  if (!name) return null;
  const normalizedName = name.toLowerCase();
  const guestGame = await prisma.guestGame.upsert({
    where: { normalizedName },
    update: {},
    create: { name, normalizedName },
    select: { id: true },
  });
  return { gameId: null, guestGameId: guestGame.id, kind: "guest" };
}

async function resolveParticipants(participants: ParticipantInput[]) {
  const playerIds = participants.flatMap((participant) => participant.playerId ? [participant.playerId] : []);
  if (new Set(playerIds).size !== playerIds.length) {
    return { error: "An app player can only be listed once in a game log" as const };
  }

  const players = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds }, username: { not: null } },
        select: { id: true, fullName: true },
      })
    : [];
  if (players.length !== playerIds.length) {
    return { error: "One or more selected app players could not be found" as const };
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  const data: {
    playerId: string | null;
    displayName: string;
    placement: number | null;
    score: number | null;
  }[] = [];
  for (const participant of participants) {
    const displayName = participant.playerId
      ? playersById.get(participant.playerId)?.fullName
      : participant.name;
    if (!displayName) {
      return { error: "One or more selected app players could not be found" as const };
    }
    data.push({
      playerId: participant.playerId ?? null,
      displayName,
      placement: participant.placement ?? null,
      score: participant.score ?? null,
    });
  }
  return { data };
}

function buildWhere(query: PlayLogFilters): Prisma.PlayLogWhereInput {
  const where: Prisma.PlayLogWhereInput = {
    OR: [
      { game: { is: { deletedGame: { is: null } } } },
      { guestGameId: { not: null } },
    ],
  };
  if (query.gameId) where.gameId = query.gameId;
  if (query.guestGame) {
    where.guestGame = {
      is: { name: { contains: query.guestGame, mode: "insensitive" } },
    };
  }
  if (query.tagId) {
    where.game = {
      is: {
        deletedGame: { is: null },
        tags: { some: { id: query.tagId } },
      },
    };
  }
  if (query.winner) {
    where.participants = {
      some: {
        placement: 1,
        displayName: { contains: query.winner, mode: "insensitive" },
      },
    };
  }
  if (query.location) where.location = { contains: query.location, mode: "insensitive" };
  if (query.minDuration !== undefined || query.maxDuration !== undefined) {
    where.duration = {
      ...(query.minDuration !== undefined ? { gte: query.minDuration } : {}),
      ...(query.maxDuration !== undefined ? { lte: query.maxDuration } : {}),
    };
  }
  if (query.from || query.to) {
    where.playedAt = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    };
  }
  return where;
}

router.get("/guest-games", async (req: Request, res: Response) => {
  const parsed = guestGameListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid guest game search",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { q, page } = parsed.data;
  const pageSize = 30;
  const where: Prisma.GuestGameWhereInput = q
    ? { name: { contains: q, mode: "insensitive" } }
    : {};
  const [data, total] = await prisma.$transaction([
    prisma.guestGame.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true },
    }),
    prisma.guestGame.count({ where }),
  ]);
  res.json({
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

router.get("/", async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid play log filters",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { page, ...filters } = parsed.data;
  const where = buildWhere(filters);
  const [logs, aggregate, participantCount, uniqueParticipants, winnerGroups, gameGroups] =
    await Promise.all([
      prisma.playLog.findMany({
        where,
        orderBy: [{ playedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 100,
        take: 100,
        include: {
          game: {
            select: { id: true, name: true, tags: { select: { id: true, name: true } } },
          },
          guestGame: { select: { id: true, name: true } },
          participants: {
            orderBy: { createdAt: "asc" },
            select: { id: true, playerId: true, displayName: true, placement: true, score: true },
          },
        },
      }),
      prisma.playLog.aggregate({
        where,
        _count: { _all: true },
        _avg: { duration: true },
        _sum: { duration: true },
      }),
      prisma.playLogParticipant.count({ where: { playLog: { is: where } } }),
      prisma.playLogParticipant.groupBy({
        by: ["playerId", "displayName"],
        where: { playLog: { is: where } },
      }),
      prisma.playLogParticipant.groupBy({
        by: ["playerId", "displayName"],
        where: { placement: 1, playLog: { is: where } },
        _count: { _all: true },
      }),
      prisma.playLog.groupBy({
        by: ["gameId", "guestGameId"],
        where,
        _count: { _all: true },
      }),
    ]);

  const libraryGameIds = gameGroups.flatMap((group) => group.gameId ? [group.gameId] : []);
  const guestGameIds = gameGroups.flatMap((group) => group.guestGameId ? [group.guestGameId] : []);
  const [libraryGames, guestGames] = await Promise.all([
    libraryGameIds.length
      ? prisma.game.findMany({
          where: { id: { in: libraryGameIds } },
          select: { id: true, name: true },
        })
      : [],
    guestGameIds.length
      ? prisma.guestGame.findMany({
          where: { id: { in: guestGameIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const libraryGameNames = new Map(libraryGames.map((game) => [game.id, game.name]));
  const guestGameNames = new Map(guestGames.map((game) => [game.id, game.name]));
  const mostPlayedGames = gameGroups
    .map((group) => ({
      gameId: group.gameId,
      guestGameId: group.guestGameId,
      name: group.gameId
        ? libraryGameNames.get(group.gameId) ?? "Unknown game"
        : group.guestGameId
          ? guestGameNames.get(group.guestGameId) ?? "Unknown guest game"
          : "Unknown game",
      plays: group._count._all,
    }))
    .sort((left, right) => right.plays - left.plays || left.name.localeCompare(right.name))
    .slice(0, 5);
  const topWinners = winnerGroups
    .map((group) => ({
      playerId: group.playerId,
      name: group.displayName,
      wins: group._count._all,
    }))
    .sort((left, right) => right.wins - left.wins || left.name.localeCompare(right.name))
    .slice(0, 5);

  res.json({
    data: logs,
    pagination: {
      page,
      pageSize: 100,
      total: aggregate._count._all,
      totalPages: Math.ceil(aggregate._count._all / 100),
    },
    statistics: {
      totalSessions: aggregate._count._all,
      totalParticipants: participantCount,
      uniquePlayers: uniqueParticipants.length,
      totalDurationMinutes: aggregate._sum.duration ?? 0,
      averageDurationMinutes: aggregate._avg.duration,
      mostPlayedGames,
      topWinners,
    },
  });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = playLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid play log",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { participants, gameId, guestGameName, ...playLogData } = parsed.data;
  const resolved = await resolveParticipants(participants);
  if ("error" in resolved) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const gameReference = await resolveGameReference({ gameId, guestGameName });
  if (!gameReference) {
    res.status(404).json({ error: gameId ? "Game not found" : "Guest game name is required" });
    return;
  }

  const playLog = await prisma.playLog.create({
    data: {
      ...(gameReference.kind === "library"
        ? { game: { connect: { id: gameReference.gameId } } }
        : { guestGame: { connect: { id: gameReference.guestGameId } } }),
      ...playLogData,
      playedAt: new Date(playLogData.playedAt),
      duration: playLogData.duration ?? null,
      location: playLogData.location || null,
      notes: playLogData.notes || null,
      participants: { create: resolved.data },
    },
  });
  res.status(201).json({ data: playLog });
});

router.put("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = playLogSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({
      error: "Invalid play log update",
      ...(parsed.success ? {} : { details: parsed.error.flatten().fieldErrors }),
    });
    return;
  }

  const existing = await prisma.playLog.findFirst({
    where: {
      id: id.data,
      OR: [
        { game: { is: { deletedGame: { is: null } } } },
        { guestGameId: { not: null } },
      ],
    },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Play log not found" });
    return;
  }
  const { participants, gameId, guestGameName, ...playLogData } = parsed.data;
  const resolved = await resolveParticipants(participants);
  if ("error" in resolved) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const gameReference = await resolveGameReference({ gameId, guestGameName });
  if (!gameReference) {
    res.status(404).json({ error: gameId ? "Game not found" : "Guest game name is required" });
    return;
  }

  await prisma.$transaction([
    prisma.playLog.update({
      where: { id: existing.id },
      data: {
        gameId: gameReference.gameId,
        guestGameId: gameReference.guestGameId,
        ...playLogData,
        playedAt: new Date(playLogData.playedAt),
        duration: playLogData.duration ?? null,
        location: playLogData.location || null,
        notes: playLogData.notes || null,
      },
    }),
    prisma.playLogParticipant.deleteMany({ where: { playLogId: existing.id } }),
    prisma.playLogParticipant.createMany({
      data: resolved.data.map((participant) => ({ ...participant, playLogId: existing.id })),
    }),
  ]);
  res.json({ data: { id: existing.id } });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid play log id" });
    return;
  }
  const existing = await prisma.playLog.findFirst({
    where: {
      id: id.data,
      OR: [
        { game: { is: { deletedGame: { is: null } } } },
        { guestGameId: { not: null } },
      ],
    },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Play log not found" });
    return;
  }
  await prisma.playLog.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
