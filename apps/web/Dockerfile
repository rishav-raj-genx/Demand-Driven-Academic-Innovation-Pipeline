FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy monorepo workspace configurations
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/

# Install dependencies with frozen lockfile
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source trees
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/web apps/web

# Generate Prisma Client & build packages
RUN pnpm --filter @sih/db prisma generate
RUN pnpm --filter @sih/shared build
RUN pnpm --filter @sih/db build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sih/web build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application and production dependencies
COPY --from=builder /app /app

USER nextjs

EXPOSE 3000

CMD ["pnpm", "--filter", "@sih/web", "start"]
