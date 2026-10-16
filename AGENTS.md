# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Hướng dẫn cho AI agent làm việc trong repo này. Đọc trước khi sửa bất cứ thứ gì.
> ⚠️ **Giữ file này NGẮN** — nó được nạp lại ở mỗi phiên. Chi tiết để trong `docs/`.
> Cập nhật lần cuối: **2026-10-17**.

## 0. Đọc gì ở đâu

| Cần biết | Đọc |
| --- | --- |
| Lệnh chạy · bất biến · công thức thêm tính năng | **file này** |
| Vì sao kiến trúc như vậy · luồng dữ liệu · vòng đời bản lưu · hợp đồng API · luồng OAuth | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Luật chơi đã cài + ánh xạ luật → file | [`docs/GAME-RULES.md`](docs/GAME-RULES.md) |
| Cách viết test · bẫy jsdom/router · kiểm chứng UI an toàn | [`docs/TESTING.md`](docs/TESTING.md) |
| Cân bằng 60 màn · số đo hiệu năng | [`docs/BALANCE.md`](docs/BALANCE.md) |
| Art (nguồn, giấy phép, alpha) · Google OAuth (khoá, lỗi) | [`docs/ASSETS.md`](docs/ASSETS.md) · [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md) |

## 1. Dự án là gì

Auto-battler nuôi thú cưng chạy trong trình duyệt, lấy cảm hứng từ event **Martial Cutie (武林萌主)**
của *NARAKA: BLADEPOINT*.

🔴 **Chỉ tái hiện luật chơi từ mô tả công khai, tự viết lại.** ❌ Không sao chép mã nguồn, hình ảnh,
âm thanh, font hay văn bản của NetEase. Art hiện tại là icon **CC0 của ORHstudio**; emoji luôn giữ
làm dự phòng. Tên vật phẩm/thú cưng và toàn bộ chữ là nội dung gốc tiếng Việt.

- **pnpm workspace**, hai gói: `frontend/` — React 19 · Vite 8 · TS 6 · TanStack Router + Query ·
  Tailwind v4 · Zustand · và `backend/` — Fastify 5 · PostgreSQL · Prisma.
- Đăng nhập: Google OAuth. ❌ Facebook/zing đã bỏ — đừng thêm lại nếu user không yêu cầu.
- **Nguyên tắc xuyên suốt:** `localStorage` là nguồn chính của tiến trình, máy chủ chỉ là bản sao.
  **Chơi ẩn danh khi không có backend phải luôn hoạt động đầy đủ.**

## 2. Lệnh — chạy ở **gốc repo**

```bash
pnpm install                                              # cài cả workspace

pnpm dev                                                  # game: http://localhost:5190
pnpm build && pnpm test && pnpm lint                      # frontend

docker compose up -d db && pnpm db:migrate && pnpm dev:be  # backend: cổng 8000
pnpm build:be && pnpm test:be                              # backend
```

✅ **Trước khi kết thúc phiên: cả bốn phải xanh** —
`pnpm build && pnpm test && pnpm lint && pnpm test:be`.

Bốn chỗ dễ sập:

1. **Cổng 5190 là của container `fr`** (nginx) — không mở dev server khác ở cổng đó.
2. **`pnpm build` chạy `vite build` TRƯỚC `tsc -b`** (cố ý): plugin TanStack Router sinh
   `routeTree.gen.ts` trong lúc Vite build. ❌ Đừng đảo lại thứ tự.
3. **`pnpm-workspace.yaml` phải giữ khối `allowBuilds`** — pnpm 11 chặn script cài đặt của
   Prisma/esbuild; thiếu là mọi `pnpm install`/`pnpm run` lỗi `ERR_PNPM_IGNORED_BUILDS`.
4. **`BE_PUBLIC_URL` quyết định redirect URI OAuth** — phải khớp Google Console. Đổi cổng frontend
   thì phải đổi cả `BE_PUBLIC_URL` **và** đăng ký lại URI.

## 3. Bố cục

