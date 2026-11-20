# PHASE 4 HANDOFF REPORT: SIH26043

**Project:** Demand-Driven Academic Innovation Pipeline  
**Team:** The Unknowns  
**Phase:** Phase 4 (Local CPU Embeddings, pgvector Semantic Deduplication, Capacity-Aware HEI Matchmaking & Seed Evaluation) — **COMPLETE**  
**Date:** 2026-11-20  

---

## 1. Executive Summary

Phase 4 delivers the complete, self-contained, and offline-demo safe Artificial Intelligence Engine (`services/ai-engine`) for the SIH26043 platform. The engine is powered by local CPU inference via `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions), PostgreSQL 16 `pgvector` HNSW vector indexes, and PostGIS spherical distance calculations.

### Key Milestones Completed:
1. **Milestone 4.1: Local Embedding Service & pgvector Connection Pool**:
   - Integrated `psycopg_pool.ConnectionPool` with automatic `pgvector.psycopg.register_vector` registration on connection checkout.
   - Implemented lazy singleton loader for `sentence-transformers/all-MiniLM-L6-v2`, returning L2-normalized 384-dimensional vectors ($\|v\|_2 = 1.0$).
   - Built canonical text builders (`build_challenge_text`, `build_institution_text`) and curated R&D capability profiles for all 10 seeded Jharkhand HEIs across 8 challenge domains.
   - Implemented `POST /internal/v1/embed/institution` and batch `POST /internal/v1/embed/institutions/all`, ensuring all 10 seeded HEIs have non-null 384-dim `capability_embedding` in PostgreSQL.

2. **Milestone 4.2: pgvector Semantic Deduplication & Capacity-Aware Matchmaking**:
   - Implemented semantic deduplication querying canonical challenges (`canonical_id IS NULL`, `id != current_id`) ordered by cosine distance (`embedding <=> %s::vector ASC` limit 5).
   - Atomically updates duplicate challenges to `status = 'DUPLICATE_MERGED'`, links `canonical_id`, and increments parent `endorsement_count` inside a single DB transaction with idempotency protection.
   - Implemented capacity-aware matching combining:
     - `raw_similarity = 1 - (capability_embedding <=> challenge_embedding)`
     - `distance_km = ST_DistanceSphere(inst.location, challenge.location) / 1000.0`
     - `geo_boost = 0.08 * exp(-distance_km / 150.0)`
     - `capacity_penalty = 0.45 if utilization >= 1.0 else 0.25 * (utilization ** 2)`
     - `final_score = clamp(raw_similarity + geo_boost - capacity_penalty, 0.0, 1.0)`
   - Synthesizes concise human-readable stakeholder explanations and upserts Top 5 matches into `capability_matches`.
   - Implemented orchestration endpoint `POST /internal/v1/challenges/{challenge_id}/analyze`.

3. **Milestone 4.3: Batch Seed Analysis, Empirical Calibration & Load Balancing**:
   - Implemented `POST /internal/v1/challenges/analyze-pending` processing pending challenges in chronological order (`created_at ASC`).
   - Empirically calibrated `DEDUP_SIMILARITY_THRESHOLD = 0.80` based on observed MiniLM similarity scores of intentional duplicate pairs (`0.8135` and `0.8125`) vs distinct domains (`< 0.67`).
   - Executed batch analysis against all 30 pre-seeded Jharkhand challenges.
   - Proved that overloaded Tier-1 institutions (NIT Jamshedpur at 5/5 capacity) are strictly penalized (-0.45), allowing Tier-2 and Tier-3 institutions to capture 96.6% of Rank #1 placements.

---

## 2. Infrastructure & Service Ports

| Service | Host Port | Protocol | Container / Process | Healthcheck / Probe | Status |
|---|---|---|---|---|---|
| PostgreSQL 16 | `5432` | TCP (Wire) | `sih26043-postgres` | `pg_isready -U postgres -d sih26043_db` | Operational (PostGIS 3.7.0 + pgvector 0.8.7) |
| Redis 7 | `6379` | TCP (RESP) | `sih26043-redis` | `redis-cli ping` | Operational (BullMQ & sliding-window rate limit) |
| MinIO (S3 API) | `9000` | HTTP / S3 | `sih26043-minio` | `GET /minio/health/live` | Operational (`sih26043-uploads` bucket) |
| MinIO Console | `9001` | HTTP / HTML | `sih26043-minio` | Browser Console | Operational |
| Next.js Web App | `3000` | HTTP / HTML | `apps/web` | `GET /api/v1/health` | Operational (Next.js 15.1.7) |
| AI Engine | `8000` | HTTP / JSON | `services/ai-engine` | `GET /health` | Operational (FastAPI + MiniLM-L6-v2) |
| BullMQ Worker | N/A | Worker Daemon | `apps/worker` | `pnpm --filter @sih/worker check` | Operational |

---

## 3. Mathematical & Algorithmic Formulation

### A. Semantic Deduplication
Given candidate vector $v_c$ and database canonical challenge vector $v_i$:
$$\text{cosine\_distance}(v_c, v_i) = v_c \Leftrightarrow v_i = 1 - \frac{v_c \cdot v_i}{\|v_c\|_2 \|v_i\|_2}$$
$$\text{similarity}(v_c, v_i) = 1.0 - \text{cosine\_distance}(v_c, v_i)$$
If $\max_{i} \text{similarity}(v_c, v_i) \ge \tau_{\text{dedup}}$ (calibrated $\tau = 0.80$):
- Challenge marked `DUPLICATE_MERGED`
- `canonical_id = \arg\max_i \text{similarity}(v_c, v_i)`
- `canonical.endorsement_count` atomically incremented $+1$

### B. Capacity-Aware HEI Matchmaking
$$\text{utilization}(H) = \frac{\text{active\_projects}}{\max(\text{max\_capacity}, 1)}$$

$$\text{capacity\_penalty}(H) = \begin{cases} 
0.45 & \text{if } \text{utilization}(H) \ge 1.0 \\
0.25 \times (\text{utilization}(H))^2 & \text{otherwise}
\end{cases}$$

$$\text{geo\_boost}(H, C) = \begin{cases} 
0.08 \times \exp\left(-\frac{\text{distance\_km}(H, C)}{150.0}\right) & \text{if both locations present} \\
0.0 & \text{otherwise}
\end{cases}$$

$$\text{final\_score}(H, C) = \text{clamp}\Big(\text{raw\_similarity}(H, C) + \text{geo\_boost}(H, C) - \text{capacity\_penalty}(H), \; 0.0, \; 1.0\Big)$$

---

## 4. API Endpoints Reference (`services/ai-engine`)

### Public Diagnostic Endpoints
- **`GET /health`**
  - **Auth**: None
  - **Response (200)**: `{"status": "ok", "pgvector": true}`
  - **Response (503)**: Database or pgvector unreachable

### Authenticated Internal AI Service Endpoints (`X-Internal-Service-Key: dev_internal_ai_service_secret_key`)
- **`GET /internal/v1/ping`**
  - **Response (200)**: `{"status": "ok", "message": "pong"}`
- **`POST /internal/v1/embed/text`**
  - **Body**: `{"text": string}`
  - **Response (200)**: `{"status": "ok", "dimensions": 384, "embedding": float[384]}`
- **`POST /internal/v1/embed/challenge`**
  - **Body**: `{"title": string, "description": string, "domain": string | null}`
  - **Response (200)**: `{"status": "ok", "dimensions": 384, "canonical_text": string, "embedding": float[384]}`
- **`POST /internal/v1/embed/institution`**
  - **Body**: `{"institution_id": UUID, "domains"?: string[], "faculty_specializations"?: string[], "lab_facilities"?: string[], "profile_summary"?: string}`
  - **Response (200)**: Computes embedding and updates `institutions.capability_embedding` in PostgreSQL.
- **`POST /internal/v1/embed/institutions/all`**
  - **Response (200)**: Batch embeds all institutions in database in a single transaction.
- **`POST /internal/v1/challenges/{challenge_id}/analyze`**
  - **Response (200 - Duplicate)**:
    ```json
    {
      "status": "ok",
      "action": "DUPLICATE_MERGED",
      "challenge_id": "uuid",
      "is_duplicate": true,
      "canonical_id": "canonical-uuid",
      "duplicate_of_id": "canonical-uuid",
      "duplicate_similarity": 0.8135,
      "canonical_title": "Off-Grid Solar DC Micro-Grid...",
      "message": "Challenge identified as duplicate of ... (81.35%) and merged."
    }
    ```
  - **Response (200 - Matched)**:
    ```json
    {
      "status": "ok",
      "action": "MATCHED",
      "challenge_id": "uuid",
      "is_duplicate": false,
      "matches_count": 5,
      "matches": [
        {
          "rank": 1,
          "institution_id": "uuid",
          "institution_code": "C-44102",
          "institution_name": "Birsa Institute of Technology Sindri",
          "tier": "TIER_2",
          "active_projects": 1,
          "max_capacity": 5,
          "raw_similarity": 0.58,
          "distance_km": 32.4,
          "geo_boost": 0.064,
          "capacity_penalty": 0.01,
          "final_score": 0.634,
          "explanation": "Moderate domain match (0.58), local proximity (+0.06, 32km), no overload penalty (20% capacity)"
        }
      ]
    }
    ```
- **`POST /internal/v1/challenges/analyze-pending`**
  - **Body (optional)**: `{"threshold": 0.80, "limit": null, "force_reembed_all": false}`
  - **Response (200)**: Processes unanalyzed challenges chronologically and returns batch summary.

---

## 5. Live PostgreSQL Seed Verification Table

```text
========================================================================================
                          SIH26043 PHASE 4 VERIFICATION SUMMARY                         
