# syntax=docker/dockerfile:1
#
# Image BACKEND (be): Fastify + Prisma, KHÔNG chứa frontend (frontend có image riêng:
# frontend/Dockerfile).
#
# Ngữ cảnh build là **gốc repo** vì đây là pnpm workspace — `pnpm-lock.yaml` nằm ở gốc.
#
# ⚠️ Dùng node:22-slim (Debian) chứ KHÔNG dùng alpine: Prisma tải binary engine theo
# libc/openssl của hệ điều hành. Trên musl/alpine phải khai `binaryTargets` riêng và rất
# dễ vỡ lúc chạy — đổi sang slim là rẻ hơn nhiều.

FROM node:22-slim AS runtime

# Prisma cần openssl để chọn đúng engine.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Chỉ lấy manifest trước để tận dụng cache của Docker cho bước cài phụ thuộc.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
# Cài CẢ devDependencies: cần `prisma` CLI (migrate deploy) và `tsx` (chạy TypeScript
# trực tiếp, xem ghi chú bên dưới).
RUN pnpm install --frozen-lockfile --filter backend...

COPY backend ./backend

# Prisma Client sinh vào node_modules nên phải sinh NGAY TRONG image này.
RUN pnpm --filter backend exec prisma generate

# Chạy bằng người dùng thường.
RUN useradd --create-home --uid 10001 appuser \
    && chmod +x /app/backend/docker-entrypoint.sh \
    && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/backend

ENV ENVIRONMENT=production \
    AUTO_CREATE_TABLES=false

EXPOSE 8000

# Chờ Postgres sẵn sàng → prisma migrate deploy → tsx src/main.ts.
#
# ⚠️ Vì sao chạy bằng `tsx` chứ không `node dist/main.js`: source import không có đuôi
# (`from './config'`) và `tsconfig.json` để `noEmit` + `moduleResolution: bundler` cho phép
# điều đó. Node ESM thuần **bắt buộc** có đuôi `.js` trong import, nên muốn chạy bản biên
# dịch thì phải sửa đuôi ở mọi file. `tsx` phân giải đúng như lúc dev — một runtime, không
# lệch hành vi. Lệnh `build` vì vậy là bước **typecheck**, không sinh `dist/`.
ENTRYPOINT ["./docker-entrypoint.sh"]
