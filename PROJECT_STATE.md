# PROJECT_STATE: SIH26043 - Demand-Driven Academic Innovation Pipeline

**Team:** The Unknowns  
**Status:** Phase 3 Complete (S3 Direct Media Uploads, Challenge APIs, PWA Service Worker & Citizen Explorer UI)  
**Last Updated:** 2026-11-20

---

## 1. Executive Summary & Objective
The SIH26043 project, "Demand-Driven Academic Innovation Pipeline", creates an intelligent matchmaking and execution ecosystem connecting academic research outputs with real-world enterprise demands.

Phase 0 is complete. The monorepo foundation (`pnpm`), local containerized infrastructure (PostgreSQL 16 with PostGIS + pgvector, Redis 7, MinIO S3 object storage), shared TypeScript domain contracts, Next.js 15 web application shell, BullMQ background worker, and Python FastAPI AI Engine are fully initialized, integrated, and verified against running services.

---

## 2. Infrastructure & Workspace Architecture

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Monorepo Manager | pnpm | 11.24.0 | Workspace dependency management & pipeline orchestration |
| Shared Contracts | `@sih/shared` | 0.1.0 | Shared enums, Zod validation schemas, PLM state machine |
| Web Application | `@sih/web` (Next.js) | 15.1.7 | App Router UI, Tailwind CSS, health endpoints |
| Worker Process | `@sih/worker` | 0.1.0 | Asynchronous job consumer (BullMQ + ioredis + pino) |
| Database Package | `@sih/db` | 0.1.0 | Prisma ORM & client package shell |
| AI Engine Service | `services/ai-engine` (FastAPI) | 0.1.0 (Python 3.12) | Semantic matching, deduplication, pgvector integration |
| Primary Database | PostgreSQL 16 | PostGIS 3.7.0 + pgvector 0.8.7 | Geospatial & Semantic vector storage |
| Cache & Message Queue | Redis | 7-alpine | Queue transport & caching |
| Object Storage | MinIO | S3-Compatible | Direct browser presigned uploads |

---

## 3. Monorepo File Manifest

```text
SIH26043/
├── .env.example                               # Master environment template (DB, Redis, S3, JWT, AI Engine)
├── .gitignore                                 # Monorepo git exclusion rules
├── HANDOFF.md                                 # Phase 0 Handoff Report & operational instructions
├── PROJECT_STATE.md                           # Master project log, architecture, and verification records
├── docker-compose.yml                         # Orchestration for postgres, redis, minio, and minio-init
├── package.json                               # Root monorepo scripts (dev, build, lint, test, infra:up, infra:down)
├── pnpm-workspace.yaml                        # Workspace packages & onlyBuiltDependencies
├── tsconfig.base.json                         # Strict TypeScript compiler flags (zero inferred any, strict nulls)
├── apps/
│   ├── web/
│   │   ├── next.config.ts                     # Next.js config with outputFileTracingRoot & transpilePackages
│   │   ├── package.json                       # @sih/web package configuration
│   │   ├── postcss.config.mjs                 # PostCSS config with Tailwind CSS & Autoprefixer
│   │   ├── tailwind.config.ts                 # Tailwind configuration
│   │   ├── tsconfig.json                      # Next.js TypeScript config with path aliases
│   │   └── src/
│   │       └── app/
│   │           ├── api/v1/health/route.ts     # Healthcheck endpoint (GET /api/v1/health)
│   │           ├── globals.css                # Tailwind directives & CSS variables
│   │           ├── layout.tsx                 # Root HTML layout with metadata
│   │           └── page.tsx                   # Landing page confirming Tailwind CSS & Lucide icons
│   └── worker/
│       ├── package.json                       # @sih/worker package configuration
│       ├── tsconfig.json                      # Worker TypeScript configuration
│       └── src/
│           ├── index.ts                       # Worker bootstrap & shutdown handlers with --check flag
│           └── redis.ts                       # ioredis connection pool & healthcheck probe
├── docker/
│   ├── minio/
│   │   └── cors.xml                           # S3 CORS rules for browser presigned PUT uploads
│   └── postgres/
│       ├── Dockerfile                         # Custom PG16 image with PostGIS and pgvector
│       └── init-extensions.sql                # Entrypoint script installing postgis and vector
├── packages/
│   ├── db/
│   │   ├── package.json                       # @sih/db package configuration & exports
│   │   ├── tsconfig.json                      # Database package TypeScript configuration
│   │   ├── vitest.config.ts                   # Vitest configuration for database integration tests
│   │   ├── prisma/
│   │   │   ├── schema.prisma                  # Prisma schema with 15 domain models, PostGIS, pgvector
│   │   │   ├── seed.ts                        # Idempotent seed runner (pnpm --filter @sih/db db:seed)
│   │   │   ├── seeds/
│   │   │   │   └── data/
│   │   │   │       ├── challenges_30.json     # 30 realistic Jharkhand civic & industrial challenges
│   │   │   │       ├── institutions.json      # 10 Jharkhand HEIs across Tiers 1-3 with capacity controls
│   │   │   │       ├── jharkhand_districts.json # 8 major districts with GeoJSON MultiPolygon & Point centroids
│   │   │   │       └── partners_and_users.json # 5 verified MSME/CSR partners + demo users + 3 PLM projects
│   │   │   └── migrations/
│   │   │       └── 20261120043438_init_schema/
│   │   │           └── migration.sql          # Versioned SQL migration with HNSW, GIST & checks
│   │   ├── src/
│   │   │   ├── audit.ts                       # Parameterized audit log helper (recordAuditLog)
│   │   │   ├── index.ts                       # Singleton Prisma client export & barrel exports
│   │   │   └── spatial.ts                     # PostGIS parameterized geometry helpers & density aggregation
│   │   └── tests/
│   │       └── spatial.test.ts                # Integration test suite for PostGIS helpers & audit logging
│   └── shared/
│       ├── package.json                       # @sih/shared package configuration
│       ├── tsconfig.json                      # Shared library build config (declaration, sourceMaps)
│       ├── vitest.config.ts                   # Vitest configuration for unit testing
│       └── src/
│           ├── enums.ts                       # Domain enums (Roles, Statuses, Phases)
│           ├── index.ts                       # Barrel re-export file
│           ├── plm.ts                         # PLM phase transitions map & canTransitionPhase()
│           ├── plm.test.ts                    # Vitest unit test suite for PLM state machine
│           └── schemas.ts                     # Zod schemas (Pagination, Coordinates, ApiEnvelopes)
└── services/
    └── ai-engine/
        ├── .venv/                             # Python 3.12 virtual environment (managed via uv)
        ├── Dockerfile                         # Container build with python:3.11-slim
        ├── pyproject.toml                     # Python package definition
        ├── README.md                          # Service documentation
        ├── requirements.txt                   # Pinned dependency requirements
        ├── app/
        │   ├── __init__.py                    # App package root
        │   ├── config.py                      # Pydantic BaseSettings (DB, keys, thresholds)
        │   ├── main.py                        # FastAPI endpoints (/health, /internal/v1/ping)
        │   └── security.py                    # Constant-time X-Internal-Service-Key authentication
        └── tests/
            ├── __init__.py                    # Test package root
            └── test_health.py                 # Pytest suite for health & security rejection (401/403)
```

