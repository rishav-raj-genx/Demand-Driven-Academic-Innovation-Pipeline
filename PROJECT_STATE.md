# PROJECT_STATE: SIH26043 - Demand-Driven Academic Innovation Pipeline

**Team:** The Unknowns  
**Status:** Phase 0 Complete (Monorepo, Infrastructure, Application Shells & AI Engine Initialized)  
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
│   │   └── package.json                       # @sih/db package shell
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

---

## 6. Phase 1 Readiness Status
Phase 0 initialization is complete. All prerequisites are in place for Phase 1:
1. **Database Modeling**: PostgreSQL container is online with PostGIS and pgvector ready for Prisma schema definitions in `packages/db`.
2. **Type Coherence**: `UserRole`, `InstitutionTier`, `ProjectPhase`, and API schemas in `@sih/shared` are ready for entity generation.
3. **Services Ready**: Web, Worker, and AI Engine services have verified health, configuration, and secure inter-op channels.
