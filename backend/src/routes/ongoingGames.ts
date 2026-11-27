import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { getElapsedSeconds } from "../lib/ongoingGameTime.js";
import prisma from "../lib/prisma.js";
import { sendApiError, sendValidationError } from "../lib/http.js";

const router = Router();
export const idSchema = z.string().uuid();

export const participantSchema = z.object({
  playerId: idSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
}).refine((participant) => Boolean(participant.playerId) !== Boolean(participant.name), {
  message: "Choose an app player or enter a guest name",
});

export const startSchema = z.object({
  gameId: idSchema.optional(),
  guestGameName: z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().max(120).nullable().optional(),
  gameNightId: idSchema.nullable().optional(),
  participants: z.array(participantSchema).min(1).max(100),
}).refine((game) => Boolean(game.gameId) !== Boolean(game.guestGameName), {
  message: "Choose either a library game or a guest game name",
});

export const finishSchema = z.object({
  results: z.array(z.object({
    participantId: idSchema,
    placement: z.number().int().min(1).max(100).nullable(),
    score: z.number().int().min(-1_000_000_000).max(1_000_000_000).nullable(),
  })).max(100).optional(),
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
    sendValidationError(res, parsed.error, "Invalid ongoing game");
    return;
  }

  const { gameId, guestGameName, location, gameNightId, participants } = parsed.data;
  const playerIds = participants.flatMap((participant) => participant.playerId ? [participant.playerId] : []);
  if (new Set(playerIds).size !== playerIds.length) {
    sendApiError(res, 422, "An app player can only be added once");
    return;
  }
  const guestNames = participants.flatMap((participant) => participant.name
    ? [participant.name.trim().replace(/\s+/g, " ").toLocaleLowerCase()]
    : []);
  if (new Set(guestNames).size !== guestNames.length) {
    sendApiError(res, 422, "A guest player can only be added once");
    return;
  }

  let game: { id: string; minPlayers: number | null; maxPlayers: number | null } | null = null;
  if (gameId) {
    game = await prisma.game.findFirst({
      where: { id: gameId, deletedGame: { is: null } },
      select: { id: true, minPlayers: true, maxPlayers: true },
    });
    if (!game) {
      sendApiError(res, 404, "Game not found");
      return;
    }
  }

  const minimumPlayers = game?.minPlayers ?? 1;
  if (participants.length < minimumPlayers) {
    sendApiError(res, 422, `This game requires at least ${minimumPlayers} players`);
    return;
  }
  if (game?.maxPlayers !== null && game?.maxPlayers !== undefined && participants.length > game.maxPlayers) {
    sendApiError(res, 422, `This game allows at most ${game.maxPlayers} players`);
    return;
  }

  const appPlayers = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds }, username: { not: null } },
        select: { id: true, fullName: true },
      })
    : [];
  if (appPlayers.length !== playerIds.length) {
    sendApiError(res, 422, "One or more selected app users could not be found");
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
    sendApiError(res, 422, "One or more players could not be resolved");
    return;
  }

  const data = await prisma.$transaction(async (transaction) => {
    if (gameNightId) {
      const activeNight = await transaction.gameNight.findFirst({
        where: { id: gameNightId, endedAt: null },
        select: { id: true },
      });
      if (!activeNight) return null;
    }

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
        gameNightId: gameNightId ?? null,
        location: location?.trim() || null,
        participants: { create: participantData },
      },
      include: ongoingGameInclude,
    });
  });
  if (!data) {
    sendApiError(res, 409, "That game night is no longer active. Refresh the page and try again.");
    return;
  }
  res.status(201).json({ data: includeElapsedSeconds(data) });
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid ongoing game id");
    return;
  }
  const data = await prisma.ongoingGame.findUnique({
    where: { id: id.data },
    include: ongoingGameInclude,
  });
  if (!data) {
    sendApiError(res, 404, "Ongoing game not found");
    return;
  }
  res.json({ data: includeElapsedSeconds(data) });
});

