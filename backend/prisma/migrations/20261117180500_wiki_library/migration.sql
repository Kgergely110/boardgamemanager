CREATE TABLE "WikiCategory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiCategory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WikiCategory" ("id", "title", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'General concepts', CURRENT_TIMESTAMP);

DROP INDEX "GlossaryEntry_term_key";

ALTER TABLE "GlossaryEntry"
ADD COLUMN "categoryId" TEXT;

UPDATE "GlossaryEntry"
SET "categoryId" = '00000000-0000-4000-8000-000000000001';

ALTER TABLE "GlossaryEntry"
ALTER COLUMN "categoryId" SET NOT NULL,
ALTER COLUMN "relatedTerms" SET DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "_TagToWikiEntry" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE TABLE "_GameToWikiEntry" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "WikiCategory_title_key" ON "WikiCategory"("title");
CREATE UNIQUE INDEX "_TagToWikiEntry_AB_unique" ON "_TagToWikiEntry"("A", "B");
CREATE INDEX "_TagToWikiEntry_B_index" ON "_TagToWikiEntry"("B");
CREATE UNIQUE INDEX "_GameToWikiEntry_AB_unique" ON "_GameToWikiEntry"("A", "B");
CREATE INDEX "_GameToWikiEntry_B_index" ON "_GameToWikiEntry"("B");
CREATE INDEX "GlossaryEntry_categoryId_idx" ON "GlossaryEntry"("categoryId");
CREATE UNIQUE INDEX "GlossaryEntry_categoryId_term_key" ON "GlossaryEntry"("categoryId", "term");

ALTER TABLE "GlossaryEntry"
ADD CONSTRAINT "GlossaryEntry_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "WikiCategory"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "_TagToWikiEntry"
ADD CONSTRAINT "_TagToWikiEntry_A_fkey"
FOREIGN KEY ("A") REFERENCES "Tag"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_TagToWikiEntry"
ADD CONSTRAINT "_TagToWikiEntry_B_fkey"
FOREIGN KEY ("B") REFERENCES "GlossaryEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GameToWikiEntry"
ADD CONSTRAINT "_GameToWikiEntry_A_fkey"
FOREIGN KEY ("A") REFERENCES "Game"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_GameToWikiEntry"
ADD CONSTRAINT "_GameToWikiEntry_B_fkey"
FOREIGN KEY ("B") REFERENCES "GlossaryEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
