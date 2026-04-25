# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ libc6-compat \
  && corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json tsconfig.json ./
COPY .npmrc ./
COPY packages packages
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY apps/web apps/web

RUN pnpm --filter @apb/shared build \
  && pnpm --filter @apb/web build \
  && pnpm --filter @apb/server build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
RUN apk add --no-cache libc6-compat tini \
  && corepack enable
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/packages packages
COPY --from=builder /app/apps/server/package.json apps/server/
COPY --from=builder /app/apps/server/migrations apps/server/migrations
COPY --from=builder /app/apps/server/dist apps/server/dist

RUN pnpm install --filter @apb/server --prod --frozen-lockfile=false \
  && pnpm store prune

VOLUME ["/data"]
EXPOSE 8787

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
