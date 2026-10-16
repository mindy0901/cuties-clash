# Kiến trúc

> Vì sao hệ thống chia như hiện tại, dữ liệu chảy qua những đâu, và những chỗ đã từng hỏng.
> Quy tắc bắt buộc nằm ở [`../AGENTS.md`](../AGENTS.md) mục 4 — file này giải thích **lý do**.

## 1. Ba image, ba vai trò

```
        trình duyệt
             │  chỉ MỘT origin: http://localhost:5190
             ▼
    ┌────────────────┐        /api/*        ┌──────────────────┐
    │  fr (nginx)    │ ───────────────────► │  be (Fastify)    │
    │  dist/ của Vite│                      │  Fastify + Prisma│
    └────────────────┘                      └────────┬─────────┘
                                                     │
                                            ┌────────▼─────────┐
                                            │  db (Postgres)   │
                                            └──────────────────┘
```

| Image | Chứa gì | Vì sao tách |
| --- | --- | --- |
| `db` | PostgreSQL 17 | Dữ liệu bền, không phụ thuộc vòng đời app |
| `be` | Fastify + Prisma, **không** chứa frontend | Chỉ API; build độc lập với frontend |
| `fr` | nginx phục vụ `dist/` + proxy `/api` → `be` | **Nhờ proxy mà trình duyệt chỉ thấy một origin**: cookie phiên hoạt động bình thường và không cần CORS. Tách hẳn hai origin thì `SameSite` phức tạp hơn nhiều |

⚠️ `fr` và service `vite` (profile `dev`) **cùng dùng cổng 5190** → không chạy đồng thời.

**Điểm gọi lại OAuth** do `BE_PUBLIC_URL` quyết định (mặc định `http://localhost:5190`) vì đó là
địa chỉ **trình duyệt** dùng để mở game, và nó phải khớp URI đã đăng ký ở Google Console. Đổi
`FR_PORT` ⇒ đổi `BE_PUBLIC_URL` **và** đăng ký lại URI.

## 2. Phân lớp

```
game/          luật chơi thuần  ─── không React, không DOM, không router/query
                     ▲
store/         trạng thái chơi + hành động (zustand, persist localStorage)
                     ▲
components/    chỉ hiển thị + gọi action  ─── không tự tính sát thương/giá/merge
                     ▲
routes/        mỗi màn hình một file (TanStack Router)
```

**Vì sao chặt như vậy:** toàn bộ tính tất định của trận đấu nằm ở `game/battle.ts`. Nếu component
hoặc store tự tính toán, kết quả trận sẽ phụ thuộc thứ tự render và không tái lập được nữa.

**Backend không có luật chơi.** Nó chỉ xác thực danh tính và lưu/đọc JSON. Nhờ vậy game **chơi
ẩn danh được đầy đủ** khi không có backend — đây là yêu cầu, không phải tính năng phụ.

## 3. Trạng thái chơi nằm ở đâu

| Thứ | Sống ở đâu | Ghi chú |
| --- | --- | --- |
| Tiến trình chơi (`RunState`) | `localStorage['martial-cutie-save']` qua zustand persist | **Nguồn chính.** Máy chủ chỉ là bản sao |
| Trạng thái màn hình (route) | **URL** (TanStack Router) | ❌ Store không giữ `route` |
| Hộp thoại đang mở | `store/uiStore.ts` | ❌ Không vào `gameStore` — nó bị persist |
| Phiên đăng nhập, bản lưu máy chủ | cache TanStack Query | `['session']`, `['save']` |
| Trạng thái trận đang xem | `gameStore.battle` | Không persist |

**Ranh giới TanStack Query:** chỉ dữ liệu **đến từ máy chủ**. ❌ Không biến tiến trình chơi thành
cache của máy chủ — làm vậy là mất khả năng chơi ẩn danh.

## 4. Vòng đời bản lưu

```
mở game
  └─ zustand persist đọc localStorage ──► sanitizeRun()  (chống trắng trang)
  └─ TanStack Query gọi GET /api/auth/session
        ├─ lỗi  ──► chơi ẩn danh, KHÔNG chặn gì
        └─ ok & đã đăng nhập
              └─ máy CHƯA có tiến trình?  ──► pullRun(): GET /api/me/save
                    • ghi revision vào cache TRƯỚC
                    • ghi localStorage + rehydrate
              └─ máy ĐÃ có tiến trình      ──► giữ của người chơi (localStorage thắng)

người chơi đổi trang bị
  └─ gameStore đổi  ──► AuthSync: debounce 1,5 s
        └─ pushedRef so JSON.stringify(run)  (❌ thiếu guard ⇒ vòng lặp PUT vô tận)
              └─ pushRun(): PUT /api/me/save kèm revision đã biết
                    ├─ 400 revision_conflict ──► GET revision mới ──► PUT lại DỮ LIỆU CỦA MÌNH
                    │                             (đúng MỘT lần; ❌ không nạp đè bản máy chủ)
                    └─ ok ──► revision mới lấy từ RESPONSE, ghi vào cache
```

Chi tiết luật và các cạm bẫy: `AGENTS.md` §4.6. Bài học đã trả giá:

