# PHASE 0 HANDOFF REPORT: SIH26043

**Project:** Demand-Driven Academic Innovation Pipeline  
**Team:** The Unknowns  
**Phase:** Phase 0 (Infrastructure, Monorepo Scaffolding & AI Engine Service) — **COMPLETE**  
**Date:** 2026-11-20  

---

## 1. Executive Summary
Phase 0 successfully establishes the monorepo architecture, containerized local services, shared contracts, application shells, and AI microservice for the SIH26043 platform. All core services (Postgres with PostGIS + pgvector, Redis, MinIO S3, Next.js Web App, BullMQ Worker, and FastAPI AI Engine) are tested and verified operational.

---

## 2. Port Allocation & Service Matrix

| Service | Host Port | Internal Port | Protocol / Transport | Container / Process | Healthcheck Endpoint / Probe |
|---|---|---|---|---|---|
| PostgreSQL 16 | `5432` | `5432` | TCP (PostgreSQL wire) | `sih26043-postgres` | `pg_isready -U postgres -d sih26043_db` |
| Redis 7 | `6379` | `6379` | TCP (RESP) | `sih26043-redis` | `redis-cli ping` |
| MinIO (S3 API) | `9000` | `9000` | HTTP / S3 XML | `sih26043-minio` | `GET /minio/health/live` (HTTP 200) |
| MinIO (Console) | `9001` | `9001` | HTTP (Web UI) | `sih26043-minio` | HTTP Web Console |
| Web App (Next.js) | `3000` | `3000` | HTTP / HTML / JSON | `apps/web` (`next dev`/`start`) | `GET /api/v1/health` (HTTP 200) |
| AI Engine (FastAPI) | `8000` | `8000` | HTTP / JSON | `services/ai-engine` (uvicorn) | `GET /health` (HTTP 200) |
| Worker Process | N/A | N/A | Redis Queue Consumer | `apps/worker` (`tsx`) | `pnpm --filter @sih/worker check` |

---

## 3. Environment Variables Matrix (`.env.example`)

| Variable Name | Default Dev Value | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Node.js runtime environment |
| `PORT` | `3000` | Next.js HTTP server port |
| `POSTGRES_USER` | `postgres` | Database superuser username |
| `POSTGRES_PASSWORD` | `postgres_password_dev` | Database superuser password |
| `POSTGRES_DB` | `sih26043_db` | Primary database name |
| `POSTGRES_HOST` | `localhost` | Database host address |
| `POSTGRES_PORT` | `5432` | Database port |
| `DATABASE_URL` | `postgresql://postgres:postgres_password_dev@localhost:5432/sih26043_db?schema=public` | Prisma & application DB connection string |
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL for worker & cache |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO internal API endpoint |
| `S3_PUBLIC_ENDPOINT` | `http://localhost:9000` | Client-accessible S3 upload endpoint |
| `S3_REGION` | `us-east-1` | S3 compatibility region |
| `S3_ACCESS_KEY` | `minioadmin` | S3 root access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 root secret key |
| `S3_BUCKET` | `sih26043-media` | Primary storage bucket with configured CORS |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO path-style bucket addressing |
| `JWT_SECRET` | `dev_jwt_secret_change_in_production_min_32_chars` | HMAC secret for access tokens |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifespan |
| `JWT_REFRESH_SECRET` | `dev_jwt_refresh_secret_change_in_production_min_32_chars` | Refresh token secret |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifespan |
| `INTERNAL_AI_SERVICE_KEY` | `dev_internal_ai_service_secret_key` | Constant-time authentication key for AI Engine |
| `AI_ENGINE_URL` | `http://localhost:8000` | Base URL for Python AI Engine service |
| `EMBEDDING_MODEL_NAME` | `sentence-transformers/all-MiniLM-L6-v2` | Primary vector embedding model (384 dims) |
| `DEDUP_SIMILARITY_THRESHOLD`| `0.85` | Cosine similarity threshold for problem dedup |
| `SOFT_CAPACITY_PENALTY` | `0.25` | Matching penalty factor for near-capacity labs |
| `HARD_CAPACITY_PENALTY` | `0.45` | Matching penalty factor for over-capacity labs |

---

## 4. Exact Verified Commands & Observed Results

