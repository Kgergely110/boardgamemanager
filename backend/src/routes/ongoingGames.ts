import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { getElapsedSeconds } from "../lib/ongoingGameTime.js";
import prisma from "../lib/prisma.js";

const router = Router();
const idSchema = z.string().uuid();

const participantSchema = z.object({
  playerId: idSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
}).refine((participant) => Boolean(participant.playerId) !== Boolean(participant.name), {
  message: "Choose an app player or enter a guest name",
});

const startSchema = z.object({
  gameId: idSchema.optional(),
  guestGameName: z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().max(120).nullable().optional(),
  participants: z.array(participantSchema).min(1).max(100),
}).refine((game) => Boolean(game.gameId) !== Boolean(game.guestGameName), {
  message: "Choose either a library game or a guest game name",
});

const ongoingGameInclude = {
  game: {
    select: {
      id: true,
      name: true,
      maker: true,
      minPlayers: true,
      maxPlayers: true,
      playTime: true,
      imageUrl: true,
      shelfNumber: true,
      tags: { select: { id: true, name: true } },
      shelf: { select: { id: true, name: true, type: true } },
    },
  },
  guestGame: { select: { id: true, name: true } },
  participants: {
    orderBy: { createdAt: "asc" },
    select: { id: true, playerId: true, displayName: true },
  },
} satisfies Prisma.OngoingGameInclude;

function includeElapsedSeconds<T extends {
  startedAt: Date;
  pausedAt: Date | null;
  pausedDurationSeconds: number;
}>(ongoingGame: T, now = new Date()) {
  return { ...ongoingGame, elapsedSeconds: getElapsedSeconds(ongoingGame, now) };
}

router.get("/", async (_req: Request, res: Response) => {
  const data = await prisma.ongoingGame.findMany({
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    include: ongoingGameInclude,
  });
  res.json({ data: data.map((ongoingGame) => includeElapsedSeconds(ongoingGame)) });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid ongoing game",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { gameId, guestGameName, location, participants } = parsed.data;
  const playerIds = participants.flatMap((participant) => participant.playerId ? [participant.playerId] : []);
  if (new Set(playerIds).size !== playerIds.length) {
    res.status(400).json({ error: "An app player can only be added once" });
    return;
  }
  const guestNames = participants.flatMap((participant) => participant.name
    ? [participant.name.trim().replace(/\s+/g, " ").toLocaleLowerCase()]
    : []);
  if (new Set(guestNames).size !== guestNames.length) {
    res.status(400).json({ error: "A guest player can only be added once" });
    return;
  }

  let game: { id: string; minPlayers: number | null; maxPlayers: number | null } | null = null;
  if (gameId) {
    game = await prisma.game.findFirst({
      where: { id: gameId, deletedGame: { is: null } },
      select: { id: true, minPlayers: true, maxPlayers: true },
    });
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
  }

  const minimumPlayers = game?.minPlayers ?? 1;
  if (participants.length < minimumPlayers) {
    res.status(400).json({ error: `This game requires at least ${minimumPlayers} players` });
    return;
  }
  if (game?.maxPlayers !== null && game?.maxPlayers !== undefined && participants.length > game.maxPlayers) {
    res.status(400).json({ error: `This game allows at most ${game.maxPlayers} players` });
    return;
  }

  const appPlayers = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds }, username: { not: null } },
        select: { id: true, fullName: true },
      })
    : [];
  if (appPlayers.length !== playerIds.length) {
    res.status(400).json({ error: "One or more selected app users could not be found" });
    return;
  }
  const appPlayersById = new Map(appPlayers.map((appPlayer) => [appPlayer.id, appPlayer]));
  const participantData = participants.map((participant) => ({
    playerId: participant.playerId ?? null,
    displayName: participant.playerId
      ? appPlayersById.get(participant.playerId)?.fullName ?? ""
      : participant.name ?? "",
  }));
  if (participantData.some((participant) => !participant.displayName)) {
    res.status(400).json({ error: "One or more players could not be resolved" });
    return;
  }

  const data = await prisma.$transaction(async (transaction) => {
    let guestGameId: string | null = null;
    if (guestGameName) {
      const name = guestGameName.trim().replace(/\s+/g, " ");
      const guestGame = await transaction.guestGame.upsert({
        where: { normalizedName: name.toLocaleLowerCase() },
        update: {},
        create: { name, normalizedName: name.toLocaleLowerCase() },
        select: { id: true },
      });
      guestGameId = guestGame.id;
    }
    return transaction.ongoingGame.create({
      data: {
        gameId: game?.id ?? null,
        guestGameId,
        location: location?.trim() || null,
        participants: { create: participantData },
      },
      include: ongoingGameInclude,
    });
  });
  res.status(201).json({ data: includeElapsedSeconds(data) });
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid ongoing game id" });
    return;
  }
  const data = await prisma.ongoingGame.findUnique({
    where: { id: id.data },
    include: ongoingGameInclude,
  });
  if (!data) {
    res.status(404).json({ error: "Ongoing game not found" });
    return;
  }
  res.json({ data: includeElapsedSeconds(data) });
});

