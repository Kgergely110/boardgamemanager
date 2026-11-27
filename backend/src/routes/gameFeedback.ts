import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { sendApiError, sendValidationError } from "../lib/http.js";

const router = Router();
export const idSchema = z.string().uuid();
const ratingDimensionSchema = z.number().int().min(1).max(5).nullable();
export const ratingSchema = z.object({
  overall: z.number().int().min(1).max(5),
  luckFactor: ratingDimensionSchema,
  strategyDepth: ratingDimensionSchema,
  socialDeduction: ratingDimensionSchema,
  logicalDeduction: ratingDimensionSchema,
  playerInteraction: ratingDimensionSchema,
  complexity: ratingDimensionSchema,
  comment: z.string().trim().max(2000).nullable(),
});
export const awardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).nullable(),
  year: z.number().int().min(1800).max(2200).nullable(),
});

const ratingSelect = {
  id: true,
  playerId: true,
  overall: true,
  luckFactor: true,
  strategyDepth: true,
  socialDeduction: true,
  logicalDeduction: true,
  playerInteraction: true,
  complexity: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  player: { select: { fullName: true } },
} satisfies Prisma.GameRatingSelect;

async function findActiveGame(gameId: string): Promise<{ id: string } | null> {
  return prisma.game.findFirst({
    where: { id: gameId, deletedGame: { is: null } },
    select: { id: true },
  });
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function average(values: Array<number | null>): { average: number | null; count: number } {
  const rated = values.filter((value): value is number => value !== null);
  return {
    average: rated.length
      ? Math.round((rated.reduce((total, value) => total + value, 0) / rated.length) * 10) / 10
      : null,
    count: rated.length,
  };
}

router.get("/:gameId/reviews", async (req: Request, res: Response) => {
  const gameId = idSchema.safeParse(req.params.gameId);
  if (!gameId.success) {
    sendValidationError(res, gameId.error, "Invalid request");
    return;
  }
  if (!(await findActiveGame(gameId.data))) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const [ratings, awards] = await Promise.all([
    prisma.gameRating.findMany({
      where: { gameId: gameId.data },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: ratingSelect,
    }),
    prisma.gameAward.findMany({
      where: { gameId: gameId.data },
      orderBy: [{ year: "desc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, year: true, createdAt: true },
    }),
  ]);
  const publicRatings = ratings.map(({ playerId, player, ...rating }) => ({
    ...rating,
    playerName: player.fullName,
    isMine: playerId === req.user?.playerId,
  }));
  const ratingFor = (
    field: "overall" | "luckFactor" | "strategyDepth" | "socialDeduction" |
      "logicalDeduction" | "playerInteraction" | "complexity",
  ) => average(ratings.map((rating) => rating[field]));

  res.json({
    data: {
      ratingCount: ratings.length,
      overallAverage: ratingFor("overall").average,
      dimensionAverages: {
        luckFactor: ratingFor("luckFactor"),
        strategyDepth: ratingFor("strategyDepth"),
        socialDeduction: ratingFor("socialDeduction"),
        logicalDeduction: ratingFor("logicalDeduction"),
        playerInteraction: ratingFor("playerInteraction"),
        complexity: ratingFor("complexity"),
      },
      myRating: publicRatings.find((rating) => rating.isMine) ?? null,
      ratings: publicRatings,
      awards,
    },
  });
});

router.put("/:gameId/ratings/me", async (req: Request, res: Response) => {
  const gameId = idSchema.safeParse(req.params.gameId);
  const result = ratingSchema.safeParse(req.body);
  if (!gameId.success || !result.success) {
    if (!gameId.success) sendValidationError(res, gameId.error, "Invalid request");
    else if (!result.success) sendValidationError(res, result.error, "Invalid request");
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to rate a game");
    return;
  }
  if (!(await findActiveGame(gameId.data))) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const rating = await prisma.gameRating.upsert({
    where: { gameId_playerId: { gameId: gameId.data, playerId } },
    create: {
      gameId: gameId.data,
      playerId,
      ...result.data,
      comment: result.data.comment || null,
    },
    update: {
      ...result.data,
      comment: result.data.comment || null,
    },
    select: { id: true },
  });
  res.json({ data: { id: rating.id } });
});

router.delete("/:gameId/ratings/me", async (req: Request, res: Response) => {
  const gameId = idSchema.safeParse(req.params.gameId);
  if (!gameId.success) {
    sendValidationError(res, gameId.error, "Invalid request");
    return;
  }
  const playerId = req.user?.playerId;
  if (!playerId) {
    sendApiError(res, 401, "Sign in to remove your rating");
    return;
  }
  if (!(await findActiveGame(gameId.data))) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const deleted = await prisma.gameRating.deleteMany({
    where: { gameId: gameId.data, playerId },
  });
  if (deleted.count === 0) {
    res.status(404).json({ error: "Your rating was not found" });
    return;
  }
  res.status(204).end();
});

router.post("/:gameId/awards", async (req: Request, res: Response) => {
  const gameId = idSchema.safeParse(req.params.gameId);
  const result = awardSchema.safeParse(req.body);
  if (!gameId.success || !result.success) {
    if (!gameId.success) sendValidationError(res, gameId.error, "Invalid request");
    else if (!result.success) sendValidationError(res, result.error, "Invalid request");
    return;
  }
  if (!(await findActiveGame(gameId.data))) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const name = result.data.name.trim().replace(/\s+/g, " ");
  const category = result.data.category?.trim().replace(/\s+/g, " ") || null;
  const normalizedKey = JSON.stringify([
    normalizedText(name),
    category ? normalizedText(category) : "",
    result.data.year,
  ]);
  try {
    const award = await prisma.gameAward.create({
      data: {
        gameId: gameId.data,
        name,
        category,
        year: result.data.year,
        normalizedKey,
      },
      select: { id: true, name: true, category: true, year: true, createdAt: true },
    });
    res.status(201).json({ data: award });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      sendApiError(res, 409, "This award is already recorded for the game");
      return;
    }
    throw error;
  }
});

router.delete("/:gameId/awards/:awardId", async (req: Request, res: Response) => {
  const gameId = idSchema.safeParse(req.params.gameId);
  const awardId = idSchema.safeParse(req.params.awardId);
  if (!gameId.success) {
    sendValidationError(res, gameId.error, "Invalid request");
    return;
  }
  if (!awardId.success) {
    sendValidationError(res, awardId.error, "Invalid request");
    return;
  }
  if (!(await findActiveGame(gameId.data))) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const deleted = await prisma.gameAward.deleteMany({
    where: { id: awardId.data, gameId: gameId.data },
  });
  if (deleted.count === 0) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  res.status(204).end();
});

export default router;
