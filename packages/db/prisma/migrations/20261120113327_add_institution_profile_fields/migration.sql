-- AlterEnum
ALTER TYPE "challenge_statuses" ADD VALUE 'DUPLICATE_MERGED';

-- AlterTable
ALTER TABLE "institutions" ADD COLUMN     "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "faculty_specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lab_facilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "profile_summary" TEXT;
