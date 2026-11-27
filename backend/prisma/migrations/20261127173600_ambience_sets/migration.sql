CREATE TABLE "AmbienceSet" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmbienceSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AmbienceLink" (
  "id" TEXT NOT NULL,
  "ambienceSetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "uri" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmbienceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_AmbienceSetGames" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE TABLE "_AmbienceSetTags" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_AmbienceSetGames_AB_unique" ON "_AmbienceSetGames"("A", "B");
CREATE INDEX "_AmbienceSetGames_B_index" ON "_AmbienceSetGames"("B");
CREATE UNIQUE INDEX "_AmbienceSetTags_AB_unique" ON "_AmbienceSetTags"("A", "B");
CREATE INDEX "_AmbienceSetTags_B_index" ON "_AmbienceSetTags"("B");
CREATE INDEX "AmbienceSet_name_idx" ON "AmbienceSet"("name");
CREATE INDEX "AmbienceLink_ambienceSetId_position_idx" ON "AmbienceLink"("ambienceSetId", "position");

ALTER TABLE "AmbienceLink"
ADD CONSTRAINT "AmbienceLink_ambienceSetId_fkey"
FOREIGN KEY ("ambienceSetId") REFERENCES "AmbienceSet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_AmbienceSetGames"
ADD CONSTRAINT "_AmbienceSetGames_A_fkey"
FOREIGN KEY ("A") REFERENCES "AmbienceSet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_AmbienceSetGames"
ADD CONSTRAINT "_AmbienceSetGames_B_fkey"
FOREIGN KEY ("B") REFERENCES "Game"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_AmbienceSetTags"
ADD CONSTRAINT "_AmbienceSetTags_A_fkey"
FOREIGN KEY ("A") REFERENCES "AmbienceSet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_AmbienceSetTags"
ADD CONSTRAINT "_AmbienceSetTags_B_fkey"
FOREIGN KEY ("B") REFERENCES "Tag"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
