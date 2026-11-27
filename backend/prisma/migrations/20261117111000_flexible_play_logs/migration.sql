ALTER TABLE "PlayLog"
ADD COLUMN "location" TEXT;

ALTER TABLE "PlayLogParticipant"
ADD COLUMN "displayName" TEXT;

UPDATE "PlayLogParticipant" AS participant
SET "displayName" = COALESCE(NULLIF(BTRIM(player."fullName"), ''), player."username", 'Unknown player')
FROM "Player" AS player
WHERE participant."playerId" = player."id";

ALTER TABLE "PlayLogParticipant"
ALTER COLUMN "displayName" SET NOT NULL,
ALTER COLUMN "playerId" DROP NOT NULL;

ALTER TABLE "PlayLogParticipant"
DROP CONSTRAINT "PlayLogParticipant_playerId_fkey";

ALTER TABLE "PlayLogParticipant"
ADD CONSTRAINT "PlayLogParticipant_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PlayLog_duration_idx" ON "PlayLog"("duration");
CREATE INDEX "PlayLogParticipant_playLogId_placement_idx"
ON "PlayLogParticipant"("playLogId", "placement");
