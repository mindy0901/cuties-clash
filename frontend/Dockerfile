# syntax=docker/dockerfile:1
#
# FRONTEND image (fr): holds only the Vite build, served by nginx.
#
# The build context is the **repo root**: this is a pnpm workspace, so `pnpm-lock.yaml` and
# `pnpm-workspace.yaml` sit at the root, while the frontend package lives in `frontend/`.
#
# nginx does two jobs:
#   1. serve dist/ (SPA: every path that is not a file returns index.html)
#   2. forward /api/* to the backend container
# Thanks to (2), the browser only talks to ONE origin — the session cookie behaves
# as it does on a single port, and CORS does not need to be enabled.

# ── Stage 1: build the frontend ───────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

# Copy only the manifests first to reuse Docker's cache for the dependency install.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/
# `--filter frontend...` installs exactly this package (and its dependencies), skipping the backend.
RUN pnpm install --frozen-lockfile --filter frontend...

# `COPY frontend ./frontend` also brings `public/` along — Vite copies that whole directory into
# `dist/`. Without it, every icon image (/icons/**) is missing from the image and nginx returns
# index.html instead of the image (hard to notice because HTTP still returns 200).
COPY frontend ./frontend

RUN pnpm --filter frontend build

# ── Stage 2: nginx serves static files + proxies the API ──────────────────────
FROM nginx:1.29-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
