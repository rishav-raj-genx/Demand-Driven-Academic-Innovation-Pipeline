# SIH26043: Demand-Driven Academic Innovation Pipeline

> **Smart India Hackathon (SIH) 2024**  
> **Team:** The Unknowns  
> **Problem Statement ID:** SIH26043  
> **Domain:** Smart Governance, Higher Education & Industrial R&D Matchmaking  
> **Target State Ecosystem:** State of Jharkhand (8 Districts, 10 HEIs across Tiers 1-3, 5 MSME/CSR Partners)

---

## 1. Executive Summary

The **Demand-Driven Academic Innovation Pipeline (SIH26043)** replaces fragmented academic research silos with an intelligent, closed-loop innovation lifecycle. It connects crowdsourced citizen demands, municipal pain points, and MSME industrial challenges directly to university laboratories and faculty researchers.

### Key Capabilities
1. **Offline-First Citizen Intake (PWA)**: Edge service workers and IndexedDB outbox with client-side SHA-256 idempotency queues that automatically sync over flaky rural network conditions.
2. **Dense Vector Semantic Deduplication**: High-speed cosine deduplication engine powered by PostgreSQL 16 `pgvector` and `all-MiniLM-L6-v2` (384-dimensional dense vectors) clustering paraphrased demands into canonical parent initiatives.
3. **Capacity-Aware Equitable Matchmaking**: Real-time PostGIS spatial routing combined with statutory capacity ceilings and quadratic overload penalties—preventing Tier-1 HEIs from monopolizing state R&D funding and empowering Tier-2/3 institutions.
4. **Cryptographic Dual-Signature Stage Gate Engine**: Rigorous 4-stage Project Lifecycle Management (`PoC → Prototyping → Field Test → IP & Tech Transfer`) enforcing independent, verified Academic and External Industry approvals on SHA-256 deliverable content hashes with NEP 2020 experiential credit accrual.
5. **PostGIS Statewide Innovation Density Engine**: Sub-150ms GeoJSON spatial aggregations across Jharkhand's administrative districts rendered with resilient dark-canvas vector fallbacks and BullMQ mock SMS dispatch telemetry.

---

## 2. Quickstart & Deterministic Demo Preparation

### Prerequisites
- **Node.js**: `v20+` or `v24+`
- **pnpm**: `v10+` or `v11+`
- **Docker & Docker Compose**: running locally
- **Python**: `3.11+` or `3.12+` with `uv` package manager

### Single-Command Startup

```bash
# 1. Clone & install workspace dependencies
pnpm install

# 2. Start containerized infrastructure (Postgres 16 + PostGIS + pgvector, Redis 7, MinIO S3)
pnpm infra:up

# 3. Start Python FastAPI AI Engine (Terminal 2)
cd services/ai-engine && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# 4. Deterministic SIH Demo Preparation (resets DB, embeds 10 HEIs, analyzes 30 challenges, readies dual-sig PoC)
pnpm demo:prepare

# 5. Launch Next.js Web App & Background Worker (Terminal 1)
pnpm dev
```