```
frontend/src/  game/ (LÕI game, thuần logic) · api/ (client, queries, saveSync) · store/
               routes/ (mỗi màn hình một file) · components/ · test/ (helper cho test)
frontend/      public/icons/ (art) · Dockerfile + nginx.conf  → image `fr`
backend/src/   config · db · security · oauth · services · deps · errors · baseline
               app.ts (buildApp) · main.ts · routes/{auth,saves}.ts
backend/       prisma/ (schema + migrations) · tests/ · scripts/ · Dockerfile → image `be`
```

## 4. Bất biến — BẮT BUỘC

### 4.1 Tất định (`game/battle.ts`)

`simulateBattle()` phải cho kết quả y hệt với cùng seed.

❌ `Math.random()` (dùng `sim.rng`) · ❌ `Date.now()`/`performance.now()` trong `game/` ·
✅ **thứ tự duyệt mảng là một phần hợp đồng** (đổi thứ tự = đổi kết quả trận) · giữ test
`'is deterministic for a given seed'` xanh.

### 4.2 Tiếng Việt

Mọi chữ hiện cho người chơi, kể cả lỗi API, phải là tiếng Việt. Thuật ngữ cố định: Vũ khí · Hộ
giáp · Hồn Ngọc · Pháp Bảo · Đan Dược · Kiếm Thế · Chấn Đao · Trọng kích · Thú cưng · Màn · Bản đồ.

### 4.3 Phân lớp

Luật chơi nằm ở `game/`. Component **chỉ hiển thị + gọi action của store** — ❌ không tự tính sát
thương/merge/giá. `game/` ❌ không import React/router/query, không chạm DOM. Backend ❌ không chứa
luật chơi: chỉ xác thực danh tính và lưu/đọc `RunState` nguyên dạng JSON.

### 4.4 React & Tailwind

❌ Không `requestAnimationFrame` cho playback trận (tab nền bị throttle) — dùng `setInterval`,
`TICK_MS = 60`; playback tra `events[next].t <= elapsed`, ❌ không giả định index khớp thời gian.
`commitBattle()` chỉ trả thưởng **một lần** (`battle.committed`) — giữ guard. ❌ Không `setState`
trong render; ❌ không sửa `run` tại chỗ (mutation qua action của store).

Token ở `@theme` (`styles/app.css`), ❌ không rải mã hex trong component; dùng hằng class ở
`components/ui.ts`; ❌ **không ghép tên class động** kiểu `` `bg-cls-${value}` `` — Tailwind chỉ sinh
class có trong source, phải dùng bảng tra. ⚠️ Class sai **không** làm build đỏ, chỉ mất style →
cách kiểm ở [`docs/TESTING.md`](docs/TESTING.md).

### 4.5 Điều hướng

✅ **URL là nguồn sự thật** — ❌ store không giữ `route` (từng có và hai nguồn lệch nhau). Thêm màn
hình = thêm file trong `frontend/src/routes/`; ❌ không sửa `routeTree.gen.ts` (máy sinh). Hộp thoại
dùng chung ở `store/uiStore.ts` — ❌ không nhét vào `gameStore` (nó bị persist).

`__root.tsx` là khung chung + `<Outlet/>`; trong trận màn đấu **đè lên** `Outlet`; đường dẫn lạ →
`PrepScreen` (không trắng trang, không đổi URL). SPA fallback phải có ở **cả hai phía** —
`frontend/nginx.conf` **và** plugin `spaFallback` trong `vite.config.ts`; thiếu một trong hai thì F5
ở `/cua-hang` sẽ 404.

### 4.6 Đồng bộ bản lưu ⚠️ chỗ nguy hiểm nhất

Luật nằm ở `frontend/src/api/saveSync.ts` (`pushRun`/`pullRun`), tách khỏi React để test gọi thẳng.
Revision sống trong cache TanStack Query (`['save']`) — ❌ không dựng store thứ hai giữ nó.

