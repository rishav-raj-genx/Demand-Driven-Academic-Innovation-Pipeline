# PHASE 3 HANDOFF REPORT: SIH26043

**Project:** Demand-Driven Academic Innovation Pipeline  
**Team:** The Unknowns  
**Phase:** Phase 3 (AWS S3 Presigned Uploads, Challenge Intake & PostGIS Binding, Offline PWA Engine, Citizen Explorer UI) — **COMPLETE**  
**Date:** 2026-11-20  

---

## 1. Executive Summary

Phase 3 delivers the citizen challenge intake, geospatial binding, direct-to-S3 media infrastructure, offline-first Progressive Web App (PWA) engine, and mobile-first citizen user interface for the SIH26043 platform.

### Key Milestones Completed:
1. **Milestone 3.1: Direct-to-S3 / MinIO Presigned Media Service**:
   - Initialized `S3Client` (`apps/web/src/lib/s3.ts`) with custom MinIO/S3 endpoints and path-style addressing.
   - Implemented `POST /api/v1/uploads/presign` issuing 5-minute presigned `PUT` URLs after validating MIME types (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), maximum size (10 MB), and purpose (`challenge_media`, `milestone_artifact`, `csr_receipt`).
   - Implemented `GET /api/v1/uploads/view?key=...` issuing 15-minute presigned `GET` URLs after verifying object key structure and role-based permissions (preventing cross-tenant leakage on confidential receipts).
   - **Zero byte proxying**: Browser clients upload directly to MinIO/S3 without buffering binary files in Next.js memory.

2. **Milestone 3.2: Challenge Intake, PostGIS Spatial Binding & BullMQ Producer**:
   - Implemented `apps/web/src/lib/queues.ts` establishing resilient BullMQ queue producers (`challenge-pipeline`, `hei-embedding`, `notification-dispatch`) connected to Redis.
   - Applied database migration `20261120052859_challenge_intake_fields` adding roles `CITIZEN` and `GOVT_OFFICIAL`, status `SUBMITTED`, PostGIS point binding, and duplicate hierarchy (`canonicalId`).
   - Implemented `POST /api/v1/challenges`: validates request with Zod, checks `clientIdempotencyKey` for offline replay protection (returning HTTP 200 without duplicate database rows), resolves district via PostGIS spatial containment/nearest-centroid query (`findDistrictByCoordinates`), sets PostGIS point (`setChallengeLocation`), writes `AuditLog`, and enqueues BullMQ background job `challenge.process`.
   - Implemented `GET /api/v1/challenges` supporting pagination, district filter, domain filter, status filter, keyword search, and duplicate filtering (`includeDuplicates`).
   - Implemented `GET /api/v1/challenges/[id]` returning full narrative, district, canonical parent (if merged duplicate), PostGIS coordinates, and ranked AI capability matches.
   - Implemented `POST /api/v1/challenges/[id]/endorse` with 24-hour Redis sliding-window cooldown and database audit fallback to prevent repeat endorsement abuse.

3. **Milestone 3.3: Progressive Web App (PWA) & Offline IndexedDB Outbox**:
   - Configured `public/manifest.json` with `standalone` display mode, high-contrast dark theme, and PWA icons (192x192, 512x512, SVG).
   - Implemented Service Worker `public/sw.js` with Cache-First strategy for static assets (`/_next/static/*`, `/icons/*`, scripts, styles) and Network-First navigation with offline fallback.
   - Explicitly excluded all authenticated APIs (`/api/v1/auth/*`, `/api/v1/uploads/*`) and presigned S3 URLs from cache storage.
   - Implemented IndexedDB queue in `apps/web/src/lib/offline/outbox.ts` (`idb`): persists pending drafts and binary `Blob` attachments offline, with automated sync (`syncOfflineOutbox()`) upon network restoration.
   - Implemented `OfflineSyncProvider.tsx` with non-intrusive floating connectivity banner and manual "Sync Now" trigger.

4. **Milestone 3.4: Mobile-First Citizen Challenge Submission PWA UI & Explorer**:
   - `/challenges/new`: Intuitive submission form with domain and urgency selectors, 8 Jharkhand district presets (`JH_RAN`, `JH_ESN`, `JH_DHN`, etc.), browser GPS location trigger, and file uploader with preview.
   - Seamless dual submission: Live S3 upload + API post when online, or local IndexedDB outbox queueing when offline.
   - `/challenges`: Filterable explorer with status pills (`SUBMITTED`, `MATCHED`, `DUPLICATE_MERGED`, `IN_PROJECT`), urgency indicators, district badges, endorsement counters, and an interactive slide-over Pending Offline Queue drawer.
   - `/challenges/[id]`: Full challenge narrative, presigned GET media gallery, duplicate-merge banner linking the canonical parent (with 94% similarity badge), citizen endorsement action, and Top AI-Matched HEIs panel.

