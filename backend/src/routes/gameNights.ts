import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { sendApiError, sendValidationError } from "../lib/http.js";

const router = Router();
export const idSchema = z.string().uuid();
const gameNightInclude = {
  playLogs: {
    select: {
      id: true,
      participants: {
        select: { playerId: true, displayName: true, placement: true },
      },
    },
  },
  _count: { select: { playLogs: true, ongoingGames: true } },
} satisfies Prisma.GameNightInclude;
const gameNightRecapInclude = {
  ...gameNightInclude,
  playLogs: {
    orderBy: [{ playedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      playedAt: true,
      duration: true,
      game: { select: { name: true } },
      guestGame: { select: { name: true } },
      participants: {
        select: { playerId: true, displayName: true, placement: true },
      },
    },
  },
} satisfies Prisma.GameNightInclude;

type GameNightRecord = Prisma.GameNightGetPayload<{ include: typeof gameNightInclude }>;
type GameNightRecapRecord = Prisma.GameNightGetPayload<{ include: typeof gameNightRecapInclude }>;
type Standing = {
  playerId: string | null;
  name: string;
  wins: number;
  points: number;
  gamesPlayed: number;
};

function presentGameNight(gameNight: GameNightRecord) {
  const { playLogs, _count, ...record } = gameNight;
  const players = new Map<string, Standing>();

  for (const log of playLogs) {
    const participantsInGame = new Set<string>();
    for (const participant of log.participants) {
      const normalizedName = participant.displayName.trim().replace(/\s+/g, " ").toLowerCase();
      const key = participant.playerId ? `player:${participant.playerId}` : `guest:${normalizedName}`;
      if (participantsInGame.has(key)) continue;
      participantsInGame.add(key);

      const standing = players.get(key) ?? {
        playerId: participant.playerId,
        name: participant.displayName,
        wins: 0,
        points: 0,
        gamesPlayed: 0,
      };
      standing.gamesPlayed += 1;
      if (participant.placement === 1) standing.wins += 1;
      if (participant.placement === 1) standing.points += 3;
      else if (participant.placement === 2) standing.points += 2;
      else if (participant.placement === 3) standing.points += 1;
      players.set(key, standing);
    }
  }

  const standings = [...players.values()];
  const byWins = [...standings].sort(
    (left, right) => right.wins - left.wins || right.points - left.points || left.name.localeCompare(right.name),
  );
  const byPoints = [...standings].sort(
    (left, right) => right.points - left.points || right.wins - left.wins || left.name.localeCompare(right.name),
  );

  return {
    ...record,
    gameCount: _count.playLogs,
    ongoingGameCount: _count.ongoingGames,
    standings: { byWins, byPoints },
  };
}

function presentGameNightRecap(gameNight: GameNightRecapRecord) {
  return {
    ...presentGameNight(gameNight),
    games: gameNight.playLogs.map((log) => ({
      id: log.id,
      name: log.game?.name ?? log.guestGame?.name ?? "Unknown game",
      playedAt: log.playedAt,
      duration: log.duration,
      participants: log.participants.map((participant) => ({
        name: participant.displayName,
        placement: participant.placement,
      })),
    })),
  };
}

router.get("/", async (_req: Request, res: Response) => {
  const gameNights = await prisma.gameNight.findMany({
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: 12,
    include: gameNightInclude,
  });
  res.json({ data: gameNights.map(presentGameNight) });
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game night request");
    return;
  }

  const gameNight = await prisma.gameNight.findUnique({
    where: { id: id.data },
    include: gameNightRecapInclude,
  });
  if (!gameNight) {
    sendApiError(res, 404, "Game night not found");
    return;
  }
  res.json({ data: presentGameNightRecap(gameNight) });
});

router.post("/", async (_req: Request, res: Response) => {
  const activeNight = await prisma.gameNight.findFirst({
    where: { endedAt: null },
    select: { id: true },
  });
  if (activeNight) {
    sendApiError(res, 409, "A game night is already in progress");
    return;
  }

  const gameNight = await prisma.gameNight.create({ data: {}, include: gameNightInclude });
  res.status(201).json({ data: presentGameNight(gameNight) });
});

router.post("/:id/close", async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error, "Invalid game night request");
    return;
  }

  const result = await prisma.$transaction(async (transaction) => {
    const gameNight = await transaction.gameNight.findUnique({
      where: { id: id.data },
      select: { id: true, endedAt: true },
    });
    if (!gameNight) return { kind: "not-found" as const };
    if (gameNight.endedAt) return { kind: "closed" as const };

    const ongoingCount = await transaction.ongoingGame.count({ where: { gameNightId: id.data } });
    if (ongoingCount > 0) return { kind: "ongoing" as const };

    const updated = await transaction.gameNight.updateMany({
      where: { id: id.data, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (updated.count !== 1) return { kind: "closed" as const };

    const updatedNight = await transaction.gameNight.findUnique({
      where: { id: id.data },
      include: gameNightRecapInclude,
    });
    return updatedNight
      ? { kind: "closed-now" as const, gameNight: updatedNight }
      : { kind: "not-found" as const };
  });

  if (result.kind === "not-found") {
    sendApiError(res, 404, "Game night not found");
    return;
  }
  if (result.kind === "ongoing") {
    sendApiError(res, 409, "Finish all games in this night before closing it");
    return;
  }
  if (result.kind === "closed") {
    sendApiError(res, 409, "This game night is already closed");
    return;
  }
  res.json({ data: presentGameNightRecap(result.gameNight) });
});

export default router;