- `PUT /api/me/save` là **optimistic concurrency**: gửi kèm `revision`; lệch → **400
  `revision_conflict`** và server **không** ghi gì. Revision mới lấy từ **response**.
- ❌ **Không nạp đè bản máy chủ khi xung đột** — phải `GET` revision mới → `PUT` lại **dữ liệu của
  mình** → thử lại **đúng một lần**. (Nạp đè ⇒ mất thay đổi vừa làm *và* xung đột tiếp.)
- ❌ **Không đẩy trong mỗi lần render** — `pushedRef` so `JSON.stringify(run)` + debounce 1,5 s.
  Thiếu guard ⇒ mỗi PUT thành công làm store đổi → effect chạy lại → **vòng lặp PUT vô tận** (đã
  xảy ra thật, log xen kẽ 200/400).
- `pullRun` ghi revision **TRƯỚC** khi ghi localStorage + `rehydrate`; và chỉ nạp bản máy chủ khi
  máy này **chưa có** tiến trình (`hasLocalRun()`).
- 🔴 **Không mở `http://localhost:5190` trong profile trình duyệt riêng khi `AUTO_LOGIN=true`.**
  Profile mới không có bản lưu ⇒ app tự đăng nhập tài khoản của người dùng ⇒ nạp bản máy chủ thất
  bại ⇒ **đẩy run rỗng lên, ghi đè bản lưu thật**. Việc này **đã xảy ra một lần**. Cách kiểm chứng
  an toàn: [`docs/TESTING.md`](docs/TESTING.md).
- 🔴 **Không thử API ghi bằng tài khoản thật** — `PUT /api/me/save` không khôi phục được.

### 4.7 Bản lưu & chống trắng trang

Mọi `RunState` đọc từ bản lưu **phải** đi qua `sanitizeRun()` (`game/sanitize.ts`), gắn vào `merge`
của persist — ❌ không dùng thẳng `persisted.run`. Thiếu bước này thì bản lưu khuyết trường làm
`render()` ném lỗi và React **không hiện gì cả** ⇒ trắng trang, người chơi hết đường bấm.

Thêm trường vào `RunState` = sanitize + bump `version` + `migrate`. Món trong `equipped` có `slot`
ngoài lưới hiện tại phải chuyển về `inventory` (để nguyên `slot: -1` thì món vô hình ở cả hai panel).
`AppErrorBoundary` bọc `App` trong `main.tsx` — ❌ không bao giờ để trắng trang.

### 4.8 Backend

Cấu hình qua `loadConfig()` (`../.env` → `backend/.env` → biến môi trường); `JWT_SECRET` yếu ⇒
**ném lỗi lúc khởi động**. Lỗi trả `{error, message}` **kèm header `X-Error-Code`**, đi qua **một**
`setErrorHandler`. Cookie httpOnly + `SameSite=Lax` (`COOKIE_SECURE=true` khi HTTPS). `state` OAuth
phải **ký + so sánh timing-safe**. Logout tăng `session_epoch` để thu hồi token cũ. Chỉ hỗ trợ
**Google** (`unknown_provider` cho provider khác); `AUTO_LOGIN` chỉ bật khi đã có đủ khoá.

- ✅ **DB luôn được TIÊM VÀO** `buildApp({ db, config })` — ❌ không dùng Prisma client ở phạm vi
  module, làm vậy test không rollback được và **sẽ ghi vào DB thật của người dùng**.
- Test chạy trong **transaction luôn rollback**, **một database duy nhất**: ❌ không DB phụ,
  ❌ không SQLite, ❌ không `migrate reset`/`DROP`/truncate.
- Đổi schema → sửa `prisma/schema.prisma` + migration mới, và migration phải **chạy được trên
  database đang có bảng** (baseline idempotent; `scripts/migrate.mjs` tự baseline khi thiếu lịch sử
  Prisma). ❌ Không sửa tay DB production.

### 4.9 Art

