# syntax=docker/dockerfile:1
#
# Image FRONTEND (fr): chỉ chứa bản build của Vite, phục vụ bằng nginx.
#
# Ngữ cảnh build là **thư mục gốc repo**: đây là pnpm workspace nên `pnpm-lock.yaml` và
# `pnpm-workspace.yaml` nằm ở gốc, còn gói frontend nằm trong `frontend/`.
#
# nginx làm hai việc:
#   1. phục vụ dist/ (SPA: mọi đường dẫn không phải file đều trả index.html)
#   2. chuyển tiếp /api/* sang container backend
# Nhờ (2), trình duyệt chỉ nói chuyện với MỘT origin — cookie phiên hoạt động
# như khi chạy một cổng, và không cần bật CORS.

# ── Tầng 1: dựng frontend ─────────────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

# Chỉ lấy manifest trước để tận dụng cache của Docker cho bước cài phụ thuộc.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/
# `--filter frontend...` cài đúng gói này (và phụ thuộc của nó), bỏ qua backend.
RUN pnpm install --frozen-lockfile --filter frontend...

# `COPY frontend ./frontend` mang theo cả `public/` — Vite chép nguyên thư mục đó vào
# `dist/`. Thiếu nó thì mọi ảnh icon (/icons/**) không có trong image và nginx trả
# index.html thay vì ảnh (lỗi khó thấy vì HTTP vẫn 200).
COPY frontend ./frontend

RUN pnpm --filter frontend build

# ── Tầng 2: nginx phục vụ tệp tĩnh + proxy API ────────────────────────────────
FROM nginx:1.29-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
