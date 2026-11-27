CREATE TABLE "GameNight" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GameNight_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlayLog" ADD COLUMN "gameNightId" TEXT;
ALTER TABLE "OngoingGame" ADD COLUMN "gameNightId" TEXT;

CREATE INDEX "GameNight_endedAt_startedAt_idx" ON "GameNight"("endedAt", "startedAt");
CREATE INDEX "PlayLog_gameNightId_idx" ON "PlayLog"("gameNightId");
CREATE INDEX "OngoingGame_gameNightId_idx" ON "OngoingGame"("gameNightId");

ALTER TABLE "PlayLog"
ADD CONSTRAINT "PlayLog_gameNightId_fkey"
FOREIGN KEY ("gameNightId") REFERENCES "GameNight"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OngoingGame"
ADD CONSTRAINT "OngoingGame_gameNightId_fkey"
FOREIGN KEY ("gameNightId") REFERENCES "GameNight"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
