ALTER TABLE "Game" ADD COLUMN "stackedOnId" TEXT;

CREATE INDEX "Game_stackedOnId_idx" ON "Game"("stackedOnId");

ALTER TABLE "Game"
ADD CONSTRAINT "Game_stackedOnId_fkey"
FOREIGN KEY ("stackedOnId") REFERENCES "Game"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
