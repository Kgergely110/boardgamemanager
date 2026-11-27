CREATE TABLE "GuestGame" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestGame_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlayLog"
ALTER COLUMN "gameId" DROP NOT NULL,
ADD COLUMN "guestGameId" TEXT;

CREATE UNIQUE INDEX "GuestGame_normalizedName_key" ON "GuestGame"("normalizedName");
CREATE INDEX "GuestGame_name_idx" ON "GuestGame"("name");
CREATE INDEX "PlayLog_guestGameId_idx" ON "PlayLog"("guestGameId");

ALTER TABLE "PlayLog"
ADD CONSTRAINT "PlayLog_guestGameId_fkey"
FOREIGN KEY ("guestGameId") REFERENCES "GuestGame"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "PlayLog_exactly_one_game_check"
CHECK (("gameId" IS NOT NULL) <> ("guestGameId" IS NOT NULL));
