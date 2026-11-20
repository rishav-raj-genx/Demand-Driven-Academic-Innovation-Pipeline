# PHASE 6 HANDOFF REPORT: SIH26043

**Project:** Demand-Driven Academic Innovation Pipeline  
**Team:** The Unknowns  
**Phase:** Phase 6 (Project Lifecycle Management, Cryptographic Dual-Signature Engine, Off-Platform CSR Ledger & Collaborative Workspace UI) — **COMPLETE**  
**Date:** 2026-11-20  

---

## 1. Executive Summary

Phase 6 delivers the collaborative execution heart of the SIH26043 platform: transitioning AI-matched civic/industrial challenges into formal, 4-stage Research & Development projects governed by cryptographic Dual-Signature gates, off-platform CSR milestone financial ledgers, bilateral MoUs, and NEP 2020 experiential learning credit accrual.

### Key Deliverables Completed:
1. **Challenge Claiming & Atomic Capacity Management (`POST /api/v1/projects`)**:
   - Enforces prerequisite `CapabilityMatch` verification.
   - Atomically checks and increments `Institution.activeProjects`, preventing institutional overloading (`409 CAPACITY_EXCEEDED`).
   - Prevents double-claiming the same challenge (`409 CHALLENGE_ALREADY_CLAIMED`).
   - Assigns creator as `FACULTY_LEAD` in `project_members`, sets initial phase to `POC`, updates `Challenge.status = "IN_PROJECT"`, and records platform `AuditLog`.

2. **Multidisciplinary Team & Industry Partner Assignment**:
   - `POST /api/v1/projects/[id]/partner`: Verified industry/CSR partner joins or is assigned; enforces verified organization status (`403 ORG_NOT_VERIFIED`).
   - `POST /api/v1/projects/[id]/members`: Faculty Lead assigns affiliated students; enforces institutional isolation (`400 STUDENT_NOT_AFFILIATED`).

3. **Milestone Deliverable Submission & SHA-256 Hashing (`POST /api/v1/projects/[id]/milestones`)**:
   - Accepts deliverables for `project.currentPhase` (`title`, `summary`, S3 `artifactKeys`).
   - Computes deterministic SHA-256 `contentHash = sha256(JSON.stringify({ projectId, phase, title, summary, artifactKeys }))`.
   - Transitions milestone to `SUBMITTED_FOR_APPROVAL` and enqueues mock SMS alerts to required approver tracks.

4. **Cryptographic Dual-Signature Stage Gate Engine (`POST /api/v1/projects/[id]/transitions/sign`)**:
   - Requires two distinct, verified role tracks to co-sign before advancing phases:
     - **Academic Track (`ACADEMIC_APPROVER`)**: Verified HEI Faculty Lead or Institution Admin.
     - **External Track (`EXTERNAL_APPROVER`)**: Verified Industry/CSR Partner or Government Official.
   - Rejects unauthorized roles (Students and Citizens receive `403 FORBIDDEN`).
   - Uniqueness constraints: prevents duplicate signing by the same user (`409 DUPLICATE_SIGNER`) or from the same track (`409 TRACK_ALREADY_SIGNED`).
   - Stale Snapshot Hash Invalidation: tampering with or resubmitting deliverables changes the `contentHash`, invalidating older signatures.
   - Transition execution: on 2/2 valid approved signatures, atomically advances `project.currentPhase` via `PLM_TRANSITIONS` (`POC → PROTOTYPING → FIELD_TEST → IP_TECH_TRANSFER`), distributes NEP 2020 credits, releases institutional active project capacity on final IP transfer, and dispatches mock SMS phase transition announcements.

5. **Bilateral MoU Generation & Mutual Execution (`/api/v1/projects/[id]/mou`)**:
   - `POST /api/v1/projects/[id]/mou`: Drafts structured MoU (`MOU-SIH26-XXXX`, IP ownership split totaling 100%, milestone schedule, and mandatory statutory compliance clause).
   - `POST /api/v1/projects/[id]/mou/[mouId]/acknowledge`: Bilateral acknowledgment workflow (`HEI_ACKNOWLEDGED` → `MUTUALLY_ACKNOWLEDGED`), setting `signedDate` and updating `Project.fundingStatus = "CSR_PLEDGED"`.

6. **Statutory Non-Custodial Compliance & Off-Platform CSR Ledger (`/api/v1/projects/[id]/csr-ledger`)**:
   - **Payment Execution Prohibition**: Intercepts and strictly rejects payment processor payloads (Razorpay, Stripe, cards, CVVs, UPI VPAs, payment intents, or escrow tokens) with `400 IN_PLATFORM_PAYMENT_PROHIBITED`, honoring non-custodial legal compliance.
   - **External Disbursement Logging**: Industry partners record off-platform bank deposits (`amountInr`, `paymentMode: EXTERNAL_NEFT | RTGS | CHEQUE | CSR_GRANT`, `externalReferenceNo`, S3 `receiptKey`).
   - **Verification Gate (`PATCH .../[entryId]/verify`)**: Recipient HEI Admin or Govt. Official verifies external bank deposit, transitioning entry to `VERIFIED` and `Project.fundingStatus = "CSR_FUNDED"`. Fund senders cannot self-verify (403).

