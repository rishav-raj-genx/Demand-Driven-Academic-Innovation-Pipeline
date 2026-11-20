-- AlterEnum
ALTER TYPE "csr_entry_statuses" ADD VALUE IF NOT EXISTS 'VERIFIED';

-- AlterTable Project
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "funding_status" TEXT DEFAULT 'UNFUNDED';

-- AlterTable MoU
ALTER TABLE "mous" ADD COLUMN IF NOT EXISTS "mou_number" TEXT,
ADD COLUMN IF NOT EXISTS "pledged_amount_inr" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "ip_ownership_split" JSONB,
ADD COLUMN IF NOT EXISTS "milestone_schedule" JSONB,
ADD COLUMN IF NOT EXISTS "compliance_clause" TEXT,
ADD COLUMN IF NOT EXISTS "hei_acknowledged_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "hei_acknowledged_by" UUID,
ADD COLUMN IF NOT EXISTS "industry_acknowledged_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "industry_acknowledged_by" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "mous_mou_number_key" ON "mous"("mou_number");
CREATE INDEX IF NOT EXISTS "mous_mou_number_idx" ON "mous"("mou_number");

-- AlterTable CsrLedgerEntry
ALTER TABLE "csr_ledger_entries" ADD COLUMN IF NOT EXISTS "milestone_id" UUID,
ADD COLUMN IF NOT EXISTS "payment_mode" TEXT,
ADD COLUMN IF NOT EXISTS "external_reference_no" TEXT,
ADD COLUMN IF NOT EXISTS "receipt_key" TEXT,
ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verified_by" UUID;

CREATE INDEX IF NOT EXISTS "csr_ledger_entries_milestone_id_idx" ON "csr_ledger_entries"("milestone_id");

-- Foreign key for milestone
ALTER TABLE "csr_ledger_entries" DROP CONSTRAINT IF EXISTS "csr_ledger_entries_milestone_id_fkey";
ALTER TABLE "csr_ledger_entries" ADD CONSTRAINT "csr_ledger_entries_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
