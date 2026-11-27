CREATE TABLE "GameRating" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "luckFactor" INTEGER,
    "strategyDepth" INTEGER,
    "socialDeduction" INTEGER,
    "logicalDeduction" INTEGER,
    "playerInteraction" INTEGER,
    "complexity" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameRating_score_check" CHECK (
        "overall" BETWEEN 1 AND 5
        AND ("luckFactor" IS NULL OR "luckFactor" BETWEEN 1 AND 5)
        AND ("strategyDepth" IS NULL OR "strategyDepth" BETWEEN 1 AND 5)
        AND ("socialDeduction" IS NULL OR "socialDeduction" BETWEEN 1 AND 5)
        AND ("logicalDeduction" IS NULL OR "logicalDeduction" BETWEEN 1 AND 5)
        AND ("playerInteraction" IS NULL OR "playerInteraction" BETWEEN 1 AND 5)
        AND ("complexity" IS NULL OR "complexity" BETWEEN 1 AND 5)
    )
);

CREATE TABLE "GameAward" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "year" INTEGER,
    "normalizedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAward_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameAward_year_check" CHECK (
        "year" IS NULL OR "year" BETWEEN 1800 AND 2200
    )
);

CREATE UNIQUE INDEX "GameRating_gameId_playerId_key" ON "GameRating"("gameId", "playerId");
CREATE INDEX "GameRating_playerId_idx" ON "GameRating"("playerId");
CREATE UNIQUE INDEX "GameAward_gameId_normalizedKey_key" ON "GameAward"("gameId", "normalizedKey");
CREATE INDEX "GameAward_gameId_year_idx" ON "GameAward"("gameId", "year");

ALTER TABLE "GameRating"
ADD CONSTRAINT "GameRating_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "GameRating_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameAward"
ADD CONSTRAINT "GameAward_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
