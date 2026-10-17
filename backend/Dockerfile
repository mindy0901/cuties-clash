# syntax=docker/dockerfile:1
#
# Image BACKEND (be): Fastify + Prisma, WITHOUT the frontend (the frontend has its own image:
# frontend/Dockerfile).
#
# The build context is the **repo root** because this is a pnpm workspace — `pnpm-lock.yaml`
# lives at the root.
#
# ⚠️ Use node:22-slim (Debian), NOT alpine: Prisma downloads its binary engine based on the
# operating system's libc/openssl. On musl/alpine you must declare your own `binaryTargets` and
# it breaks very easily at runtime — switching to slim is much cheaper.

FROM node:22-slim AS runtime

# Prisma needs openssl to pick the right engine.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy only the manifests first so Docker can cache the dependency install step.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
# Install devDependencies TOO: the `prisma` CLI (migrate deploy) and `tsx` (running
# TypeScript directly, see the note below) are both needed.
RUN pnpm install --frozen-lockfile --filter backend...

COPY backend ./backend

# Prisma Client is generated into node_modules, so it must be generated INSIDE this image.
RUN pnpm --filter backend exec prisma generate

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser \
    && chmod +x /app/backend/docker-entrypoint.sh \
    && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/backend

ENV ENVIRONMENT=production \
    AUTO_CREATE_TABLES=false

EXPOSE 8000

# Wait for Postgres to be ready → prisma migrate deploy → tsx src/main.ts.
#
# ⚠️ Why it runs via `tsx` and not `node dist/main.js`: the source imports have no extension
# (`from './config'`) and `tsconfig.json` allows that with `noEmit` +
# `moduleResolution: bundler`. Plain Node ESM **requires** a `.js` extension in imports, so
# running a compiled build would mean fixing the extension in every file. `tsx` resolves them
# exactly as in dev — one runtime, no behaviour drift. The `build` command is therefore a
# **typecheck** step and produces no `dist/`.
ENTRYPOINT ["./docker-entrypoint.sh"]
