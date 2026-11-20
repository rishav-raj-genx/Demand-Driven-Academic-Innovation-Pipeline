-- AlterEnum
ALTER TYPE "challenge_statuses" ADD VALUE IF NOT EXISTS 'IN_PROJECT';

-- AlterEnum
ALTER TYPE "approval_decisions" ADD VALUE IF NOT EXISTS 'SUBMITTED_FOR_APPROVAL';

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_industry_partner_id_fkey";

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "industry_partner_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_industry_partner_id_fkey" FOREIGN KEY ("industry_partner_id") REFERENCES "industry_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "summary" TEXT,
ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
ADD COLUMN IF NOT EXISTS "artifact_keys" TEXT[] DEFAULT ARRAY[]::TEXT[];