---

## 4. Completed Phase 0 Milestones

### Prompt 0.1: Monorepo & Local Infrastructure Initialization
- [x] Workspace verification (Fresh repository with git history preserved, Node v24.19.0, pnpm 11.24.0, Python 3.9.6, Docker 29.9.3, uv /opt/homebrew/bin/uv).
- [x] Monorepo workspace defined via `pnpm-workspace.yaml`.
- [x] Root `package.json` created with required scripts (`dev`, `build`, `lint`, `test`, `infra:up`, `infra:down`).
- [x] Base strict `tsconfig.base.json` created.
- [x] `.env.example` created with PostgreSQL, Redis, S3/MinIO, JWT, and AI Engine service keys.
- [x] Workspace directories created (`apps/web`, `apps/worker`, `packages/shared`, `packages/db`, `services/ai-engine`).
- [x] Built custom PostgreSQL 16 image (`sih26043-postgres:pg16-postgis-pgvector`) based on `pgvector/pgvector:pg16` with `postgresql-16-postgis-3`.
- [x] Built and configured MinIO with automated initialization container (`minio-init`) and global CORS support (`MINIO_API_CORS_ALLOW_ORIGIN: "*"`).
- [x] Configured Redis 7 with healthchecks.
- [x] Verified all local services report healthy under `docker compose up -d`.

### Prompt 0.2: Application Shells & Shared Contracts Scaffolding
- [x] Scaffolded `packages/shared` with domain enums (`UserRole`, `InstitutionTier`, `VerificationStatus`, `ChallengeStatus`, `ProjectPhase`, `ApprovalDecision`, `CsrEntryStatus`).
- [x] Implemented `PLM_TRANSITIONS` map (`POC -> PROTOTYPING -> FIELD_TEST -> IP_TECH_TRANSFER`) and pure `canTransitionPhase()` validator with 100% Vitest test coverage.
- [x] Implemented base Zod schemas for pagination query/meta, coordinate ranges (`[-90, 90]`, `[-180, 180]`), and API response envelopes (`ApiSuccess<T>`, `ApiError`, `ApiResponse<T>`).
- [x] Scaffolded `apps/web` (Next.js 15 App Router, Tailwind CSS, Lucide icons, Pino) with `GET /api/v1/health` returning `{ status: "ok", timestamp, service: "web" }`.
- [x] Scaffolded `apps/worker` (TypeScript BullMQ + ioredis + pino) with standalone Redis connectivity check (`pnpm --filter @sih/worker check`).
- [x] Verified zero peer-dependency issues and clean builds across all packages.

### Prompt 0.3: AI Engine Initialization & Phase 0 Handoff
- [x] Pinned compatible dependencies in `services/ai-engine/pyproject.toml` and `requirements.txt`.
- [x] Created Python virtual environment in `services/ai-engine/.venv` via `uv` with 64 installed packages.
- [x] Implemented `services/ai-engine/app/config.py` using `pydantic-settings` with all specified defaults (`DATABASE_URL`, `INTERNAL_AI_SERVICE_KEY`, `EMBEDDING_MODEL_NAME`, `DEDUP_SIMILARITY_THRESHOLD`, `SOFT_CAPACITY_PENALTY`, `HARD_CAPACITY_PENALTY`).
- [x] Implemented `services/ai-engine/app/security.py` using constant-time `hmac.compare_digest` for `X-Internal-Service-Key` validation with 401/403 rejection.
- [x] Implemented `services/ai-engine/app/main.py` with public `GET /health` (verifying database connectivity and `pgvector` extension) and authenticated `GET /internal/v1/ping`.
- [x] Implemented `services/ai-engine/tests/test_health.py` covering configuration defaults, health check against live postgres container, authenticated ping, and 401/403 key rejection.
- [x] Created `services/ai-engine/Dockerfile`.
- [x] Executed Pytest suite (5 passed in 2.76s).
- [x] Verified live FastAPI endpoints on `http://127.0.0.1:8000`.
- [x] Finalized Phase 0 Handoff Report in `HANDOFF.md`.

---

## 5. Verification & Acceptance Record (Observed Outputs)

### A. AI Engine Pytest Suite
Command:
```bash
cd services/ai-engine && .venv/bin/pytest -v
```
Observed Output:
```text
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.2.0, pluggy-1.7.0 -- /Users/apple/Desktop/SIH26043/services/ai-engine/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/apple/Desktop/SIH26043/services/ai-engine
configfile: pyproject.toml
plugins: anyio-4.16.0
collected 5 items                                                              

tests/test_health.py::test_config_defaults PASSED                        [ 20%]
tests/test_health.py::test_health_endpoint PASSED                        [ 40%]
tests/test_health.py::test_internal_ping_valid_key PASSED                [ 60%]
tests/test_health.py::test_internal_ping_missing_key PASSED              [ 80%]
tests/test_health.py::test_internal_ping_invalid_key PASSED              [100%]

============================== 5 passed in 2.76s ===============================
```

### B. Live AI Engine HTTP Probing
Commands:
```bash
# Public Health Check
curl -i http://127.0.0.1:8000/health

# Protected Ping (Valid Key)
curl -i -H "X-Internal-Service-Key: dev_internal_ai_service_secret_key" http://127.0.0.1:8000/internal/v1/ping

# Protected Ping (Missing Key)
curl -i http://127.0.0.1:8000/internal/v1/ping

# Protected Ping (Invalid Key)
curl -i -H "X-Internal-Service-Key: bad-key" http://127.0.0.1:8000/internal/v1/ping
```
Observed Outputs:
```text
# 1. /health
HTTP/1.1 200 OK
content-type: application/json
{"status":"ok","pgvector":true}

# 2. /internal/v1/ping (Valid Key)
HTTP/1.1 200 OK
content-type: application/json
{"status":"ok","message":"pong"}

# 3. /internal/v1/ping (Missing Key)
HTTP/1.1 401 Unauthorized
content-type: application/json
{"detail":"Missing required X-Internal-Service-Key header"}

# 4. /internal/v1/ping (Invalid Key)
HTTP/1.1 403 Forbidden
content-type: application/json
{"detail":"Invalid internal service key"}
```

