-- AlterTable
ALTER TABLE "users" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "display_name" TEXT,
ALTER COLUMN "wallet_address" DROP NOT NULL;