7. **Collaborative PLM Workspace UI (`apps/web`)**:
   - **`/projects`**: Directory of active projects filterable by Phase (`PoC`, `Prototyping`, `Field Test`, `IP & Tech Transfer`), Funding Status, and keyword search, with 4-phase micro-steppers and NEP credit badges.
   - **`/projects/[id]`**: Full PLM workspace featuring:
     - 4-Phase Visual Stepper with completed checkmarks, current active pulse, and locked upcoming phases.
     - Live Dual-Signature Approval Panel displaying Academic and External signature status, SHA-256 snapshot hash, copy action, and contextual "Sign & Approve Transition" button for eligible roles.
     - Milestone Submission Drawer with direct S3 upload via presigned URLs (`purpose: "milestone_artifact"`).
     - Off-Platform CSR Ledger Tab with compliance notice banner, financial KPI summaries, and verification actions.
     - NEP 2020 Student Credits Tab displaying team roster and experiential credit breakdown.
     - MoUs & Legal Agreements Tab.
   - **`/projects/[id]/mou`**: Clean, formal printable MoU document layout with `@media print` CSS, AISHE/MCA details, IP ownership split, milestone schedule, statutory compliance clause, and bilateral digital execution stamps.

---

## 2. Infrastructure & Service Ports

| Service | Host Port | Protocol | Container / Process | Healthcheck / Probe | Status |
|---|---|---|---|---|---|
| PostgreSQL 16 | `5432` | TCP (Wire) | `sih26043-postgres` | `pg_isready -U postgres -d sih26043_db` | Operational (PostGIS 3.7.0 + pgvector 0.8.7) |
| Redis 7 | `6379` | TCP (RESP) | `sih26043-redis` | `redis-cli ping` | Operational (BullMQ multi-queue transport) |
| MinIO (S3 API) | `9000` | HTTP / S3 | `sih26043-minio` | `GET /minio/health/live` | Operational (`sih26043-uploads` bucket) |
| MinIO Console | `9001` | HTTP / HTML | `sih26043-minio` | Browser Console | Operational |
| Next.js Web App | `3000` | HTTP / HTML | `apps/web` | `GET /api/v1/health` | Operational (Next.js 15.5.29, 32 routes) |
| AI Engine | `8000` | HTTP / JSON | `services/ai-engine` | `GET /health` | Operational (FastAPI + MiniLM-L6-v2) |
| BullMQ Worker | N/A | Worker Daemon | `apps/worker` | `pnpm --filter @sih/worker check` | Operational (3 queue workers + dead letter) |

---

## 3. PLM Phase Progression & Dual-Signature Topology

```
                  [ Proof of Concept (PoC) ]  ── 2 NEP Credits
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       [ Academic Track ]            [ External Track ]
       Faculty Lead / Dean           Industry Partner / Govt
               │                             │
               └──────────────┬──────────────┘
                              ▼
           Dual Signatures Verified (Matching Hash)
                              │
                              ▼
                  [ Prototyping Phase ]       ── 4 NEP Credits
                              │
                     Dual-Signature Gate
                              │
                              ▼
                  [ Field Testing Phase ]     ── 6 NEP Credits
                              │
                     Dual-Signature Gate
                              │
                              ▼
              [ IP & Tech Transfer Phase ]    ── 8 NEP Credits
                              │
                              ▼
           - Decrements Institution.activeProjects (Frees Capacity)
           - Records PROJECT_COMPLETED_CAPACITY_RELEASED AuditLog
           - Dispatches Mock SMS Project Completion Announcements
```

---

## 4. Phase 6 API Endpoints Reference

