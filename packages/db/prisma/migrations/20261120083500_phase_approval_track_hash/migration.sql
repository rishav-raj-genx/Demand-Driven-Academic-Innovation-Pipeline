-- AlterTable
ALTER TABLE "phase_approvals" ALTER COLUMN "signer_role" TYPE TEXT;

-- AlterTable
ALTER TABLE "phase_approvals" ADD COLUMN IF NOT EXISTS "snapshot_hash" TEXT;
