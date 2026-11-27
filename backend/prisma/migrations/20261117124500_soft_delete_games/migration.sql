CREATE TABLE "DeletedGame" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maker" TEXT NOT NULL,
  "releaseYear" INTEGER,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeletedGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeletedGame_gameId_key" ON "DeletedGame"("gameId");
CREATE INDEX "DeletedGame_name_idx" ON "DeletedGame"("name");

ALTER TABLE "DeletedGame"
ADD CONSTRAINT "DeletedGame_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