========================================================================================
Total Challenges:        45 (30 pre-seeded + 15 integration test records)
Embedded Challenges:     45 / 45 (100% 384-dim MiniLM-L6-v2)
Canonical Unique:        29
Deduplicated Merged:     16
----------------------------------------------------------------------------------------
IDENTIFIED INTENTIONAL DUPLICATE PAIRS (SEEDED CHALLENGES):
  • jh-chal-002 -> jh-chal-001 | Similarity: 0.8125 | Parent Endorsements: 1
    Duplicate: "Low-Cost Community-Level Adsorption Filtration System for Removing..."
    Canonical: "Decentralized Defluoridation and Arsenic Removal Units for Rural..."
  • jh-chal-006 -> jh-chal-005 | Similarity: 0.8135 | Parent Endorsements: 1
    Duplicate: "Decentralized Solar Photovoltaic Mini-Grid System with Energy..."
    Canonical: "Off-Grid Solar DC Micro-Grid with Hybrid Battery Storage for..."
----------------------------------------------------------------------------------------
TOP-1 MATCHED INSTITUTION DISTRIBUTION (TIER-1 VS TIER-2/3 LOAD BALANCING):
Code     | Tier   | Cap   | Top-1 Count | Avg Score | Institution Name
----------------------------------------------------------------------------------------
U-0203   | TIER_2 | 1/4   | 7           | 0.4999    | Birsa Agricultural University
C-44102  | TIER_2 | 1/5   | 6           | 0.5486    | Birsa Institute of Technology Sindri
U-0204   | TIER_3 | 0/4   | 6           | 0.4466    | Kolhan University Chaibasa
U-0208   | TIER_3 | 0/4   | 4           | 0.6691    | Sido Kanhu Murmu University Dumka
U-0206   | TIER_3 | 0/4   | 3           | 0.6013    | Nilamber Pitamber University Palamu
U-0207   | TIER_2 | 0/4   | 2           | 0.6351    | Ranchi University
U-0202   | TIER_1 | 4/5   | 1           | 0.4061    | Birla Institute of Technology Mesra
U-0205   | TIER_1 | 5/5   | 0           | N/A       | National Institute of Technology Jamshedpur
----------------------------------------------------------------------------------------
Summary: Tier-2/3 Placements = 28 (96.6%) | Tier-1 Placements = 1 (3.4%)
========================================================================================
```

---

## 6. Monorepo Verification & Test Results

```bash
# 1. AI Engine Pytest Suite
services/ai-engine/.venv/bin/pytest -v
# Observed: 21 passed in 8.43s (100% pass)