router.post("/:id/pause", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid ongoing game id" });
    return;
  }
  const current = await prisma.ongoingGame.findUnique({
    where: { id: id.data },
    select: { id: true, pausedAt: true },
  });
  if (!current) {
    res.status(404).json({ error: "Ongoing game not found" });
    return;
  }
  if (current.pausedAt) {
    res.status(409).json({ error: "This game is already paused" });
    return;
  }
  const updated = await prisma.ongoingGame.updateMany({
    where: { id: current.id, pausedAt: null },
    data: { pausedAt: new Date() },
  });
  if (updated.count !== 1) {
    res.status(409).json({ error: "The game state changed; refresh and try again" });
    return;
  }
  const data = await prisma.ongoingGame.findUnique({
    where: { id: current.id },
    include: ongoingGameInclude,
  });
  if (!data) {
    res.status(404).json({ error: "Ongoing game not found" });
    return;
  }
  res.json({ data: includeElapsedSeconds(data) });
});

router.post("/:id/resume", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid ongoing game id" });
    return;
  }
  const current = await prisma.ongoingGame.findUnique({
    where: { id: id.data },
    select: { id: true, pausedAt: true },
  });
  if (!current) {
    res.status(404).json({ error: "Ongoing game not found" });
    return;
  }
  if (!current.pausedAt) {
    res.status(409).json({ error: "This game is not paused" });
    return;
  }
  const now = new Date();
  const pauseSeconds = Math.max(0, Math.floor((now.getTime() - current.pausedAt.getTime()) / 1000));
  const updated = await prisma.ongoingGame.updateMany({
    where: { id: current.id, pausedAt: current.pausedAt },
    data: { pausedAt: null, pausedDurationSeconds: { increment: pauseSeconds } },
  });
  if (updated.count !== 1) {
    res.status(409).json({ error: "The game state changed; refresh and try again" });
    return;
  }
  const data = await prisma.ongoingGame.findUnique({
    where: { id: current.id },
    include: ongoingGameInclude,
  });
  if (!data) {
    res.status(404).json({ error: "Ongoing game not found" });
    return;
  }
  res.json({ data: includeElapsedSeconds(data) });
});

router.post("/:id/finish", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid ongoing game id" });
    return;
  }

  const data = await prisma.$transaction(async (transaction) => {
    const ongoingGame = await transaction.ongoingGame.findUnique({
      where: { id: id.data },
      include: { participants: { orderBy: { createdAt: "asc" } } },
    });
    if (!ongoingGame) return null;

    const finishedAt = new Date();
    const elapsedSeconds = getElapsedSeconds(ongoingGame, finishedAt);
    const duration = Math.max(1, Math.round(elapsedSeconds / 60));
    const removed = await transaction.ongoingGame.deleteMany({ where: { id: ongoingGame.id } });
    if (removed.count !== 1) return null;

    return transaction.playLog.create({
      data: {
        gameId: ongoingGame.gameId,
        guestGameId: ongoingGame.guestGameId,
        playedAt: ongoingGame.startedAt,
        duration,
        location: ongoingGame.location,
        participants: {
          create: ongoingGame.participants.map((participant) => ({
            playerId: participant.playerId,
            displayName: participant.displayName,
            placement: null,
            score: null,
          })),
        },
      },
    });
  });
  if (!data) {
    res.status(404).json({ error: "Ongoing game not found or already finished" });
    return;
  }
  res.status(201).json({ data });
});

export default router;
