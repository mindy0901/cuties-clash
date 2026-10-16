# Backend — Martial Cutie

API **Fastify 5 + Prisma** cho Đấu Trường Thú Cưng. Backend **không chứa luật chơi**: nó chỉ
xác thực danh tính (Google OAuth) và lưu/đọc `RunState` nguyên dạng JSON. Mọi tính toán trận
đấu nằm ở `frontend/src/game/`.

## Chạy

Từ **gốc repo** (đây là pnpm workspace):

```bash
pnpm install          # cài cả hai gói
docker compose up -d db
pnpm db:migrate       # prisma migrate deploy
pnpm dev:be           # http://localhost:8000 (tsx watch)
```

Trong Docker: `docker compose up --build` (image `be`, cổng 8000).

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `pnpm dev:be` | Chạy dev, tự nạp lại khi sửa (`tsx watch`) |
| `pnpm build:be` | `prisma generate` + `tsc --noEmit` (typecheck, không sinh `dist/`) |
| `pnpm test:be` | Vitest |
| `pnpm db:migrate` | `prisma migrate deploy` |

## Cấu hình

Đọc theo thứ tự `../.env` → `backend/.env` → biến môi trường (biến môi trường thắng).
Xem bảng đầy đủ ở [`.env.example`](../.env.example).

- `DATABASE_URL` — chấp nhận cả `postgresql://` lẫn `postgresql+psycopg://` (hậu tố driver bị bỏ).
- `JWT_SECRET` — **bắt buộc**, tối thiểu 32 ký tự. Sai thì app **không khởi động** (cố ý: khoá
  yếu nghĩa là token giả mạo được).
- `AUTO_CREATE_TABLES` — `true` (mặc định, tiện dev) thì lúc khởi động chạy baseline SQL
  idempotent trong `prisma/migrations/0_init/`. Docker đặt `false` và dùng `prisma migrate deploy`.

## Migration

`schema.prisma` là nguồn sự thật. Baseline `0_init` được **viết lại thành idempotent**
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) để chạy được trên database đã có
bảng từ thời Alembic — mọi câu lệnh ở đó là no-op, chỉ thêm bảng sổ sách `_prisma_migrations`.

⚠️ Khi đổi schema, sinh migration mới rồi **kiểm tra mắt** xem nó có vô tình `DROP` gì của
database đang chạy hay không.

## Kiểm thử

Test dùng **đúng `DATABASE_URL`** trong `.env` — nhưng **mỗi ca chạy trong `prisma.$transaction`
và luôn rollback** (ném sentinel ở cuối rồi bắt ở ngoài). Nhờ vậy không có database phụ, không
để lại dữ liệu, và không đụng vào bản lưu thật.

Điều kiện để việc đó hoạt động: **mọi truy cập DB phải đi qua `db` được tiêm vào**
`buildApp({ db, config })`. ❌ Không import `PrismaClient` ở phạm vi module.

Gọi mạng ra Google bị chặn: `tests/setup.ts` cài `fetch` **ném lỗi**, test OAuth thay bằng stub.

⚠️ Hệ quả cần biết: `users_id_seq` **không** rollback theo (sequence không có tính giao dịch),
nên mỗi lần chạy test dãy id lại tăng thêm. Không ảnh hưởng dữ liệu.

## Docker

`docker-entrypoint.sh`: chờ DB → `prisma migrate deploy` → `tsx src/main.ts`.

⚠️ Chạy bằng **`tsx`** chứ không `node dist/main.js`: source import không có đuôi
(`from './config'`) và Node ESM thuần bắt buộc phải có đuôi `.js`. Vì vậy `build` là bước
**typecheck**, không sinh `dist/`. Image dùng `node:22-slim` (Debian) vì Prisma cần libssl khớp
với binary engine — alpine/musl rất dễ vỡ.