Chỉ khai đường dẫn khi **chắc chắn file có thật**; luôn giữ **emoji dự phòng** (`ArtIcon` tự lùi).
⚠️ Kiểm **kênh alpha thật** — pack ORHstudio ghi "transparent" nhưng nhiều file là ảnh đen đục
(alpha = 255) → món hiện thành khối đen. Nguồn **CC BY** phải có mục **Ghi công** trong game.
Chi tiết: [`docs/ASSETS.md`](docs/ASSETS.md).

## 5. Thêm tính năng — sửa ở đâu

| Muốn thêm | Sửa | Đừng quên |
| --- | --- | --- |
| **Vật phẩm** | `game/items.ts` | art `public/icons/items/<id>-<sao>.png`; `content.test.ts` đếm số lượng |
| **Thú cưng** | `game/pets.ts` | art `pets/` + `skills/`; `unlockStage` đang là 20/40 |
| **Màn / bản đồ** | `game/stages.ts` | chạy lại probe cân bằng |
| **Hiệu ứng / hào khí** | `game/stats.ts` + `game/build.ts` | thêm nhánh ngẫu nhiên trong `battle.ts` thì phải thêm test tất định |
| **Màn hình** | file mới trong `src/routes/` | `routeTree.gen.ts` tự sinh; nhớ SPA fallback (§4.5) |
| **Hộp thoại / UI dùng chung** | `store/uiStore.ts` | ❌ không vào `gameStore` (bị persist) |
| **Trường trong `RunState`** | `types.ts` → `sanitize.ts` → bump `version` → `migrate.ts` | thiếu `sanitize` ⇒ **trắng trang** (§4.7) |
| **Endpoint API** | `backend/src/routes/` | lỗi qua `ApiError`; thêm test trong `backend/tests/` |
| **Bảng / cột DB** | `prisma/schema.prisma` + migration | phải chạy được trên DB đang có (§4.8) |

Luật chơi **không** được nằm trong component: `game/` trước, `gameStore` sau, UI cuối cùng.

## 6. Kiểm thử

```bash
pnpm test        # frontend — jsdom cho UI, node cho lõi game
pnpm test:be     # backend — rollback, không để lại dữ liệu
```

⚠️ Test UI **phải** dùng `render()` của @testing-library, ❌ không `renderToString` (zustand v5 trả
state khởi tạo cho `getServerSnapshot`) — và `renderToString(<App/>)` cũng **không dùng được** với
router, nên phải dùng helper `frontend/src/test/router.tsx` (`renderInRouter` đồng bộ ·
`await renderApp`). ⚠️ Điều hướng là transition bất đồng bộ: `await screen.findByText(...)` **rồi
mới** kiểm `window.location.pathname`. ✅ Chạy test khi **không có backend** là trạng thái hợp lệ —
game phải vẫn chơi ẩn danh được. Chi tiết + 3 bẫy nữa: [`docs/TESTING.md`](docs/TESTING.md).

## 7. Dọn dẹp

❌ Không để lại file tạm — đặt tiền tố `_` (`_preview.tsx`, `_balance.probe.test.ts`,
`_verify-css.mjs`) rồi **xoá trong cùng phiên**.

⚠️ **Đừng để quy tắc ignore bắt đầu bằng `_` mà thiếu ngoại lệ.** `.gitignore` dùng `_*` cho file
tạm, nhưng `_*` khớp cả tên bắt đầu bằng **hai** gạch dưới: `__tests__/` và `routes/__root.tsx`.
Hậu quả **đã xảy ra thật**: 16 file test + 1 file route không có trong git, clone repo ra build đỏ.
Hai dòng `!**/__tests__/` và `!**/__root.tsx` là **bắt buộc**. Kiểm bằng
`git status --short --ignored` — chỉ được thấy `.env`, `node_modules/`, `dist/`.

❌ Không commit `.env` thật. ⚠️ Nhưng `frontend/src/routeTree.gen.ts` thì **phải** commit — máy
sinh, song `tsc` cần nó và thiếu nó thì build đầu trên máy sạch sẽ đỏ.