Platform interfaces are now live at:
- **Web Application Portal**: [http://localhost:3000](http://localhost:3000)
- **Demo Inspector & Evaluator Deck**: [http://localhost:3000/admin/demo](http://localhost:3000/admin/demo)
- **FastAPI AI Engine Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **MinIO Storage Console**: [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`)

---

## 3. The 5 SIH Live-Demo Checkpoints

| # | Checkpoint Name | Target URL | Evaluation Criteria & Talking Points |
|---|---|---|---|
| **01** | **Citizen PWA Offline Submission** | [`/challenges/new`](http://localhost:3000/challenges/new) | Toggle DevTools offline mode. Submit challenge. Demonstrates client idempotency key & IndexedDB outbox. Re-enable network; submissions auto-sync to BullMQ worker. |
| **02** | **Semantic Deduplication Proof** | [`/challenges`](http://localhost:3000/challenges) | Toggle "Include duplicates". Demonstrates cosine similarity (&ge; 0.68) merging Palamu fluoride & Dumka solar duplicate pairs into canonical parents, incrementing citizen endorsements. |
| **03** | **Capacity-Aware Tier-2/3 Routing** | [`/dashboard`](http://localhost:3000/dashboard) | PostGIS distance decay + quadratic capacity overload penalty ($active/max)^2 prevents NIT Jamshedpur (5/5 capacity) from monopolizing, promoting BIT Sindri and Govt Poly Adityapur. |
| **04** | **Live PoC &rarr; Prototyping Dual-Signature** | [`/projects/{pocId}`](http://localhost:3000/admin/demo) | Open PoC project. Dr. Sunita Murmu (Academic PI) signature is already recorded. Sign in as Tata Steel CSR (`industry@tata.com`) and click **Sign Milestone** to trigger real-time transition to PROTOTYPING with 2 NEP credits. |
| **05** | **Jharkhand PostGIS Map & Mock SMS Log** | [`/dashboard`](http://localhost:3000/dashboard) &amp; [`/admin/mock-sms`](http://localhost:3000/admin/mock-sms) | Sub-150ms GeoJSON spatial density polygons across 8 districts + real-time BullMQ background dispatch telemetry simulating SMS alerts to citizens and researchers. |

---

## 4. Evaluator Persona Credentials Matrix

All accounts are pre-seeded and verified with **Argon2id** password hashing:
> **Universal Password:** `DemoPassword123!`

| Role | Email | Organization / Institution | Capabilities Demonstrated |
|---|---|---|---|
| **Super Administrator** | `admin@sih.gov.in` | Ministry / AICTE Executive | Demo Inspector Deck, 1-Click Reset, Platform Auditing |
| **Industry Partner** | `industry@tata.com` | Tata Steel Foundation (Verified CSR) | Dual-Signature Approval, MoU Signing, CSR Ledger |
| **Faculty Lead (PI)** | `faculty@sih.gov.in` | BIT Mesra (Verified HEI) | Milestone Submission, Content Hashing, Academic Signature |
| **Citizen / Student** | `student@sih.gov.in` | NIT Jamshedpur | Offline PWA Challenge Intake, Campus Innovation Tracking |
| **HEI Administrator** | `inst.admin@sih.gov.in` | BIT Mesra (Verified HEI) | AISHE Verification, Capacity Controls, Lab R&D Profile |
| **Govt. Official** | `official@jharkhand.gov.in` | DHE Jharkhand | Spatial Innovation Analytics, Institutional Load Balancing |

---

## 5. Architecture & Monorepo Structure

```text
SIH26043/
├── apps/
│   ├── web/                     # Next.js 15 App Router (React 19, Tailwind CSS, Leaflet, Recharts)
│   │   ├── src/app/admin/demo/  # Admin Demo Inspector & Evaluator Deck (/admin/demo)
│   │   ├── src/app/dashboard/   # DHE Executive Analytics & PostGIS Spatial Density Map
│   │   └── src/lib/offline/     # IndexedDB Offline Outbox & Service Worker Sync
│   └── worker/                  # Multi-queue BullMQ worker (Redis, pino, SMS dispatcher)
├── packages/
│   ├── db/                      # Prisma ORM, PostGIS spatial queries & seed datasets
│   │   └── prisma/seeds/data/   # 30 Challenges, 10 HEIs, 5 Partners, 8 Districts
│   └── shared/                  # Shared domain contracts, Zod schemas & PLM state machine
├── services/
│   └── ai-engine/               # FastAPI Python 3.12 (sentence-transformers MiniLM-L6-v2)
│       └── app/                 # pgvector dense embedding, deduplication & capacity scoring
├── docker/                      # Postgres Dockerfile with PostGIS 3.7 & pgvector 0.8
├── scripts/
│   └── demo-prepare.ts          # Deterministic 1-command reset & state preparation
└── docker-compose.yml           # Container orchestration (postgres, redis, minio)
```

---

## 6. Monorepo Verification & Test Suites

```bash
# 1. Run all TypeScript unit & integration test suites (170+ tests)
pnpm -r test

# 2. Run Python AI Engine Pytest suite (21 tests)
cd services/ai-engine && .venv/bin/pytest -v

# 3. Next.js 15 production build
pnpm --filter @sih/web build
```
