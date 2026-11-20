FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy monorepo workspace configurations
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/worker apps/worker

RUN pnpm --filter @sih/db prisma generate
RUN pnpm --filter @sih/shared build
RUN pnpm --filter @sih/db build
RUN pnpm --filter @sih/worker build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

COPY --from=builder /app /app

USER worker

CMD ["pnpm", "--filter", "@sih/worker", "start"]
