CREATE TABLE "OngoingGame" (
  "id" TEXT NOT NULL,
  "gameId" TEXT,
  "guestGameId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "pausedDurationSeconds" INTEGER NOT NULL DEFAULT 0,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OngoingGame_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OngoingGame_game_or_guest_check"
    CHECK (("gameId" IS NOT NULL AND "guestGameId" IS NULL) OR ("gameId" IS NULL AND "guestGameId" IS NOT NULL)),
  CONSTRAINT "OngoingGame_paused_duration_check"
    CHECK ("pausedDurationSeconds" >= 0)
);

CREATE TABLE "OngoingGameParticipant" (
  "id" TEXT NOT NULL,
  "ongoingGameId" TEXT NOT NULL,
  "playerId" TEXT,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OngoingGameParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OngoingGameParticipant_ongoingGameId_playerId_key"
ON "OngoingGameParticipant"("ongoingGameId", "playerId");

CREATE INDEX "OngoingGame_gameId_idx" ON "OngoingGame"("gameId");
CREATE INDEX "OngoingGame_guestGameId_idx" ON "OngoingGame"("guestGameId");
CREATE INDEX "OngoingGame_startedAt_idx" ON "OngoingGame"("startedAt");
CREATE INDEX "OngoingGameParticipant_ongoingGameId_idx" ON "OngoingGameParticipant"("ongoingGameId");
CREATE INDEX "OngoingGameParticipant_playerId_idx" ON "OngoingGameParticipant"("playerId");

ALTER TABLE "OngoingGame"
ADD CONSTRAINT "OngoingGame_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OngoingGame"
ADD CONSTRAINT "OngoingGame_guestGameId_fkey"
FOREIGN KEY ("guestGameId") REFERENCES "GuestGame"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OngoingGameParticipant"
ADD CONSTRAINT "OngoingGameParticipant_ongoingGameId_fkey"
FOREIGN KEY ("ongoingGameId") REFERENCES "OngoingGame"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OngoingGameParticipant"
ADD CONSTRAINT "OngoingGameParticipant_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
