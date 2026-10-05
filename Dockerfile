# syntax=docker/dockerfile:1.7
# VANGUARD OPS — single image: Fastify/Socket.IO server that also serves the built web app.

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ---- deps (cached on lockfile + manifests)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/server/prisma apps/server/prisma
COPY apps/web/package.json apps/web/
COPY packages/sim/package.json packages/sim/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ---- build web + server, then a production-only server bundle
FROM deps AS build
COPY . .
RUN pnpm --filter @vanguard/web build \
 && pnpm --filter @vanguard/server build \
 && pnpm --filter @vanguard/server deploy --prod /out \
 && cd /out && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

# ---- runtime
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SCENARIOS_DIR=/app/scenarios \
    WEB_DIST=/app/web \
    LLM_PROVIDER=none
WORKDIR /app
COPY --from=build --chown=node:node /out /app/server
COPY --from=build --chown=node:node /repo/apps/web/dist /app/web
COPY --from=build --chown=node:node /repo/scenarios /app/scenarios
COPY --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
