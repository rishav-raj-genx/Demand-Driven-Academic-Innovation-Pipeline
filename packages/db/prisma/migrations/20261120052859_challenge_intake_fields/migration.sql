-- AlterEnum
ALTER TYPE "challenge_statuses" ADD VALUE 'SUBMITTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "user_roles" ADD VALUE 'CITIZEN';
ALTER TYPE "user_roles" ADD VALUE 'GOVT_OFFICIAL';

-- DropForeignKey
ALTER TABLE "challenges" DROP CONSTRAINT "challenges_industry_partner_id_fkey";

-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "canonical_id" UUID,
ADD COLUMN     "district_id" UUID,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "endorsement_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "media_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
ALTER COLUMN "industry_partner_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "challenges_district_id_idx" ON "challenges"("district_id");

-- CreateIndex
CREATE INDEX "challenges_canonical_id_idx" ON "challenges"("canonical_id");

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_industry_partner_id_fkey" FOREIGN KEY ("industry_partner_id") REFERENCES "industry_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_canonical_id_fkey" FOREIGN KEY ("canonical_id") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