- **Vòng lặp PUT vô tận** — mỗi PUT thành công làm store đổi → effect chạy lại → PUT tiếp. Log
  xen kẽ 200/400. Chốt bằng `pushedRef` so nội dung, không so tham chiếu.
- **Nạp đè khi xung đột** — mất thay đổi vừa làm *và* gây xung đột ở lần đẩy sau.
- **Ghi revision sau khi ghi localStorage** — lần đẩy ngay sau dùng revision cũ ⇒ xung đột ngay.
- 🔴 **Ghi đè bản lưu thật khi kiểm chứng** — mở `localhost:5190` trong profile trình duyệt riêng
  lúc `AUTO_LOGIN=true`: profile mới không có bản lưu ⇒ app tự đăng nhập tài khoản người dùng ⇒
  nạp bản máy chủ thất bại ⇒ **đẩy run rỗng lên**. Đã xảy ra thật. Cách kiểm chứng an toàn:
  [`TESTING.md`](TESTING.md).

## 5. Hợp đồng API

Backend **không** được đổi những thứ dưới đây mà không sửa frontend cùng lúc.

| Method | Đường dẫn | Việc |
| --- | --- | --- |
| GET | `/api/auth/session` | `{authenticated, user, available_providers, auto_login}` |
| GET | `/api/auth/google/login` | 307 sang Google + cookie `state` đã ký |
| GET | `/api/auth/google/callback` | Đổi code → hồ sơ → phiên → 303 về game |
| POST | `/api/auth/logout` | Tăng `session_epoch` (thu hồi token cũ) + xoá cookie |
| GET | `/api/me` | Hồ sơ người dùng hiện tại |
| GET | `/api/me/save` | `{run, revision, updated_at}` |
| PUT | `/api/me/save` | Ghi bản lưu, kiểm `revision` (optimistic concurrency) |
| GET | `/api/health` | `{status, environment, providers}` |

Quy ước:

- Mọi lỗi: `{"error": "<mã>", "message": "<tiếng Việt>"}` **kèm header `X-Error-Code`**.
- Mã lỗi dùng ở frontend: `revision_conflict` · `save_too_large` · `unauthorized` ·
  `unknown_provider` · `provider_not_configured` · `not_found`.
- Đường dẫn `/api/*` không khớp route → **404 JSON**, ❌ không trả `index.html`.
- Trần bản lưu **200 000 byte** (`save_too_large`), trần body 4 MB.

⚠️ Khi backend còn là FastAPI thì có thêm `/api/docs` (Swagger). Fastify không có — muốn thêm lại
thì xem mục *Dự án còn có thể làm* trong [`../README.md`](../README.md).

## 6. Luồng đăng nhập

```
GET /api/auth/google/login
   → sinh `state` ngẫu nhiên, ký HMAC-SHA256, đặt cookie mc_oauth_state (path /api/auth, 10 phút)
   → 307 sang accounts.google.com

Google → GET /api/auth/google/callback?code&state
   → so `state` trên URL với cookie bằng so sánh timing-safe  (❌ không tin URL)
   → POST token (form-encoded, có `scope`) → GET userinfo
   → upsert user theo (provider, subject); nếu chưa có thì khớp theo email đã xác thực
   → ký JWT HS256 {sub, epoch, iat, exp, jti} → cookie mc_session (httpOnly, SameSite=Lax)
   → 303 về <postLoginUrl>/?login=ok
```

- Mọi lỗi trong callback đều phải **chuyển hướng về UI** kèm `?login=error&message=…` — người
  chơi không được nhìn thấy trang lỗi JSON.
- Đăng xuất tăng `session_epoch`; `currentUser`/`optionalUser` so epoch trong token với DB, nên
  token cũ chết ngay.
- `AUTO_LOGIN` chỉ bật khi **đã có khoá Google**, nếu không frontend sẽ chuyển hướng vào endpoint
  chắc chắn 503.

## 7. Backend: vì sao viết như hiện tại

- **DB được tiêm vào** `buildApp({ db, config })`: nhờ vậy test truyền vào client của một
  transaction rồi rollback — **một database duy nhất, không tạo DB phụ, không để lại dữ liệu**.
  ❌ Dùng Prisma client ở phạm vi module là phá vỡ tính chất này.
- **Baseline migration idempotent**: database đang chạy được tạo bởi Alembic thời còn Python. Prisma
  từ chối áp migration đầu tiên lên schema không rỗng (**P3005**), nên `scripts/migrate.mjs` tự
  `migrate resolve --applied 0_init` khi thấy bảng đã tồn tại mà chưa có `_prisma_migrations`.
  ⚠️ Phải chạy thật trong Docker mới lộ lỗi này.
- **Chạy bằng `tsx`, không `node dist/`**: source import không đuôi (`from './config'`) và Node ESM
  bắt buộc có đuôi `.js`. Vì vậy `build` là bước **typecheck**, không sinh `dist/`.
- **`node:22-slim` chứ không alpine**: Prisma tải binary engine theo libc/openssl.
- **Fastify trả 400 cho POST không body kèm `Content-Type: application/json`** — đúng thứ
  `frontend/src/api/client.ts` gửi cho logout. Có hook `onRequest` gỡ `content-type` khi request
  thực sự không có body để hành xử giống Starlette.