---

## 2. Infrastructure & Port Allocation

| Service | Host Port | Protocol | Container / Process | Healthcheck / Probe | Status |
|---|---|---|---|---|---|
| PostgreSQL 16 | `5432` | TCP (Wire) | `sih26043-postgres` | `pg_isready -U postgres -d sih26043_db` | Operational (PostGIS 3.7.0 + pgvector 0.8.7) |
| Redis 7 | `6379` | TCP (RESP) | `sih26043-redis` | `redis-cli ping` | Operational (Rate limiting & queues) |
| MinIO (S3 API) | `9000` | HTTP / S3 | `sih26043-minio` | `GET /minio/health/live` | Operational (`sih26043-uploads` bucket active) |
| MinIO Web Console | `9001` | HTTP / HTML | `sih26043-minio` | Browser Console | Operational |
| Next.js Web App | `3000` | HTTP / HTML | `apps/web` | `GET /api/v1/health` | Operational (Next.js 15.1.7) |
| AI Engine | `8000` | HTTP / JSON | `services/ai-engine` | `GET /health` | Operational (FastAPI + pgvector) |
| BullMQ Worker | N/A | Worker Daemon | `apps/worker` | `pnpm --filter @sih/worker check` | Operational |

---

## 3. Direct S3 Upload Architecture (Zero Byte Proxying)

```
[ Citizen Browser / PWA ]
       │
       │ 1. POST /api/v1/uploads/presign (fileName, contentType, fileSizeBytes, purpose)
       ▼
[ Next.js API Route ]
       │ 2. Validates JWT Auth, MIME whitelist, size <= 10MB
       │ 3. Generates sanitized key `${purpose}/${userId}/${uuid}.${ext}`
       │ 4. Calls AWS SDK PutObjectCommand presigner (300s expiry)
       ▼
[ Citizen Browser / PWA ] <── Returns { uploadUrl, key }
       │
       │ 5. Direct HTTP PUT uploadUrl (Binary File Buffer)
       ▼
[ MinIO / S3 Object Storage ] (Zero Next.js memory overhead)
       │
       │ 6. Upload complete (200 OK)
       ▼
[ Citizen Browser / PWA ]
       │ 7. POST /api/v1/challenges { title, description, mediaKeys: [key], ... }
       ▼
[ Next.js Challenges API ]
       │ 8. Binds PostGIS coordinates, writes Challenge, enqueues BullMQ job
       ▼
[ PostgreSQL / PostGIS ]
```

---

## 4. API Endpoints Reference

### Uploads API
- **`POST /api/v1/uploads/presign`**
  - **Auth**: Required (`requireAuth`)
  - **Body**: `{ fileName: string, contentType: string, fileSizeBytes: number, purpose: "challenge_media" | "milestone_artifact" | "csr_receipt" }`
  - **Constraints**: MIME whitelist (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), size <= 10 MB.
  - **Response (200)**: `{ success: true, data: { uploadUrl: string, key: string, expiresIn: 300, purpose: string } }`
- **`GET /api/v1/uploads/view?key=<objectKey>`**
  - **Auth**: Required (`requireAuth`)
  - **Constraints**: Key format and prefix validation, path-traversal rejection, cross-tenant CSR receipt isolation.
  - **Response (200)**: `{ success: true, data: { viewUrl: string, key: string, expiresIn: 900 } }`