# 2. Next.js Web App Vitest Suite
pnpm --filter @sih/web test
# Observed: 68 passed in 1.03s (100% pass)

# 3. Database Package Vitest Suite
pnpm --filter @sih/db test
# Observed: 9 passed in 292ms (100% pass)

# 4. Shared Package Vitest Suite
pnpm --filter @sih/shared test
# Observed: 6 passed in 232ms (100% pass)

# 5. Monorepo Strict TypeScript Check
pnpm -r typecheck
# Observed: 0 errors across 4 workspace packages
```

---

## 7. Instructions for Phase 5 Execution

When starting Phase 5 (BullMQ Worker Pipeline & Notification Dispatch):
1. **Background Job Consumption (`apps/worker`)**:
   - Wire consumer for `challenge-pipeline` BullMQ queue in `@sih/worker`.
   - On `challenge.process` job, invoke `POST /internal/v1/challenges/{challenge_id}/analyze` on `http://127.0.0.1:8000`.
2. **Notification Dispatch**:
   - On `action == "MATCHED"`: dispatch in-app notifications (`notification_logs`) and emails/SMS stubs to HEI Admins of the top 3 matched institutions.
   - On `action == "DUPLICATE_MERGED"`: dispatch citizen notification informing them their challenge was merged with the existing canonical issue and their endorsement recorded.
3. **HEI Claim Workflow**:
   - Allow verified institutional faculty to claim high-affinity matched challenges from `/hei/portal`.
