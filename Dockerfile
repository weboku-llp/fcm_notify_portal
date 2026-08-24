# =============================================================================
# Notif Portal - multi-service image for Railway (api | worker | web)
#
# Create 3 Railway services from this same repo + Dockerfile. On each service
# set only the runtime variable:
#   api     -> SERVICE=api
#   worker  -> SERVICE=worker
#   web     -> SERVICE=web
#
# Shared env: DATABASE_URL, REDIS_URL, PORTAL_ENCRYPTION_KEY, FCM_DRIVER, ...
# Web also needs NEXT_PUBLIC_API_URL=<public api URL> at build + runtime.
# =============================================================================

ARG NODE_VERSION=20
ARG PNPM_VERSION=9.15.9

# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# -----------------------------------------------------------------------------
FROM base AS builder
# Baked into the Next.js client bundle - set as a Railway variable (build-time).
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
# Prisma generate only needs a syntactically valid URL (no live DB).
ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    DATABASE_URL=${DATABASE_URL}

# Copy full workspace before install so pnpm symlinks stay valid.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

# Install ALL deps (prisma/tsup/typescript are devDependencies needed to build).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

ENV NODE_ENV=production
RUN pnpm --filter @notif/db generate \
  && pnpm --filter @notif/api build \
  && pnpm --filter @notif/worker build \
  && pnpm --filter @notif/web build

# -----------------------------------------------------------------------------
FROM base AS runner
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NODE_ENV=production \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    SERVICE=api \
    API_HOST=0.0.0.0 \
    API_PORT=4000 \
    PORT=3000

WORKDIR /app
COPY --from=builder /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && useradd --system --uid 1001 --create-home nodejs \
  && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000 4000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "case \"$SERVICE\" in api) exec node apps/api/dist/server.js ;; worker) exec node apps/worker/dist/index.js ;; web) exec pnpm --filter @notif/web exec next start -p \"${PORT:-3000}\" ;; *) echo \"Unknown SERVICE=$SERVICE (use api|worker|web)\" >&2; exit 1 ;; esac"]