### Challenges API
- **`POST /api/v1/challenges`**
  - **Auth**: `CITIZEN`, `STUDENT`, `GOVT_OFFICIAL`, `SUPER_ADMIN`
  - **Body**: `{ title: string, description: string, domain?: string, urgency?: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", latitude?: number, longitude?: number, mediaKeys?: string[], clientIdempotencyKey: string (UUID) }`
  - **Idempotency**: Replaying identical `clientIdempotencyKey` returns HTTP 200 with the existing record.
  - **PostGIS**: Spatial containment lookup in `districts` polygon; sets PostGIS `location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
  - **Queueing**: Enqueues background job `challenge.process` in `challenge-pipeline` BullMQ queue.
  - **Response (201 / 200)**: `{ success: true, data: Challenge }`
- **`GET /api/v1/challenges`**
  - **Query Params**: `page`, `limit`, `districtId`, `domain`, `status`, `search`, `includeDuplicates`
  - **Response (200)**: `{ success: true, data: Challenge[], pagination: { total, page, limit, totalPages, hasNextPage, hasPrevPage } }`
- **`GET /api/v1/challenges/[id]`**
  - **Response (200)**: Returns challenge record with `district`, `canonicalChallenge`, `duplicateChallenges`, and ranked `capabilityMatches`.
- **`POST /api/v1/challenges/[id]/endorse`**
  - **Auth**: Public / Authenticated with sliding window rate limiter (1 endorsement / 24 hours per user/IP).
  - **Response (200)**: `{ success: true, message: "Challenge endorsed successfully", data: { challengeId, endorsementCount } }`

---

## 5. Offline PWA Outbox Specification

### IndexedDB Outbox Record Schema (`apps/web/src/lib/offline/outbox.ts`)
```typescript
interface OutboxChallengeItem {
  clientIdempotencyKey: string;     // Unique UUID generated on the client
  payload: {
    title: string;
    description: string;
    domain: string;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    latitude?: number;
    longitude?: number;
  };
  mediaFiles: Array<{
    name: string;
    type: string;
    size: number;
    blob: Blob;
  }>;
  status: "QUEUED" | "SYNCING" | "FAILED";
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}
```

### Sync Pipeline Behavior
1. Triggered on window `online` event or manual "Sync All Now" click.
2. For each queued item:
   - Sets status to `SYNCING`.
   - Iterates through `mediaFiles`: requests presigned URL from `POST /api/v1/uploads/presign` -> executes direct HTTP `PUT` to MinIO/S3 -> collects generated `mediaKeys`.
   - Posts complete challenge payload to `POST /api/v1/challenges` with `clientIdempotencyKey`.
   - On HTTP 201 or 200 (idempotent replay), removes item from IndexedDB.
   - On network or server failure, updates status to `FAILED`, increments `retryCount`, records `lastError`, and preserves draft in outbox.

---

## 6. Exact Verified Test Runs & Results

### A. Web Test Suite (`pnpm --filter @sih/web test`)
```bash
pnpm --filter @sih/web test
```
```text
 ✓ src/lib/offline/outbox.test.ts (6 tests) 17ms
   ✓ IndexedDB Offline Outbox Queue & Sync Pipeline > should enqueue challenge drafts with binary file blobs
   ✓ IndexedDB Offline Outbox Queue & Sync Pipeline > should list and count pending queued challenges
   ✓ IndexedDB Offline Outbox Queue & Sync Pipeline > should skip synchronization when browser is offline
   ✓ IndexedDB Offline Outbox Queue & Sync Pipeline > should upload media blobs and sync challenge when online
   ✓ IndexedDB Offline Outbox Queue & Sync Pipeline > should handle network upload errors defensively and record failure state
   ✓ IndexedDB Offline Outbox Queue & Sync Pipeline > should handle idempotent replay (HTTP 200) by successfully removing outbox draft

 ✓ src/lib/auth/auth-utils.test.ts (15 tests) 106ms
   ✓ Password Hashing & Verification (Argon2id) > should hash a password into a valid argon2id formatted string
   ✓ Password Hashing & Verification (Argon2id) > should verify correct password and reject incorrect password
   ✓ Password Hashing & Verification (Argon2id) > should defensively handle invalid inputs without throwing
   ✓ JWT Signing, Expiry & Tamper Rejection (jose) > should sign and verify access token with 15m expiration
   ✓ JWT Signing, Expiry & Tamper Rejection (jose) > should sign and verify refresh token with 7d expiration
   ✓ JWT Signing, Expiry & Tamper Rejection (jose) > should reject tampered or corrupted JWT tokens
   ✓ JWT Signing, Expiry & Tamper Rejection (jose) > should reject expired JWT tokens
   ✓ JWT Signing, Expiry & Tamper Rejection (jose) > should compute deterministic SHA-256 hash for refresh token DB storage
   ✓ HttpOnly & Lax Cookie Configurations > should format cookie string with HttpOnly, SameSite=Lax, and Path=/
   ✓ HttpOnly & Lax Cookie Configurations > should append access and refresh token cookies to headers
   ✓ HttpOnly & Lax Cookie Configurations > should clear auth cookies with Max-Age=0
   ✓ HttpOnly & Lax Cookie Configurations > should extract tokens from cookie or authorization header
   ✓ Zod 3-Layer Request Validation Helper (parseJsonBody) > should reject empty or malformed JSON payload with 400 INVALID_JSON
   ✓ Zod 3-Layer Request Validation Helper (parseJsonBody) > should reject schema validation failure with 400 VALIDATION_ERROR and field details
   ✓ Zod 3-Layer Request Validation Helper (parseJsonBody) > should return parsed strongly-typed data when input is valid

 ✓ src/lib/verification/verification.test.ts (6 tests) 106ms
   ✓ 1. should verify all 10 seeded Jharkhand HEIs with Controlled Mock MVP metadata
   ✓ 2. should reject negative AISHE test codes with REJECTED and NOT_FOUND statuses
   ✓ 3. should verify valid MCA CINs and Udyam numbers, and reject fraudulent ones
   ✓ 4. POST /api/v1/verify/aishe should validate format, query provider, update DB, and log audit
   ✓ 5. POST /api/v1/verify/industry should verify MCA CIN or Udyam number and activate partner
   ✓ 6. Protected Route Gate: unverified org accounts must receive 403 ORG_NOT_VERIFIED

 ✓ src/app/api/v1/uploads/uploads-integration.test.ts (13 tests) 130ms
   ✓ 1. POST /api/v1/uploads/presign should require authentication (401 on missing token)
   ✓ 2. POST /api/v1/uploads/presign should reject disallowed MIME type (application/x-sh)
   ✓ 3. POST /api/v1/uploads/presign should reject oversized file (>10MB)
   ✓ 4. POST /api/v1/uploads/presign should reject invalid purpose
   ✓ 5. POST /api/v1/uploads/presign should issue 5-minute presigned PUT URL and sanitized key
   ✓ 6. S3 Key Validator should reject path traversal keys (../, //, \)
   ✓ 7. Real MinIO Upload & Retrieval: should upload PNG buffer via presigned PUT and download exact bytes
   ✓ 8. GET /api/v1/uploads/view should require authentication (401 on missing token)
   ✓ 9. GET /api/v1/uploads/view should reject missing or malformed key query param
   ✓ 10. GET /api/v1/uploads/view should allow challenge_media view by any authenticated user
   ✓ 11. GET /api/v1/uploads/view should allow uploader to view their own milestone artifact
   ✓ 12. GET /api/v1/uploads/view should allow super admin to view any artifact or receipt
   ✓ 13. GET /api/v1/uploads/view should forbid unauthorized user from viewing private csr_receipt

 ✓ src/app/api/v1/auth/auth-integration.test.ts (9 tests) 181ms
   ✓ 1. POST /api/v1/auth/register should register a new student user and return sanitized data
   ✓ 2. POST /api/v1/auth/login should authenticate, return HttpOnly Lax cookies, and omit passwordHash
   ✓ 3. GET /api/v1/auth/me should return current user profile via access token cookie
   ✓ 4. POST /api/v1/auth/refresh should rotate refresh token and issue new token pair
   ✓ 5. POST /api/v1/auth/refresh should detect token reuse attack and revoke entire session family
   ✓ 6. POST /api/v1/auth/logout should revoke token and clear cookies with Max-Age=0
   ✓ 7. GET /api/v1/auth/me should return 401 UNAUTHORIZED when no token is provided
   ✓ 8. requireRoles should reject unauthorized role with 403 FORBIDDEN
   ✓ 9. requireVerifiedOrg should reject unverified organization with 403 ORG_NOT_VERIFIED

 ✓ src/app/api/v1/challenges/challenges-integration.test.ts (14 tests) 159ms
   ✓ 1. POST /api/v1/challenges should require authentication (401 on missing token)
   ✓ 2. POST /api/v1/challenges should reject unauthorized role (403 FORBIDDEN for INVESTOR)
   ✓ 3. POST /api/v1/challenges should reject invalid coordinates (latitude out of range)
   ✓ 4. POST /api/v1/challenges should reject invalid title or short description
   ✓ 5. POST /api/v1/challenges should reject mediaKeys that do not match challenge_media prefix
   ✓ 6. POST /api/v1/challenges should create challenge, resolve district, set PostGIS location, and enqueue BullMQ job
   ✓ 7. POST /api/v1/challenges should be idempotent when replaying duplicate clientIdempotencyKey
   ✓ 8. GET /api/v1/challenges should return paginated list of challenges
   ✓ 9. GET /api/v1/challenges should filter by districtId
   ✓ 10. GET /api/v1/challenges should filter by domain
   ✓ 11. GET /api/v1/challenges should perform full-text search over title and description
   ✓ 12. GET /api/v1/challenges/[id] should return 404 for non-existent ID
   ✓ 13. GET /api/v1/challenges/[id] should return challenge details with district and capability matches
   ✓ 14. POST /api/v1/challenges/[id]/endorse should increment endorsement count and rate limit repeat endorsements

 ✓ src/components/AppShell.test.ts (5 tests) 3ms
   ✓ should return empty array when no role is provided
   ✓ should provide STUDENT with Dashboard and Challenges routes
   ✓ should provide INSTITUTION_ADMIN and HEI_ADMIN with HEI Portal and Verify Org
   ✓ should provide INDUSTRY_PARTNER with Industry Hub and Verify Org
   ✓ should provide SUPER_ADMIN with full portal access including Admin Console

 Test Files  7 passed (7)
      Tests  68 passed (68)
   Duration  742ms
```

### B. Monorepo-Wide Summary
- `@sih/shared`: 6 passing unit tests (`plm.test.ts`)
- `@sih/db`: 9 passing integration tests (`spatial.test.ts`)
- `@sih/web`: 68 passing unit & integration tests (7 test suites)
- **Total: 83 passing tests across monorepo (0 failures)**
- **TypeScript: 0 compiler errors (`tsc --noEmit`) across all workspace packages**

### C. Production Build Output (`apps/web`)
```text
Route (app)                                 Size  First Load JS
┌ ○ /                                      162 B         103 kB
├ ○ /_not-found                            992 B         103 kB
├ ƒ /api/v1/auth/login                     162 B         103 kB
├ ƒ /api/v1/auth/logout                    162 B         103 kB
├ ƒ /api/v1/auth/me                        162 B         103 kB
├ ƒ /api/v1/auth/refresh                   162 B         103 kB
├ ƒ /api/v1/auth/register                  162 B         103 kB
├ ƒ /api/v1/challenges                     162 B         103 kB
├ ƒ /api/v1/challenges/[id]                162 B         103 kB
├ ƒ /api/v1/challenges/[id]/endorse        162 B         103 kB
├ ƒ /api/v1/challenges/claim               162 B         103 kB
├ ƒ /api/v1/health                         162 B         103 kB
├ ƒ /api/v1/transitions/sign               162 B         103 kB
├ ƒ /api/v1/uploads/presign                162 B         103 kB
├ ƒ /api/v1/uploads/view                   162 B         103 kB
├ ƒ /api/v1/verify/aishe                   162 B         103 kB
├ ƒ /api/v1/verify/industry                162 B         103 kB
├ ○ /challenges                          7.77 kB         117 kB
├ ƒ /challenges/[id]                     5.37 kB         114 kB
├ ○ /challenges/new                      9.53 kB         118 kB
├ ○ /dashboard                           3.38 kB         112 kB
├ ○ /login                               3.59 kB         136 kB
├ ○ /onboarding/verify                   4.77 kB         114 kB
└ ○ /register                            3.87 kB         136 kB
+ First Load JS shared by all             102 kB
  ├ chunks/901-4bb38870caa2eef7.js       46.2 kB
  ├ chunks/e7e3044d-ffe374be2430ae06.js  54.2 kB
  └ other shared chunks (total)          1.93 kB

ƒ Middleware                             39.1 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## 7. Instructions for Phase 4 Execution

When starting Phase 4 (AI Engine & Semantic Matchmaking Pipeline):
1. **Challenge Pipeline Worker (`apps/worker`)**:
   - Consume jobs from `challenge-pipeline` BullMQ queue.
   - Dispatch challenge title + problem statement to `services/ai-engine` for text embedding generation (`all-MiniLM-L6-v2` or `text-embedding-004`).
   - Store 768-dim / 384-dim vector into `challenges.embedding` column using PostgreSQL pgvector.
2. **Deduplication & Canonical Merging**:
   - Perform pgvector cosine distance search against existing challenges in the same district/domain.
   - If cosine similarity >= 0.88, flag as duplicate and link to canonical parent (`canonicalId`).
3. **HEI Capability Matchmaking**:
   - Compare challenge embedding against `institutions.capability_embedding` with faculty capacity penalties.
   - Populate `capability_matches` records with rank and similarity scores.