router.post("/:id/pause", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid ongoing game id");
    return;
  }
  const current = await prisma.ongoingGame.findUnique({
    where: { id: id.data },
    select: { id: true, pausedAt: true },
  });
  if (!current) {
    sendApiError(res, 404, "Ongoing game not found");
    return;
  }
  if (current.pausedAt) {
    sendApiError(res, 409, "This game is already paused");
    return;
  }
  const updated = await prisma.ongoingGame.updateMany({
    where: { id: current.id, pausedAt: null },
    data: { pausedAt: new Date() },
  });
  if (updated.count !== 1) {
    sendApiError(res, 409, "The game state changed; refresh and try again");
    return;
  }
  const data = await prisma.ongoingGame.findUnique({
    where: { id: current.id },
    include: ongoingGameInclude,
  });
  if (!data) {
    sendApiError(res, 404, "Ongoing game not found");
    return;
  }
  res.json({ data: includeElapsedSeconds(data) });
});

router.post("/:id/resume", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid ongoing game id");
    return;
  }
  const current = await prisma.ongoingGame.findUnique({
    where: { id: id.data },
    select: { id: true, pausedAt: true },
  });
  if (!current) {
    sendApiError(res, 404, "Ongoing game not found");
    return;
  }
  if (!current.pausedAt) {
    sendApiError(res, 409, "This game is not paused");
    return;
  }
  const now = new Date();
  const pauseSeconds = Math.max(0, Math.floor((now.getTime() - current.pausedAt.getTime()) / 1000));
  const updated = await prisma.ongoingGame.updateMany({
    where: { id: current.id, pausedAt: current.pausedAt },
    data: { pausedAt: null, pausedDurationSeconds: { increment: pauseSeconds } },
  });
  if (updated.count !== 1) {
    sendApiError(res, 409, "The game state changed; refresh and try again");
    return;
  }
  const data = await prisma.ongoingGame.findUnique({
    where: { id: current.id },
    include: ongoingGameInclude,
  });
  if (!data) {
    sendApiError(res, 404, "Ongoing game not found");
    return;
  }
  res.json({ data: includeElapsedSeconds(data) });
});

router.post("/:id/finish", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid ongoing game id");
    return;
  }
  const parsedFinish = finishSchema.safeParse(req.body ?? {});
  if (!parsedFinish.success) {
    sendValidationError(res, parsedFinish.error, "Invalid game results");
    return;
  }

  const result = await prisma.$transaction(async (transaction) => {
    const ongoingGame = await transaction.ongoingGame.findUnique({
      where: { id: id.data },
      include: { participants: { orderBy: { createdAt: "asc" } } },
    });
    if (!ongoingGame) return { kind: "not-found" as const };

    const results = parsedFinish.data.results;
    if (results) {
      const participantIds = new Set(ongoingGame.participants.map((participant) => participant.id));
      const resultIds = new Set(results.map((result) => result.participantId));
      if (
        results.length !== ongoingGame.participants.length ||
        resultIds.size !== results.length ||
        results.some((result) => !participantIds.has(result.participantId) ||
          (result.placement !== null && result.placement > ongoingGame.participants.length))
      ) {
        return { kind: "invalid-results" as const };
      }
    }
    const resultsByParticipant = new Map(results?.map((result) => [result.participantId, result]) ?? []);

    const finishedAt = new Date();
    const elapsedSeconds = getElapsedSeconds(ongoingGame, finishedAt);
    const duration = Math.max(1, Math.round(elapsedSeconds / 60));
    const removed = await transaction.ongoingGame.deleteMany({ where: { id: ongoingGame.id } });
    if (removed.count !== 1) return { kind: "not-found" as const };

    const playLog = await transaction.playLog.create({
      data: {
        gameId: ongoingGame.gameId,
        guestGameId: ongoingGame.guestGameId,
        gameNightId: ongoingGame.gameNightId,
        playedAt: ongoingGame.startedAt,
        duration,
        location: ongoingGame.location,
        participants: {
          create: ongoingGame.participants.map((participant) => ({
            playerId: participant.playerId,
            displayName: participant.displayName,
            placement: resultsByParticipant.get(participant.id)?.placement ?? null,
            score: resultsByParticipant.get(participant.id)?.score ?? null,
          })),
        },
      },
    });
    return { kind: "created" as const, data: playLog };
  });
  if (result.kind === "not-found") {
    sendApiError(res, 404, "Ongoing game not found or already finished");
    return;
  }
  if (result.kind === "invalid-results") {
    sendApiError(res, 422, "Provide exactly one valid result for each player at this table");
    return;
  }
  res.status(201).json({ data: result.data });
});

export default router;
