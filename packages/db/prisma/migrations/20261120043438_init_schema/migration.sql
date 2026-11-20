-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "user_roles" AS ENUM ('STUDENT', 'FACULTY', 'RESEARCHER', 'INSTITUTION_ADMIN', 'INDUSTRY_PARTNER', 'INVESTOR', 'CSR_PARTNER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "institution_tiers" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'UNACCREDITED');

-- CreateEnum
CREATE TYPE "verification_statuses" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "challenge_statuses" AS ENUM ('DRAFT', 'OPEN', 'UNDER_REVIEW', 'MATCHED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "project_phases" AS ENUM ('POC', 'PROTOTYPING', 'FIELD_TEST', 'IP_TECH_TRANSFER');

-- CreateEnum
CREATE TYPE "approval_decisions" AS ENUM ('APPROVED', 'REJECTED', 'REQUESTED_CHANGES', 'PENDING');

-- CreateEnum
CREATE TYPE "csr_entry_statuses" AS ENUM ('SUBMITTED', 'ELIGIBLE', 'INELIGIBLE', 'ALLOCATED', 'DISBURSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "user_roles" NOT NULL DEFAULT 'STUDENT',
    "phone_number" TEXT,
    "avatar_url" TEXT,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "verification_statuses" NOT NULL DEFAULT 'PENDING',
    "institution_id" UUID,
    "industry_partner_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "boundary" geometry(MultiPolygon, 4326),
    "centroid" geometry(Point, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" "institution_tiers" NOT NULL DEFAULT 'TIER_3',
    "district_id" UUID,
    "address" TEXT,
    "website" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "verification_status" "verification_statuses" NOT NULL DEFAULT 'PENDING',
    "location" geometry(Point, 4326),
    "capability_embedding" vector(384),
    "active_projects" INTEGER NOT NULL DEFAULT 0,
    "max_capacity" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_partners" (
    "id" UUID NOT NULL,
    "organization_name" TEXT NOT NULL,
    "cin" TEXT,
    "industry_sector" TEXT NOT NULL,
    "district_id" UUID,
    "website" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "verification_status" "verification_statuses" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "problem_statement" TEXT NOT NULL,
    "industry_partner_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "status" "challenge_statuses" NOT NULL DEFAULT 'OPEN',
    "category" TEXT,
    "budget_range" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "location" geometry(Point, 4326),
    "embedding" vector(384),
    "client_idempotency_key" TEXT,
    "deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_matches" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "similarity_score" DOUBLE PRECISION NOT NULL,
    "match_rank" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capability_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "challenge_id" UUID,
    "institution_id" UUID NOT NULL,
    "industry_partner_id" UUID NOT NULL,
    "current_phase" "project_phases" NOT NULL DEFAULT 'POC',
    "start_date" TIMESTAMP(3),
    "target_completion_date" TIMESTAMP(3),
    "budget" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'RESEARCHER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "phase" "project_phases" NOT NULL DEFAULT 'POC',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "status" "approval_decisions" NOT NULL DEFAULT 'PENDING',
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_approvals" (
    "id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "signer_id" UUID NOT NULL,
    "signer_role" "user_roles" NOT NULL,
    "decision" "approval_decisions" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mous" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ip_terms" TEXT,
    "signed_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csr_ledger_entries" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "csr_entry_statuses" NOT NULL DEFAULT 'SUBMITTED',
    "transaction_ref" TEXT,
    "disbursement_date" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csr_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_institution_id_idx" ON "users"("institution_id");

-- CreateIndex
CREATE INDEX "users_industry_partner_id_idx" ON "users"("industry_partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE INDEX "idx_districts_boundary_gist" ON "districts" USING GIST ("boundary");

-- CreateIndex
CREATE INDEX "idx_districts_centroid_gist" ON "districts" USING GIST ("centroid");

-- CreateIndex
CREATE INDEX "districts_name_idx" ON "districts"("name");

-- CreateIndex
CREATE INDEX "districts_state_idx" ON "districts"("state");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_code_key" ON "institutions"("code");

-- CreateIndex
CREATE INDEX "idx_institutions_location_gist" ON "institutions" USING GIST ("location");

-- CreateIndex
CREATE INDEX "idx_institutions_embedding_hnsw" ON "institutions" USING hnsw ("capability_embedding" vector_cosine_ops);

-- CreateIndex
CREATE INDEX "institutions_name_idx" ON "institutions"("name");

-- CreateIndex
CREATE INDEX "institutions_tier_idx" ON "institutions"("tier");

-- CreateIndex
CREATE INDEX "institutions_district_id_idx" ON "institutions"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "industry_partners_cin_key" ON "industry_partners"("cin");

-- CreateIndex
CREATE INDEX "industry_partners_organization_name_idx" ON "industry_partners"("organization_name");

-- CreateIndex
CREATE INDEX "industry_partners_industry_sector_idx" ON "industry_partners"("industry_sector");

-- CreateIndex
CREATE INDEX "industry_partners_district_id_idx" ON "industry_partners"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_client_idempotency_key_key" ON "challenges"("client_idempotency_key");

-- CreateIndex
CREATE INDEX "idx_challenges_location_gist" ON "challenges" USING GIST ("location");

-- CreateIndex
CREATE INDEX "idx_challenges_embedding_hnsw" ON "challenges" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE INDEX "challenges_industry_partner_id_idx" ON "challenges"("industry_partner_id");

-- CreateIndex
CREATE INDEX "challenges_created_by_id_idx" ON "challenges"("created_by_id");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "capability_matches_challenge_id_idx" ON "capability_matches"("challenge_id");

-- CreateIndex
CREATE INDEX "capability_matches_institution_id_idx" ON "capability_matches"("institution_id");

-- CreateIndex
CREATE INDEX "capability_matches_similarity_score_idx" ON "capability_matches"("similarity_score");

-- CreateIndex
CREATE UNIQUE INDEX "capability_matches_challenge_id_institution_id_key" ON "capability_matches"("challenge_id", "institution_id");

-- CreateIndex
CREATE INDEX "projects_challenge_id_idx" ON "projects"("challenge_id");

-- CreateIndex
CREATE INDEX "projects_institution_id_idx" ON "projects"("institution_id");

-- CreateIndex
CREATE INDEX "projects_industry_partner_id_idx" ON "projects"("industry_partner_id");

-- CreateIndex
CREATE INDEX "projects_current_phase_idx" ON "projects"("current_phase");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "milestones_project_id_idx" ON "milestones"("project_id");

-- CreateIndex
CREATE INDEX "milestones_phase_idx" ON "milestones"("phase");

-- CreateIndex
CREATE INDEX "phase_approvals_milestone_id_idx" ON "phase_approvals"("milestone_id");

-- CreateIndex
CREATE INDEX "phase_approvals_signer_id_idx" ON "phase_approvals"("signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "phase_approvals_milestone_id_signer_id_key" ON "phase_approvals"("milestone_id", "signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "phase_approvals_milestone_id_signer_role_key" ON "phase_approvals"("milestone_id", "signer_role");

-- CreateIndex
CREATE INDEX "mous_project_id_idx" ON "mous"("project_id");

-- CreateIndex
CREATE INDEX "csr_ledger_entries_project_id_idx" ON "csr_ledger_entries"("project_id");

-- CreateIndex
CREATE INDEX "csr_ledger_entries_partner_id_idx" ON "csr_ledger_entries"("partner_id");

-- CreateIndex
CREATE INDEX "csr_ledger_entries_status_idx" ON "csr_ledger_entries"("status");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notification_logs_recipient_id_idx" ON "notification_logs"("recipient_id");

-- CreateIndex
CREATE INDEX "notification_logs_is_read_idx" ON "notification_logs"("is_read");

-- CreateIndex
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_industry_partner_id_fkey" FOREIGN KEY ("industry_partner_id") REFERENCES "industry_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_partners" ADD CONSTRAINT "industry_partners_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_industry_partner_id_fkey" FOREIGN KEY ("industry_partner_id") REFERENCES "industry_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_matches" ADD CONSTRAINT "capability_matches_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_matches" ADD CONSTRAINT "capability_matches_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_industry_partner_id_fkey" FOREIGN KEY ("industry_partner_id") REFERENCES "industry_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mous" ADD CONSTRAINT "mous_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csr_ledger_entries" ADD CONSTRAINT "csr_ledger_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csr_ledger_entries" ADD CONSTRAINT "csr_ledger_entries_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "industry_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check Constraint: Non-negative active projects for institutions
ALTER TABLE "institutions" ADD CONSTRAINT "chk_institutions_active_projects_non_negative" CHECK ("active_projects" >= 0);