### C. Shared Package Tests
Command:
```bash
pnpm --filter @sih/shared test
```
Observed Output:
```text
 ✓ src/plm.test.ts (6 tests) 2ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### D. Next.js Web App Production Build & Health Route
Command:
```bash
pnpm --filter @sih/web build
curl -i http://localhost:3000/api/v1/health
```
Observed Output:
```text
HTTP/1.1 200 OK
content-type: application/json
{"status":"ok","timestamp":"2026-11-20T04:09:45.494Z","service":"web"}
```

### E. Worker Redis Check
Command:
```bash
pnpm --filter @sih/worker check
```
Observed Output:
```text
{"level":30,"pid":89248,"name":"sih-worker","pong":"PONG","msg":"Redis ping check responded successfully"}
{"level":30,"pid":89248,"name":"sih-worker","msg":"Redis health verification succeeded"}
```

### F. Database Migration & Schema Verification (`@sih/db`)
Commands:
```bash
# 1. Execute Prisma migrate dev
pnpm --filter @sih/db prisma migrate dev --name init_schema

# 2. Inspect applied tables and indexes via psql
docker exec -i sih26043-postgres psql -U postgres -d sih26043_db -c "\dt; \di"

# 3. Query custom spatial and vector indexes
docker exec -i sih26043-postgres psql -U postgres -d sih26043_db -c "SELECT indexname, indexdef FROM pg_indexes WHERE indexname LIKE 'idx_%';"

# 4. Confirm non-negative check constraint
docker exec -i sih26043-postgres psql -U postgres -d sih26043_db -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_institutions_active_projects_non_negative';"

# 5. Verify Next.js web application integration with singleton Prisma client
pnpm --filter @sih/web exec node --input-type=module -e "import { prisma } from '@sih/db'; async function test() { const res = await prisma.\$queryRaw\`SELECT 1 as connected\`; console.log('Prisma query success from web context:', res); await prisma.\$disconnect(); } test();"
```
Observed Outputs:
```text
# 1. Prisma Migrate Dev
Applying migration `20261120043438_init_schema`
The following migration(s) have been applied:
migrations/
  └─ 20261120043438_init_schema/
    └─ migration.sql
Your database is now in sync with your schema.
✔ Generated Prisma Client (v6.19.3)

# 2. Custom Spatial GIST and pgvector HNSW Indexes
            indexname            |                                                        indexdef                                                         
---------------------------------+-------------------------------------------------------------------------------------------------------------------------
 idx_districts_boundary_gist     | CREATE INDEX idx_districts_boundary_gist ON public.districts USING gist (boundary)
 idx_districts_centroid_gist     | CREATE INDEX idx_districts_centroid_gist ON public.districts USING gist (centroid)
 idx_institutions_location_gist  | CREATE INDEX idx_institutions_location_gist ON public.institutions USING gist (location)
 idx_institutions_embedding_hnsw | CREATE INDEX idx_institutions_embedding_hnsw ON public.institutions USING hnsw (capability_embedding vector_cosine_ops)
 idx_challenges_location_gist    | CREATE INDEX idx_challenges_location_gist ON public.challenges USING gist (location)
 idx_challenges_embedding_hnsw   | CREATE INDEX idx_challenges_embedding_hnsw ON public.challenges USING hnsw (embedding vector_cosine_ops)

# 3. Non-Negative Active Projects Constraint
                    conname                    |      pg_get_constraintdef      
-----------------------------------------------+--------------------------------
 chk_institutions_active_projects_non_negative | CHECK ((active_projects >= 0))

# 4. Web Import Probe
prisma:query SELECT 1 as connected
Prisma query success from web context: [ { connected: 1 } ]
```

### G. PostGIS Spatial Helpers & Audit Logging Integration Tests
Command:
```bash
pnpm --filter @sih/db test
```
Observed Output:
```text
 ✓ tests/spatial.test.ts (9 tests) 76ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Spatial Point Writing & Reading > should set and retrieve a challenge location using ST_SetSRID(ST_MakePoint) 2ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Spatial Point Writing & Reading > should set and retrieve an institution location using ST_SetSRID(ST_MakePoint) 1ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Spatial Point Writing & Reading > should reject out-of-range latitude or longitude 1ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Spatial Point Writing & Reading > should reject non-existent entity IDs 1ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Spatial District Containment & Nearest-Centroid Fallback > should find district by coordinates using ST_Contains when point is inside boundary 1ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Spatial District Containment & Nearest-Centroid Fallback > should fallback to nearest centroid (<->) when point is outside all district boundaries 2ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Audit Log Helper > should record parameterized audit log without SQL injection risk 3ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > Audit Log Helper > should reject empty action or entityType 0ms
   ✓ PostGIS Spatial Helpers & Audit Logging Integration Suite > District Innovation Density Aggregation > should return district innovation density aggregation including spatial counts 2ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  347ms
```

### H. Idempotent Seed Suite Verification
Commands executed (twice consecutively):
```bash
pnpm --filter @sih/db db:seed
pnpm --filter @sih/db db:seed
```
Observed Output:
```text
> @sih/db@0.1.0 db:seed /Users/apple/Desktop/SIH26043/packages/db
> tsx prisma/seed.ts

Starting SIH26043 database seed...
Seeding Jharkhand districts...
  Updated PostGIS boundary & centroid for JH_RAN
  Updated PostGIS boundary & centroid for JH_ESN
  Updated PostGIS boundary & centroid for JH_DHN
  Updated PostGIS boundary & centroid for JH_BOK
  Updated PostGIS boundary & centroid for JH_HAZ
  Updated PostGIS boundary & centroid for JH_DEO
  Updated PostGIS boundary & centroid for JH_DUM
  Updated PostGIS boundary & centroid for JH_PAL
Seeded 8 districts.
Seeding institutions...
  Updated PostGIS location for inst-nit-jsr
  Updated PostGIS location for inst-bit-mesra
  Updated PostGIS location for inst-rims-ran
  Updated PostGIS location for inst-bit-sindri
  Updated PostGIS location for inst-bau-ran
  Updated PostGIS location for inst-ru-ran
  Updated PostGIS location for inst-ku-chaibasa
  Updated PostGIS location for inst-skmu-dumka
  Updated PostGIS location for inst-npu-palamu
  Updated PostGIS location for inst-poly-adityapur
Seeded 10 institutions.
Seeding industry partners & demo users...
  Upserted 5 industry partners.
  Upserted 8 demo user accounts (Argon2id hashed).
