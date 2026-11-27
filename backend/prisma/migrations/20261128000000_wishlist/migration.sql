CREATE TYPE "WishlistStatus" AS ENUM ('CONSIDERING', 'WANTED', 'ORDERED', 'ACQUIRED', 'ARCHIVED');
CREATE TYPE "WishlistPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "maker" TEXT,
    "releaseYear" INTEGER,
    "description" TEXT,
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "minPlayers" INTEGER,
    "maxPlayers" INTEGER,
    "ageLimit" INTEGER,
    "playTime" INTEGER,
    "estimatedPriceCents" INTEGER,
    "currency" TEXT,
    "notes" TEXT,
    "status" "WishlistStatus" NOT NULL DEFAULT 'WANTED',
    "priority" "WishlistPriority" NOT NULL DEFAULT 'NORMAL',
    "addedById" TEXT NOT NULL,
    "gameId" TEXT,
    "acquiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WishlistInterest" (
    "id" TEXT NOT NULL,
    "wishlistItemId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WishlistInterest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_TagToWishlistItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "WishlistItem_gameId_key" ON "WishlistItem"("gameId");
CREATE INDEX "WishlistItem_status_priority_createdAt_idx" ON "WishlistItem"("status", "priority", "createdAt");
CREATE INDEX "WishlistItem_title_idx" ON "WishlistItem"("title");
CREATE INDEX "WishlistItem_addedById_idx" ON "WishlistItem"("addedById");
CREATE INDEX "WishlistInterest_playerId_idx" ON "WishlistInterest"("playerId");
CREATE UNIQUE INDEX "WishlistInterest_wishlistItemId_playerId_key" ON "WishlistInterest"("wishlistItemId", "playerId");
CREATE UNIQUE INDEX "_TagToWishlistItem_AB_unique" ON "_TagToWishlistItem"("A", "B");
CREATE INDEX "_TagToWishlistItem_B_index" ON "_TagToWishlistItem"("B");

ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WishlistInterest" ADD CONSTRAINT "WishlistInterest_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistInterest" ADD CONSTRAINT "WishlistInterest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_TagToWishlistItem" ADD CONSTRAINT "_TagToWishlistItem_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_TagToWishlistItem" ADD CONSTRAINT "_TagToWishlistItem_B_fkey" FOREIGN KEY ("B") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
