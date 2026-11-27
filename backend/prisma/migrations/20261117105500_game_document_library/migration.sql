UPDATE "GameDocument" AS document
SET
  "content" = COALESCE(game."rules", ''),
  "order" = -1,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Game" AS game
WHERE document."gameId" = game."id"
  AND LOWER(document."title") = 'rules';

INSERT INTO "GameDocument" ("id", "gameId", "title", "content", "order", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  game."id",
  'Rules',
  COALESCE(game."rules", ''),
  -1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Game" AS game
WHERE NOT EXISTS (
  SELECT 1
  FROM "GameDocument" AS document
  WHERE document."gameId" = game."id"
    AND LOWER(document."title") = 'rules'
);

ALTER TABLE "Game" DROP COLUMN "rules";