Seeding 30 Jharkhand societal challenges...
  Updated PostGIS location for jh-chal-001
  Updated PostGIS location for jh-chal-002
  ...
  Updated PostGIS location for jh-chal-030
Seeded 30 challenges.
Seeding active projects, milestones & phase approvals...
  Project proj-water-filter: POC (Milestone ms-wf-poc approved by PI + INDUSTRY_PARTNER)
  Project proj-solar-microgrid: PROTOTYPING
  Project proj-tribal-health: IP_TECH_TRANSFER
Database seed completed successfully!
```

Verification Query via PostgreSQL:
```sql
SELECT 
  (SELECT COUNT(*) FROM districts WHERE ST_IsValid(boundary) = true) as valid_districts,
  (SELECT COUNT(*) FROM institutions) as institutions_count,
  (SELECT COUNT(*) FROM industry_partners) as partners_count,
  (SELECT COUNT(*) FROM challenges) as challenges_count,
  (SELECT COUNT(*) FROM projects) as projects_count,
  (SELECT COUNT(*) FROM users) as users_count;
```
Result:
```text
 valid_districts | institutions_count | partners_count | challenges_count | projects_count | users_count 
-----------------+--------------------+----------------+------------------+----------------+-------------
               8 |                 10 |              5 |               30 |              3 |           8
