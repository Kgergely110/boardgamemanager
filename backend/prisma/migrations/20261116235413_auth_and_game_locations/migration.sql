-- DropIndex
DROP INDEX "Player_email_idx";

-- DropIndex
DROP INDEX "Player_username_idx";

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "shelfNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;