### Project Lifecycle Endpoints
| Method | Endpoint | Authorized Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/projects` | `INSTITUTION_ADMIN`, `FACULTY`, `SUPER_ADMIN` | Claims AI-matched challenge, verifies capacity, increments `activeProjects`, creates project in `POC`. |
| `GET` | `/api/v1/projects` | All Authenticated Roles | Paginated project directory filterable by phase, institution, and search. |
| `GET` | `/api/v1/projects/[id]` | All Authenticated Roles | Full project state inspector (stakeholders, milestones, dual approvals, MoUs, CSR ledger, NEP summary). |
| `PATCH`| `/api/v1/projects/[id]` | None (`405 METHOD_NOT_ALLOWED`) | Gated boundary: direct phase modifications strictly prohibited. |
| `POST` | `/api/v1/projects/[id]/partner` | `INDUSTRY_PARTNER`, `HEI_ADMIN`, `FACULTY` | Verified industry partner joins or is assigned to active project. |
| `POST` | `/api/v1/projects/[id]/members` | `INSTITUTION_ADMIN`, `FACULTY` | Assigns affiliated students to research project team. |
| `POST` | `/api/v1/projects/[id]/milestones` | `INSTITUTION_ADMIN`, `FACULTY` | Submits deliverables, computes SHA-256 fingerprint, enqueues SMS approver alerts. |
| `POST` | `/api/v1/projects/[id]/transitions/sign` | `FACULTY`, `HEI_ADMIN`, `INDUSTRY_PARTNER`, `GOVT_OFFICIAL` | Cryptographic dual-signature stage gate verification engine. |

### Bilateral MoU & Legal Endpoints
| Method | Endpoint | Authorized Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/projects/[id]/mou` | Verified HEI Personnel, Linked Industry Partner | Drafts structured MoU (`MOU-SIH26-XXXX`, IP split, statutory compliance clause). |
| `GET` | `/api/v1/projects/[id]/mou` | All Authenticated Roles | Lists drafted and executed MoUs for project. |
| `POST` | `/api/v1/projects/[id]/mou/[mouId]/acknowledge` | Authorized HEI Lead, Linked Industry Partner | Bilateral acknowledgment (`MUTUALLY_ACKNOWLEDGED`), sets `fundingStatus = CSR_PLEDGED`. |

### Off-Platform CSR Milestone Ledger Endpoints
| Method | Endpoint | Authorized Roles | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/projects/[id]/csr-ledger` | Verified Industry Partner, Affiliated HEI | Records off-platform bank disbursement (NEFT/RTGS/Cheque). Rejects in-platform payment tokens. |
| `GET` | `/api/v1/projects/[id]/csr-ledger` | All Authenticated Roles | Returns CSR disbursement ledger and financial KPIs (pledged, disbursed, verified, pending). |
| `PATCH`| `/api/v1/projects/[id]/csr-ledger/[entryId]/verify` | `INSTITUTION_ADMIN`, `GOVT_OFFICIAL`, `SUPER_ADMIN` | Recipient institution verifies bank tranche, updating `fundingStatus = CSR_FUNDED`. Senders receive 403. |

---

## 5. UI Workspace Pages Reference

| Route | Target Audience | Key Capabilities |
|---|---|---|
| `/projects` | All Stakeholders | Directory of active research projects with multi-filter bar (Phase, Funding Status, Search), 4-stage micro-steppers, institution badges, and NEP 2020 credit previews. |
| `/projects/[id]` | Faculty, Students, Industry Mentors, Govt Officials | Full collaborative PLM workspace with visual 4-phase stepper, live Dual-Signature approval card (displaying Academic and External tracks, SHA-256 snapshot hash, and contextual sign action), milestone submission drawer with S3 presigned upload, off-platform CSR ledger tab with compliance notice, NEP 2020 student credits tab, and MoU tab. |
| `/projects/[id]/mou` | HEI Leadership, Industry CSR Executives, Legal Auditors | Formal printable MoU document layout with `@media print` CSS, AISHE/MCA credentials, IP allocation split, milestone deliverable schedule, non-custodial statutory compliance clause, and bilateral digital execution stamps with one-click print/PDF export. |

---

## 6. Monorepo Verification & Test Suite Summary

```bash
# 1. Full Monorepo Vitest Suite
pnpm -r test
# Scope: 4 of 5 workspace packages
# @sih/web:    130 passed (130 tests across 12 suites)
# @sih/worker:  11 passed (11 tests across 1 suite)
# @sih/db:       9 passed (9 tests across 1 suite)
# @sih/shared:   6 passed (6 tests across 1 suite)
# Total TypeScript Tests: 156 passed (0 failures)

# 2. AI Engine Pytest Suite
services/ai-engine/.venv/bin/pytest -v
# Total Python Pytest Tests: 21 passed (0 failures)

# Grand Total: 177 passing tests monorepo-wide (0 failures)

# 3. Next.js Production Build
pnpm --filter @sih/web build
# Output: Compiled successfully in 3.5s
# 32 routes statically/dynamically optimized with 0 type errors
# Route breakdown:
# ○ /projects             (5.27 kB)
# ƒ /projects/[id]        (10.3 kB)
# ƒ /projects/[id]/mou    (6.04 kB)
```

---

## 7. Instructions for Phase 7 Execution

When starting Phase 7 (Geospatial Intelligence, PostGIS District Dashboard & Spatial Analytics):
1. **Interactive Geospatial Dashboard (`/analytics/map`)**:
   - Utilize existing PostgreSQL PostGIS extensions (`ST_DWithin`, `ST_Centroid`, `ST_AsGeoJSON`) to render Jharkhand district boundaries and challenge clusters.
2. **Spatial Density & Capability Aggregation**:
   - Wire `packages/db/src/spatial.ts` functions (`getChallengesWithinRadius`, `aggregateChallengeDensityByDistrict`) into public geo-analytics endpoints.
3. **Cross-District Collaboration Matching**:
   - Surface unaddressed rural civic challenges overlaid with nearest capable HEI clusters to optimize geographic innovation distribution.