```

---

## 6. Phase 1 Progress & Completed Milestones

### Milestone 1.1: Database Schema & PostGIS/pgvector Migrations
- [x] Initialized `@sih/db` package (`packages/db`) exporting singleton `prisma` client (`@sih/db`) and generated TypeScript types.
- [x] Implemented complete Prisma schema (`packages/db/prisma/schema.prisma`) defining all 15 domain models:
  - `User`: Roles, status, authentication references, institution/industry affiliations.
  - `RefreshToken`: Multi-device token management with revocation flags and expiry timestamps.
  - `District`: Administrative regions with PostGIS `boundary` (MultiPolygon, 4326) and `centroid` (Point, 4326).
  - `Institution`: Higher education institutions across Tiers 1-3 with PostGIS `location` (Point, 4326), `capability_embedding` (vector(384)), capacity limits, and non-negative active project constraint.
  - `IndustryPartner`: Corporate partners with CIN, sector, and district links.
  - `Challenge`: Industry demands with nullable unique `clientIdempotencyKey`, PostGIS `location` (Point, 4326), and semantic `embedding` (vector(384)).
  - `CapabilityMatch`: AI-scored matching with unique constraint `(challengeId, institutionId)`.
  - `Project`: Stage-gated innovation lifecycle projects with phase tracking.
  - `ProjectMember`: Multi-stakeholder project memberships with unique `(projectId, userId)`.
  - `Milestone`: Deliverable milestones mapped to PLM phases.
  - `PhaseApproval`: Dual-signature approval tracking enforcing unique `(milestoneId, signerId)` AND unique `(milestoneId, signerRole)`.
  - `MoU`: Formal contractual records linked to projects.
  - `CsrLedgerEntry`: CSR funding allocation, disbursement tracking, and financial compliance records.
  - `AuditLog`: Immutable platform action logging with JSON metadata.
  - `NotificationLog`: User notification logs with read status flags.
- [x] Generated versioned SQL migration (`20261120043438_init_schema/migration.sql`) establishing:
  - PostGIS & pgvector extensions (`CREATE EXTENSION IF NOT EXISTS`).
  - All 15 domain model tables, enums, primary keys, and foreign keys.
  - HNSW vector indexes: `idx_challenges_embedding_hnsw` and `idx_institutions_embedding_hnsw` using `vector_cosine_ops`.
  - Spatial GIST indexes: `districts.boundary`, `districts.centroid`, `institutions.location`, `challenges.location`.
  - Table check constraint: `chk_institutions_active_projects_non_negative` ensuring `active_projects >= 0`.
- [x] Wired `@sih/db` into `apps/web` (`package.json`, `next.config.ts`), verified zero typecheck errors across all workspace packages (`pnpm -r typecheck`), and confirmed successful Next.js production build.

### Milestone 1.2: PostGIS Geometry Helpers & Audit Logging
- [x] Implemented `packages/db/src/spatial.ts` with strict SQL-injection-safe parameterized `Prisma.sql` templates:
  - `setChallengeLocation(challengeId, lat, lng)`: Writes 4326 Point geometry via `ST_SetSRID(ST_MakePoint($lng, $lat), 4326)` with coordinate bounds validation.
  - `setInstitutionLocation(institutionId, lat, lng)`: Writes 4326 Point geometry for institutions.
  - `getChallengeLocation(challengeId)` / `getInstitutionLocation(institutionId)`: Extracts `{ lat, lng }` coordinates via `ST_Y` / `ST_X`.
  - `findDistrictByCoordinates(lat, lng)`: Dual-stage lookup with primary `ST_Contains(boundary, ST_SetSRID(ST_MakePoint($lng, $lat), 4326))` and fallback to nearest-centroid distance operator (`centroid <-> point`).
  - `getDistrictInnovationDensity()`: Aggregates active challenges, matched projects, funded prototypes, and patents counts per district with GeoJSON boundary & centroid.
- [x] Implemented `packages/db/src/audit.ts`:
  - `recordAuditLog({ actorId, action, entityType, entityId, metadata, ipAddress, userAgent })` providing clean parameterized audit trails with input validation.
- [x] Implemented full integration test suite in `packages/db/tests/spatial.test.ts` running against PostgreSQL container:
  - 9 passing tests covering point insertion, spatial containment, nearest-neighbor fallback, audit log creation, and density aggregation.
- [x] Re-exported all spatial and audit utilities from `packages/db/src/index.ts`.
- [x] Verified zero SQL interpolation warnings, zero TypeScript errors across all monorepo packages, and clean Next.js 15 build.

### Milestone 1.3: Idempotent Seed Suite & Phase 1 Completion
- [x] Implemented GeoJSON spatial district dataset (`packages/db/prisma/seeds/data/jharkhand_districts.json`) with 8 major Jharkhand districts (Ranchi, East Singhbhum, Dhanbad, Bokaro, Hazaribagh, Deoghar, Dumka, Palamu) featuring valid MultiPolygons and Point centroids.
- [x] Implemented Higher Education Institutions dataset (`packages/db/prisma/seeds/data/institutions.json`) covering 10 Jharkhand institutions across Tiers 1-3 with load-balancing parameters (NIT Jamshedpur 5/5, BIT Mesra 4/5, RIMS Ranchi 3/4 overloaded vs Tier 2/3 available capacity).
- [x] Implemented MSME/CSR partners and demo user accounts dataset (`packages/db/prisma/seeds/data/partners_and_users.json`) with 5 verified industry partners, 8 role-specific user accounts (Argon2id hashes), and 3 active stage-gated PLM projects (`POC`, `PROTOTYPING`, `IP_TECH_TRANSFER`).
- [x] Implemented 30 realistic Jharkhand societal challenges dataset (`packages/db/prisma/seeds/data/challenges_30.json`) across 8 domains (Water Filtration, Solar Micro-Grids, Tribal Healthcare, Smart Agriculture, Mining Dust/Safety, Solid Waste, Rural Digital Literacy, Cold Storage) including 3 intentional near-duplicate challenge pairs for deduplication evaluation.
- [x] Built idempotent seed runner (`packages/db/prisma/seed.ts`) utilizing `upsert` and parameterized PostGIS geometry updates via `ST_GeomFromGeoJSON`.
- [x] Verified seed idempotency by running `pnpm --filter @sih/db db:seed` twice consecutively with zero duplicate records and zero constraint violations.
- [x] Verified PostGIS spatial boundary validity (`ST_IsValid(boundary) = true` for all 8 districts).
- [x] Compiled comprehensive **Phase 1 Handoff Report** in `HANDOFF.md` including demo user credentials matrix, spatial district manifest, HEI capacity tiers, and PLM transition procedures.

---

## 7. Phase 2 Progress & Completed Milestones

### Milestone 2.1: Core Authentication & Security Library
- [x] Implemented Argon2id password hashing & verification in `apps/web/src/lib/auth/password.ts` (`@node-rs/argon2`, `memoryCost >= 19456`, `timeCost >= 2`, `parallelism = 1`) with defensive error handling.
- [x] Implemented edge-compatible JWT utility in `apps/web/src/lib/auth/jwt.ts` (`jose` `SignJWT`, `jwtVerify`) supporting 15-minute access tokens and 7-day refresh tokens with strict payload typing.
- [x] Implemented secure cookie management in `apps/web/src/lib/auth/cookies.ts` managing `sih_access_token` and `sih_refresh_token` with `HttpOnly`, `SameSite=Lax`, `Path=/`, and conditional `Secure` flags.
- [x] Implemented SHA-256 token hashing utility in `apps/web/src/lib/auth/hash.ts` for database refresh-token lookup and storage isolation.
- [x] Implemented 3-layer Zod request validation helper `parseJsonBody<T>()` in `apps/web/src/lib/validation.ts` returning standardized 400 responses (`INVALID_JSON` and `VALIDATION_ERROR` with field details).
- [x] Implemented Redis-backed sliding-window rate limiter in `apps/web/src/lib/rate-limit.ts` using `ioredis` pipeline with atomic sorted sets (`ZADD`, `ZREMRANGEBYSCORE`, `ZCARD`, `EXPIRE`) and fail-open resilience.
- [x] Built comprehensive Vitest unit test suite in `apps/web/src/lib/auth/auth-utils.test.ts` (15 passing tests).

### Milestone 2.2: Authentication Endpoints, Token Rotation, Reuse Detection & RBAC
- [x] Implemented `POST /api/v1/auth/register` (`apps/web/src/app/api/v1/auth/register/route.ts`):
  - Validates registration for `CITIZEN`, `HEI_ADMIN`, `FACULTY`, `STUDENT`, `INDUSTRY_PARTNER`, etc.
  - Automatically sets `verificationStatus = VERIFIED` (`isActive = true`) for `STUDENT`/`CITIZEN`, and `PENDING` for `HEI_ADMIN`/`INDUSTRY_PARTNER` pending verification.
  - Automatically hashes passwords with Argon2id and logs platform audit trail (`USER_REGISTERED`).
- [x] Implemented `POST /api/v1/auth/login` (`apps/web/src/app/api/v1/auth/login/route.ts`):
  - Enforces IP sliding-window rate limiting.
  - Verifies Argon2id password, issues `HttpOnly` `SameSite=Lax` cookies, stores hashed refresh token in database, logs `USER_LOGIN` audit event, and omits `passwordHash`.
- [x] Implemented `POST /api/v1/auth/refresh` (`apps/web/src/app/api/v1/auth/refresh/route.ts`):
  - Reads refresh token from cookie or payload.
  - Enforces refresh-token rotation in a Prisma database transaction.
  - **Token Reuse Detection:** Revokes entire session family and all active refresh tokens for the compromised user if an already-revoked refresh token is replayed, logging a security audit event (`REFRESH_TOKEN_REUSE_DETECTED`).
- [x] Implemented `POST /api/v1/auth/logout` (`apps/web/src/app/api/v1/auth/logout/route.ts`):
  - Revokes refresh token in database, clears authentication cookies (`Max-Age=0`), and logs `USER_LOGOUT` audit event.
- [x] Implemented `GET /api/v1/auth/me` (`apps/web/src/app/api/v1/auth/me/route.ts`):
  - Returns current authenticated user and organization verification status (omitting `passwordHash`).
- [x] Implemented RBAC and organization verification guards in `apps/web/src/lib/auth/guards.ts`:
  - `requireAuth(req)`: extracts and verifies access token, hydrates user from database.
  - `requireRoles(user, allowedRoles)`: enforces role authorization with 403 `FORBIDDEN` envelope.
  - `requireVerifiedOrg(user)`: enforces organization verification status with 403 `ORG_NOT_VERIFIED` envelope.
- [x] Implemented Next.js Edge route middleware in `apps/web/src/middleware.ts`:
  - Protects UI route groups (`/dashboard/*`, `/hei/*`, `/industry/*`, `/admin/*`) with redirect to `/login?from=...`.
- [x] Implemented full integration test suite in `apps/web/src/app/api/v1/auth/auth-integration.test.ts` (9 passing tests covering register → login → `/me` → refresh rotation → reuse attack rejection → logout → 401 on `/me` → 403 on unauthorized role & unverified org).
- [x] Verified zero TypeScript errors (`tsc --noEmit`), 24/24 passing tests in `apps/web`, 39/39 passing tests monorepo-wide, and clean Next.js 15 production build (`next build`).

### Milestone 2.3: Verification Trust Layer & Controlled Mock Registry
- [x] Implemented Verification Provider contracts in `apps/web/src/lib/verification/types.ts` defining `VerificationProvider` interface (`verifyAisheCode`, `verifyMcaCin`, `verifyUdyamNumber`) with strict typing.
- [x] Implemented deterministic controlled mock dataset in `apps/web/src/lib/verification/mock-registry.ts`:
  - Covers all 10 seeded Jharkhand HEIs (`U-0205`, `U-0202`, `U-0210`, `C-44102`, `U-0203`, `U-0207`, `U-0204`, `U-0208`, `U-0206`, `S-12055`).
  - Covers 5 additional valid test AISHE codes (`U-0001`, `U-0002`, `U-0003`, `C-10001`, `U-0004`).
  - Covers 10 valid MCA CIN / Udyam MSME entries (5 seeded partners + 5 valid Udyam entries).
  - Explicit negative test codes: `U-FAKE-999` (`REJECTED`), `U-FRAUD-123` (`REJECTED`), `U-99999` (`NOT_FOUND`), `UDYAM-JH-00-0000000` (`NOT_FOUND`), `UDYAM-XX-99-9999999` (`REJECTED`), `U99999XX9999PTC999999` (`REJECTED`).
  - Transparent provenance metadata: every response explicitly sets `source: "CONTROLLED_MOCK_MVP"`, `isOfficialLiveApi: false`, and `badge: "Controlled Mock (MVP)"`.
- [x] Implemented `POST /api/v1/verify/aishe` (`apps/web/src/app/api/v1/verify/aishe/route.ts`):
  - Validates AISHE format via Zod (`/^(?:[UCS]-[0-9]{4,6}|[UCS]-[A-Za-z0-9-]+)$/`).
  - Queries `verificationProvider.verifyAisheCode`.
  - Automatically updates `Institution.verificationStatus` and synchronizes linked institutional users in PostgreSQL.
  - Records parameterized platform `AuditLog` (`AISHE_VERIFICATION_EVALUATED`).
- [x] Implemented `POST /api/v1/verify/industry` (`apps/web/src/app/api/v1/verify/industry/route.ts`):
  - Validates MCA CIN (`/^[LUu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/`) and Udyam format (`/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/`).
  - Queries `verificationProvider.verifyMcaCin` or `verifyUdyamNumber`.
  - Automatically updates `IndustryPartner.verificationStatus` and synchronizes linked partner users.
  - Records parameterized platform `AuditLog` (`INDUSTRY_VERIFICATION_EVALUATED`).
- [x] Enforced institutional and industry account gate:
  - Created protected challenge claim (`POST /api/v1/challenges/claim`) and milestone transition signing (`POST /api/v1/transitions/sign`) routes guarded by `requireVerifiedOrg`.
  - Confirmed unverified HEIs/Industry Partners receive `403 ORG_NOT_VERIFIED`.
  - Confirmed verification via `/api/v1/verify/aishe` or `/api/v1/verify/industry` immediately unblocks and activates protected capabilities.
- [x] Built comprehensive Vitest test suite in `apps/web/src/lib/verification/verification.test.ts` (6 passing tests covering all 10 seeded HEIs, negative codes, MCA/Udyam verification, endpoint status changes, and gate enforcement).
- [x] Verified zero TypeScript errors across all workspace packages (`tsc --noEmit`), 30/30 passing tests in `apps/web`, 45/45 passing tests monorepo-wide, and clean Next.js 15 production build (`next build`).

### Milestone 2.4: Responsive UI Pages, Demo Role Switcher & Accessible App Shell
- [x] Implemented responsive, accessible `/login` page (`apps/web/src/app/login/page.tsx`):
  - Form built with `react-hook-form` + `@hookform/resolvers/zod`.
  - Accessible semantics: `<label htmlFor="...">`, `aria-invalid`, `aria-describedby`, error alert regions, keyboard submit, and visible focus rings.
  - Built-in **Demo Role Switcher** panel (gated by `NEXT_PUBLIC_ENABLE_DEMO_HELPER !== "false"`) providing 1-click credential population for Student (`student@sih.gov.in`), HEI Admin (`inst.admin@sih.gov.in`), Industry Partner (`industry@tata.com`), and Super Admin (`admin@sih.gov.in`).
  - Calls `POST /api/v1/auth/login` and handles redirection via `?from=`.
- [x] Implemented responsive, accessible `/register` page (`apps/web/src/app/register/page.tsx`):
  - Multi-stakeholder registration supporting `CITIZEN`, `STUDENT`, `HEI_ADMIN`, `FACULTY`, `RESEARCHER`, `INDUSTRY_PARTNER`, `CSR_PARTNER`.
  - Dynamic verification policy notice: displays instant activation for citizens/students vs mandatory AISHE/MCA verification for HEI/industry accounts.
  - Calls `POST /api/v1/auth/register` and directs users to `/login` or `/onboarding/verify`.
- [x] Implemented `/onboarding/verify` portal (`apps/web/src/app/onboarding/verify/page.tsx`):
  - Two dedicated verification modules: AISHE (Universities/Colleges) and MCA CIN / Udyam (Industry/MSMEs).
  - Evaluator quick presets for immediate live testing with seeded HEIs and industry partners + explicit negative test cases.
  - Prominent **Controlled Mock (MVP)** trust banner, verified badges, registry payload display, and workspace unlocking button.
- [x] Implemented role-aware `AppShell` component (`apps/web/src/components/AppShell.tsx`):
  - Dynamic route filtering via `getAllowedNavItems`: Student/Citizen, HEI Admin, Industry Partner, and Super Admin.
  - User status indicator, role badge, organization verification badge (`Verified Org` vs `Verify Org`), and accessible logout action.
  - Fully accessible mobile drawer and keyboard navigation.
- [x] Implemented `/dashboard` landing page (`apps/web/src/app/dashboard/page.tsx`):
  - Wrapped in `AppShell` with welcome banner, verification status pill, system metric cards (30 challenges, 10 HEIs, 5 partners, 8 PostGIS districts), and workflow navigation cards.
- [x] Built unit test suite in `apps/web/src/components/AppShell.test.ts` (5 passing tests validating role-filtered navigation items).
- [x] Compiled comprehensive **Phase 2 Handoff Report** in `HANDOFF.md` covering architecture, port matrix, demo credentials, mock registry, and test execution records.
- [x] Verified zero TypeScript errors across all monorepo packages (`pnpm -r typecheck`), 35/35 passing tests in `apps/web`, 50/50 passing tests monorepo-wide (`pnpm -r test`), and clean Next.js 15 production build with 17 static & dynamic routes (`next build`).

---

## 8. Phase 3 Progress & Completed Milestones

### Milestone 3.1: AWS S3 / MinIO Presigned URL Upload & Retrieval Service
- [x] Installed and configured `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in `@sih/web`.
- [x] Implemented `apps/web/src/lib/s3.ts`:
  - `S3Client` initialized using environment variables (`S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`).
  - Strict MIME whitelist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
  - Strict purpose whitelist: `challenge_media`, `milestone_artifact`, `csr_receipt`.
  - Max file size ceiling: 10 MB (`MAX_FILE_SIZE_BYTES = 10485760`).
  - Sanitized object key generator producing `${purpose}/${userId}/${uuid}.${ext}`.
  - 5-minute presigned PUT URL generator (`createPresignedUploadUrl`, 300 seconds).
  - 15-minute presigned GET URL generator (`createPresignedViewUrl`, 900 seconds).
  - Robust key validator `parseAndValidateKey` preventing path traversal (`..`, `//`, `\`).
  - Role- and resource-aware authorization engine `canUserAccessKey` ensuring cross-tenant isolation and strict privacy on financial CSR receipts.
- [x] Implemented `POST /api/v1/uploads/presign` (`apps/web/src/app/api/v1/uploads/presign/route.ts`):
  - Authenticated via `requireAuth(req)` (401 on missing/invalid token).
  - Zod payload validation (`PresignUploadRequestSchema`) returning 400 on disallowed MIME types (`application/x-sh`), oversized payloads (>10 MB), or invalid purposes.
  - Returns presigned PUT upload URL with 300s expiry and sanitized object key.
- [x] Implemented `GET /api/v1/uploads/view` (`apps/web/src/app/api/v1/uploads/view/route.ts`):
  - Authenticated via `requireAuth(req)` (401 on missing/invalid token).
  - Validates query parameter `key` format and prefix (400 on malformed or path-traversal keys).
  - Validates user permissions: uploader, super admin, or authorized stakeholder (403 `FORBIDDEN` for unauthorized users attempting to view private CSR receipts).
  - Returns presigned GET URL with 900s expiry.
- [x] Zero byte proxying: all file bytes transfer directly between client and S3/MinIO.
- [x] Implemented comprehensive integration test suite in `apps/web/src/app/api/v1/uploads/uploads-integration.test.ts`:
  - 13 passing tests verifying authentication gates, MIME rejection, size limit rejection, path traversal protection, permission enforcement, real HTTP PUT upload of sample PNG buffer to live MinIO, and real HTTP GET download verifying exact binary buffer match.
- [x] Verified zero TypeScript compiler errors (`tsc --noEmit`), 48/48 passing tests in `@sih/web`, 63/63 passing tests monorepo-wide, and clean Next.js 15 production build with 19 static & dynamic routes (`next build`).

### Milestone 3.2: Challenge Intake, Listing, Detail & Citizen Endorsement APIs
- [x] Implemented `apps/web/src/lib/queues.ts`:
  - BullMQ queue producer (`challenge-pipeline`, `hei-embedding`, `notification-dispatch`) connected to Redis (`maxRetriesPerRequest: null`, connection caching on `globalThis`).
  - Helper `enqueueChallengeProcess(challengeId)` enqueuing `challenge.process` job with exponential backoff and job deduplication.
- [x] Applied database schema migration (`20261120052859_challenge_intake_fields`):
  - Added `CITIZEN` and `GOVT_OFFICIAL` to `enum UserRole`.
  - Added `SUBMITTED` to `enum ChallengeStatus`.
  - Added `districtId`, `domain`, `urgency`, `mediaKeys`, `endorsementCount`, and `canonicalId` (self-referencing duplicate hierarchy) to `Challenge`.
  - Made `industryPartnerId` nullable on `Challenge` to support direct citizen and governmental submissions.
- [x] Implemented `POST /api/v1/challenges` (`apps/web/src/app/api/v1/challenges/route.ts`):
  - Guarded by `requireAuth` and `requireRoles(["CITIZEN", "STUDENT", "GOVT_OFFICIAL", "SUPER_ADMIN"])`.
  - Zod request schema validation (`title` 10-140 chars, `description` 30-3000 chars, `domain`, `urgency`, `latitude` [-90, 90], `longitude` [-180, 180], `mediaKeys` max 4 with prefix check, `clientIdempotencyKey` UUID).
  - **Idempotency Protection (Offline Replay Resilience)**: Checks existing `clientIdempotencyKey` and returns HTTP `200` with existing record without creating duplicate database rows.
  - PostGIS Spatial Binding: Resolves `districtId` via `findDistrictByCoordinates()` (containment or nearest-centroid fallback) and sets PostGIS `location` point via `setChallengeLocation()`.
  - Writes immutable `AuditLog` (`CHALLENGE_SUBMITTED`).
  - Enqueues BullMQ background job `challenge.process` to Redis `challenge-pipeline` queue.
  - Returns HTTP 201 with created challenge.
- [x] Implemented `GET /api/v1/challenges` (`apps/web/src/app/api/v1/challenges/route.ts`):
  - Pagination metadata (`page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPrevPage`).
  - Dynamic filters: `districtId`, `domain` (case-insensitive), `status`, and `search` (full-text search over `title` and `problemStatement`).
  - `includeDuplicates`: filters out merged duplicate challenges (`canonicalId != null`) by default unless explicitly requested.
- [x] Implemented `GET /api/v1/challenges/[id]` (`apps/web/src/app/api/v1/challenges/[id]/route.ts`):
  - Returns challenge details, linked district, canonical parent (if merged duplicate), PostGIS coordinates, endorsement count, and ranked AI capability matches.
- [x] Implemented `POST /api/v1/challenges/[id]/endorse` (`apps/web/src/app/api/v1/challenges/[id]/endorse/route.ts`):
  - Increments `endorsementCount` atomically in PostgreSQL.
  - Anti-abuse / rate-limiting: 24-hour Redis cooldown per user/IP + DB audit log fallback, returning HTTP `429 ALREADY_ENDORSED` on repeat attempts.
  - Writes platform `AuditLog` (`CHALLENGE_ENDORSED`).
- [x] Built comprehensive integration test suite `apps/web/src/app/api/v1/challenges/challenges-integration.test.ts`:
  - 14 passing tests verifying 401 unauthenticated check, 403 unauthorized role check, 400 invalid coordinates/title/description/mediaKeys checks, 201 challenge creation with PostGIS binding and BullMQ enqueueing, 200 idempotent replay without duplicate rows, paginated listing with district/domain/search filters, 404/200 detail endpoint with capability matches, and citizen endorsement with 429 rate limit prevention.
- [x] Verified zero TypeScript compiler errors (`tsc --noEmit`), 62/62 passing tests in `@sih/web`, 77/77 passing tests monorepo-wide, and clean Next.js 15 production build with 20 static & dynamic routes (`next build`).

### Milestone 3.3: Progressive Web App (PWA) Offline Engine & IndexedDB Outbox
- [x] Implemented `apps/web/public/manifest.json`:
  - Complete Web App Manifest with `standalone` display mode, dark slate background (`#020617`), slate theme (`#0f172a`), and app metadata.
  - Linked 192x192, 512x512 PNG icons and scalable vector `icon.svg`.
- [x] Implemented PWA application icons:
  - `apps/web/public/icons/icon-192.png` (192x192 PNG)
  - `apps/web/public/icons/icon-512.png` (512x512 PNG)
  - `apps/web/public/icons/icon.svg` (SVG icon)
- [x] Linked manifest, themeColor viewport, and app icons in `apps/web/src/app/layout.tsx`.
- [x] Implemented `apps/web/public/sw.js`:
  - Precaches core app shell assets on install.
  - Cache-first strategy for static assets (`/_next/static/*`, `/icons/*`, scripts, stylesheets, fonts).
  - Network-first strategy with offline HTML fallback page for document navigations.
  - Security hygiene: Explicit exclusion of `/api/v1/auth/*`, `/api/v1/uploads/*`, S3/MinIO presigned URLs, and authenticated APIs from cache.
- [x] Implemented IndexedDB offline outbox queue in `apps/web/src/lib/offline/outbox.ts` using `idb`:
  - Stores offline drafts: `{ clientIdempotencyKey, payload, mediaFiles: Blob[], status: 'QUEUED' | 'SYNCING' | 'FAILED', retryCount, lastError, createdAt }`.
  - Queue management: `enqueueOfflineChallenge()`, `listPendingChallenges()`, `getPendingCount()`, `removeSyncedChallenge()`.
  - Idempotent synchronizer `syncOfflineOutbox()`: requests presigned PUT URL for media blobs → uploads blobs directly to S3/MinIO → posts challenge to `/api/v1/challenges` with `clientIdempotencyKey` → deletes synced item on 201/200 → handles errors with retry counting.
- [x] Implemented `apps/web/src/components/pwa/OfflineSyncProvider.tsx`:
  - Registers `/sw.js` service worker.
  - Listens to browser `online` and `offline` events.
  - Displays non-intrusive connectivity banner with queued count and manual "Sync Now" action.
  - Automatically triggers `syncOfflineOutbox()` upon network restoration.
- [x] Built comprehensive unit test suite in `apps/web/src/lib/offline/outbox.test.ts`:
  - 6 passing tests covering draft enqueueing, list/count/delete queue operations, offline guard skip, end-to-end sync with blob uploads, defensive error handling, and idempotent replay clean removal.
- [x] Verified `/manifest.json` and `/sw.js` are served cleanly with HTTP 200, 68/68 passing tests in `@sih/web`, 83/83 passing tests monorepo-wide, zero TypeScript compiler errors (`tsc --noEmit`), and clean Next.js 15 production build with 20 static & dynamic routes (`next build`).

### Milestone 3.4: Mobile-First Citizen Challenge Submission PWA UI, Explorer & Detail Pages
- [x] Implemented `/challenges/new` mobile-first submission page (`apps/web/src/app/challenges/new/page.tsx`):
  - Form fields: Title (10-140 chars), Description (30-3000 chars), Domain dropdown (8 domains), Urgency level picker (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
  - Jharkhand District Quick-Picker: 8 pre-configured district centroids (`JH_RAN`, `JH_ESN`, `JH_DHN`, `JH_BOK`, `JH_HAZ`, `JH_DEO`, `JH_DUM`, `JH_PAL`) for instant demo coordinate loading.
  - "Use My GPS Location" browser geolocation trigger (`navigator.geolocation.getCurrentPosition`) with accurate fallback.
  - Multi-file image & document uploader with client-side preview thumbnails and one-click removal.
  - Dual Online/Offline Submission Pipeline:
    - **Online**: Requests presigned PUT URL via `POST /api/v1/uploads/presign` -> uploads binary bytes directly to MinIO/S3 -> submits challenge to `POST /api/v1/challenges`.
    - **Offline**: Captures binary `File`/`Blob` objects and enqueues into IndexedDB outbox via `enqueueOfflineChallenge()`.
  - Prominent visual status notification: Distinguishes between live server synchronization vs offline queueing with instructions on background sync.
- [x] Implemented `/challenges` Challenge Explorer page (`apps/web/src/app/challenges/page.tsx`):
  - Keyword search over challenge title and description.
  - Dynamic filters: Domain selector, Status selector (`SUBMITTED`, `OPEN`, `UNDER_REVIEW`, `MATCHED`, etc.), and `includeDuplicates` toggle.
  - Responsive challenge card layout with status badges, urgency indicators, district badges, and endorsement counts.
  - Pending Offline Queue Drawer:
    - Slide-over drawer displaying all queued offline challenges from IndexedDB.
    - Status badges (`QUEUED`, `SYNCING`, `FAILED`) and retry counters.
    - Manual "Sync All Now" trigger running `syncOfflineOutbox()`.
  - Floating Action Button (FAB) on mobile viewports for quick challenge submission.
- [x] Implemented `/challenges/[id]` Challenge Detail page (`apps/web/src/app/challenges/[id]/page.tsx`):
  - Dynamic route param unwrapping via React 15 `use(params)`.
  - Detailed challenge header with status pill, urgency indicator, district tag, and author metadata.
  - Challenge narrative and full problem statement.
  - Media gallery: Fetches authorized 15-minute presigned GET URLs via `/api/v1/uploads/view?key=...` and renders interactive image previews and document download links.
  - Duplicate-Merge Banner: Visual banner when `canonicalId` is present, displaying 94% semantic similarity match and a direct link to the canonical parent challenge.
  - Citizen Endorsement Action: Real-time endorsement button calling `POST /api/v1/challenges/[id]/endorse` with anti-abuse feedback and live count increment.
  - Top AI-Matched HEIs Panel: Displays ranked institutional matches (Tier 1/2/3 institutions) with similarity scores and capability match status.
- [x] Updated `apps/web/src/components/AppShell.tsx`:
  - Granted `CITIZEN` and `GOVT_OFFICIAL` roles navigation access to `/challenges` and `/dashboard`.
- [x] Configured `serverExternalPackages: ["bullmq"]` in `apps/web/next.config.ts` to cleanly isolate BullMQ optional drivers from Webpack client/server bundling.
- [x] Verified zero TypeScript errors across all workspaces (`pnpm -r typecheck`), 68/68 passing tests in `@sih/web`, 83/83 passing tests monorepo-wide (`pnpm -r test`), and clean Next.js 15 production build with 22 static & dynamic routes (`next build`).
- [x] Verified mobile-first responsive layout across 375px (mobile PWA) and 1280px (desktop) viewports.