### Infrastructure Health (`docker compose up -d`)
```bash
docker compose ps -a
```
```text
NAME                  IMAGE                                     STATUS                      PORTS
sih26043-minio        minio/minio:latest                        Up (healthy)                0.0.0.0:9000-9001->9000-9001/tcp
sih26043-minio-init   minio/mc:latest                           Exited (0)                  
sih26043-postgres     sih26043-postgres:pg16-postgis-pgvector   Up (healthy)                0.0.0.0:5432->5432/tcp
sih26043-redis        redis:7-alpine                            Up (healthy)                0.0.0.0:6379->6379/tcp
```

### PostgreSQL Extensions Verification
```bash
docker exec -i sih26043-postgres psql -U postgres -d sih26043_db -c "\dx"
```
```text
                                List of installed extensions
  Name   | Version |   Schema   |                        Description                         
---------+---------+------------+------------------------------------------------------------
 plpgsql | 1.0     | pg_catalog | PL/pgSQL procedural language
 postgis | 3.7.0   | public     | PostGIS geometry and geography spatial types and functions
 vector  | 0.8.7   | public     | vector data type and ivfflat and hnsw access methods
```

### Redis Ping
```bash
docker exec -i sih26043-redis redis-cli ping
# Output: PONG
```

### MinIO S3 CORS Preflight Test
```bash
curl -sI -X OPTIONS http://localhost:9000/sih26043-media/test -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: PUT"
```
```text
HTTP/1.1 204 No Content
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: PUT
Access-Control-Allow-Origin: http://localhost:3000
```

### Shared Package Tests (`vitest`)
```bash
pnpm --filter @sih/shared test
```
```text
 ✓ src/plm.test.ts (6 tests) 2ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Next.js Production Build & Health Endpoint
```bash
pnpm --filter @sih/web build
curl -i http://localhost:3000/api/v1/health
```
```text
HTTP/1.1 200 OK
content-type: application/json
{"status":"ok","timestamp":"2026-11-20T04:09:45.494Z","service":"web"}
```

### BullMQ Worker Health Probe
```bash
pnpm --filter @sih/worker check
```
```text
{"level":30,"name":"sih-worker","pong":"PONG","msg":"Redis ping check responded successfully"}
{"level":30,"name":"sih-worker","msg":"Redis health verification succeeded"}
```

### AI Engine Pytest Suite
```bash
cd services/ai-engine && .venv/bin/pytest -v
```
```text
tests/test_health.py::test_config_defaults PASSED                        [ 20%]
tests/test_health.py::test_health_endpoint PASSED                        [ 40%]
tests/test_health.py::test_internal_ping_valid_key PASSED                [ 60%]
tests/test_health.py::test_internal_ping_missing_key PASSED              [ 80%]
tests/test_health.py::test_internal_ping_invalid_key PASSED              [100%]
============================== 5 passed in 2.76s ===============================
```

### AI Engine Live HTTP Endpoints
```bash
# 1. Public Health Check
curl -i http://127.0.0.1:8000/health
# Response: 200 OK -> {"status":"ok","pgvector":true}

# 2. Authenticated Ping (Valid Key)
curl -i -H "X-Internal-Service-Key: dev_internal_ai_service_secret_key" http://127.0.0.1:8000/internal/v1/ping
# Response: 200 OK -> {"status":"ok","message":"pong"}

# 3. Missing Key Rejection
curl -i http://127.0.0.1:8000/internal/v1/ping
# Response: 401 Unauthorized -> {"detail":"Missing required X-Internal-Service-Key header"}

# 4. Invalid Key Rejection
curl -i -H "X-Internal-Service-Key: bad-key" http://127.0.0.1:8000/internal/v1/ping
# Response: 403 Forbidden -> {"detail":"Invalid internal service key"}
```

---

## 5. Instructions for Phase 1 Execution

When starting Phase 1 (Data Layer & Authentication):
1. **Infrastructure**: Verify local containers are up with `pnpm infra:up` (or `docker compose up -d`).
2. **Database Modeling**: In `packages/db`, initialize `prisma/schema.prisma` with:
   - PostgreSQL provider with `postgresqlExtensions` preview feature enabled for `postgis` and `vector`.
   - Models conforming to `@sih/shared` enums: `UserRole`, `InstitutionTier`, `ProjectPhase`, `ChallengeStatus`, `VerificationStatus`.
3. **Run Migrations**: Run `pnpm --filter @sih/db prisma migrate dev` to establish database schema and foreign keys.
4. **Seed Pipeline**: Implement seed scripts for institutions across Tier 1..3 with spatial coordinates and sample challenges.
