# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Hướng dẫn cho AI agent làm việc trong repo này. Đọc trước khi sửa bất cứ thứ gì.
>
> ⚠️ File này **cố tình rất ngắn**: chỉ giữ những quy tắc mà vi phạm sẽ gây **mất dữ liệu người
> chơi** hoặc **trắng trang**. Mọi quy ước khác nằm trong `docs/` — **tra ở §0 trước khi sửa,
> đừng đoán.** Giữ file này ngắn khi thêm nội dung: nó được nạp lại ở mỗi phiên.
>
> Cập nhật lần cuối: **2026-10-17**.

## 0. Đọc gì ở đâu — tra trước khi sửa

| Cần biết | Đọc |
| --- | --- |
| Luồng dữ liệu · vòng đời bản lưu · hợp đồng API · luồng OAuth | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Quy ước viết UI** (React, state, Tailwind) · **quy tắc backend** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7–§8 |
| Luật chơi đã cài · thuật ngữ tiếng Việt · ánh xạ luật → file | [`docs/GAME-RULES.md`](docs/GAME-RULES.md) |
| Cách viết test · bẫy jsdom/router · **cách kiểm chứng UI an toàn** | [`docs/TESTING.md`](docs/TESTING.md) |
| Cân bằng 60 màn · số đo hiệu năng | [`docs/BALANCE.md`](docs/BALANCE.md) |
| Art: nguồn, giấy phép, quy tắc thêm ảnh | [`docs/ASSETS.md`](docs/ASSETS.md) |
| Google OAuth: lấy khoá, bảng lỗi | [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md) |
| Việc còn có thể làm | [`README.md`](README.md) |

## 1. Dự án

Auto-battler nuôi thú cưng chạy trong trình duyệt, lấy cảm hứng từ event **Martial Cutie
(武林萌主)** của *NARAKA: BLADEPOINT*.

🔴 **Chỉ tái hiện luật chơi từ mô tả công khai, tự viết lại.** ❌ Không sao chép mã nguồn, hình
ảnh, âm thanh, font hay văn bản của NetEase.

**pnpm workspace** hai gói: `frontend/` (React 19 · Vite 8 · TS 6 · TanStack Router + Query ·
Tailwind v4 · Zustand) và `backend/` (Fastify 5 · PostgreSQL · Prisma). Đăng nhập Google — ❌
Facebook đã bỏ, đừng thêm lại. `localStorage` là **nguồn chính** của tiến trình, máy chủ chỉ là bản
sao; **chơi ẩn danh khi không có backend phải luôn hoạt động đầy đủ**.

## 2. Lệnh — chạy ở gốc repo

```bash
pnpm install

pnpm dev                                                 # game: http://localhost:5190
pnpm build && pnpm test && pnpm lint                     # frontend

docker compose up -d db && pnpm db:migrate && pnpm dev:be # backend: cổng 8000
pnpm build:be && pnpm test:be                             # backend
```

✅ **Trước khi kết thúc phiên: cả bốn phải xanh** —
`pnpm build && pnpm test && pnpm lint && pnpm test:be`.

Ba chỗ dễ sập:

1. **Cổng 5190 là của container `fr`** (nginx) — đừng mở dev server khác ở đó, và xem §4.4 về
   việc mở trình duyệt vào cổng này.
2. **`pnpm build` chạy `vite build` TRƯỚC `tsc -b`** (cố ý): plugin TanStack Router sinh
   `routeTree.gen.ts` trong lúc Vite build. ❌ Đừng đảo lại thứ tự.
3. **`pnpm-workspace.yaml` phải giữ khối `allowBuilds`** — pnpm 11 chặn script cài đặt của
   Prisma/esbuild; thiếu là mọi `pnpm install`/`pnpm run` lỗi `ERR_PNPM_IGNORED_BUILDS`.
   Và `BE_PUBLIC_URL` quyết định redirect URI OAuth — đổi cổng thì đổi cả nó **và** Google Console.

## 3. Bố cục

```
frontend/src/  game/ (LÕI game, thuần logic) · api/ · store/ · routes/ (mỗi màn một file)
               components/ · test/ (helper cho test)
frontend/      public/icons/ (art) · Dockerfile + nginx.conf        → image `fr`
backend/src/   config · db · security · oauth · services · deps · errors · baseline
               app.ts (buildApp) · main.ts · routes/{auth,saves}.ts
backend/       prisma/ (schema + migrations) · tests/ · scripts/    → image `be`
```

## 4. Quy tắc then chốt

### 4.1 Tất định (`game/battle.ts`)

`simulateBattle()` phải cho kết quả y hệt với cùng seed.

❌ `Math.random()` (dùng `sim.rng`) · ❌ `Date.now()` / `performance.now()` trong `game/` ·
✅ **thứ tự duyệt mảng là một phần hợp đồng** (đổi thứ tự = đổi kết quả trận) · giữ test
`'is deterministic for a given seed'` xanh.

### 4.2 Phân lớp

Luật chơi nằm ở `game/`. Component **chỉ hiển thị + gọi action của store** — ❌ không tự tính sát
thương / merge / giá. `game/` ❌ không import React/router/query, không chạm DOM. Backend ❌ không
chứa luật chơi: chỉ xác thực danh tính và lưu/đọc `RunState` nguyên dạng JSON.

### 4.3 Điều hướng

✅ **URL là nguồn sự thật** — ❌ store không giữ `route` (từng có và hai nguồn lệch nhau). Thêm màn
hình = thêm file trong `frontend/src/routes/`; ❌ không sửa `routeTree.gen.ts` (máy sinh). SPA
fallback phải có ở **cả hai phía** — `frontend/nginx.conf` **và** plugin `spaFallback` trong
`vite.config.ts`; thiếu một trong hai thì F5 ở `/cua-hang` sẽ 404.

### 4.4 Đồng bộ bản lưu 🔴 đây là chỗ làm mất dữ liệu

Luật nằm ở `frontend/src/api/saveSync.ts` (`pushRun`/`pullRun`); revision sống trong cache TanStack
Query (`['save']`) — ❌ không dựng store thứ hai giữ nó.

- ❌ **Không nạp đè bản máy chủ khi xung đột.** Khi `PUT /api/me/save` trả **400
  `revision_conflict`**: phải `GET` revision mới → `PUT` lại **dữ liệu của mình** → thử lại **đúng
  một lần**. Nạp đè ⇒ mất thay đổi vừa làm *và* xung đột tiếp ở lần sau.
- ❌ **Không đẩy trong mỗi lần render** — `pushedRef` so `JSON.stringify(run)` + debounce 1,5 s.
  Thiếu guard ⇒ mỗi PUT thành công làm store đổi → effect chạy lại → **vòng lặp PUT vô tận** (đã
  xảy ra thật, log xen kẽ 200/400).
- `pullRun` ghi revision **TRƯỚC** khi ghi localStorage + `rehydrate`, và chỉ nạp bản máy chủ khi
  máy này **chưa có** tiến trình (`hasLocalRun()`).
- 🔴 **Không mở `http://localhost:5190` trong profile trình duyệt riêng khi `AUTO_LOGIN=true`.**
  Profile mới không có bản lưu ⇒ app tự đăng nhập tài khoản của người dùng ⇒ nạp bản máy chủ thất
  bại ⇒ **đẩy run rỗng lên, ghi đè bản lưu thật**. Việc này **đã xảy ra một lần**. Cách kiểm chứng
  an toàn: [`docs/TESTING.md`](docs/TESTING.md).
- 🔴 **Không thử API ghi bằng tài khoản thật** — `PUT /api/me/save` không khôi phục được.
- Phía backend, cùng loại rủi ro: **DB luôn được TIÊM VÀO** `buildApp({ db, config })` và test chạy
  trong **transaction rollback trên một database duy nhất**. ❌ Không dùng Prisma client ở phạm vi
  module (test sẽ không rollback được và **ghi vào DB thật**), ❌ không DB phụ, ❌ không SQLite,
  ❌ không `migrate reset`/`DROP`/truncate.

### 4.5 Bản lưu và chống trắng trang 🔴

Mọi `RunState` đọc từ bản lưu **phải** đi qua `sanitizeRun()` (`game/sanitize.ts`), gắn vào `merge`
của zustand persist — ❌ không dùng thẳng `persisted.run`.

Thiếu bước này: bản lưu khuyết trường ⇒ `render()` ném lỗi ⇒ React **không hiện gì cả** ⇒ trắng
trang, người chơi hết đường bấm. Thêm trường vào `RunState` = sanitize + bump `version` + `migrate`.
`AppErrorBoundary` bọc `App` trong `main.tsx` — ❌ không bao giờ để trắng trang.

## 5. Thêm tính năng — sửa ở đâu

| Muốn thêm | Sửa | Đừng quên |
| --- | --- | --- |
| **Vật phẩm** | `game/items.ts` | art `public/icons/items/<id>-<sao>.png`; `content.test.ts` đếm số lượng |
| **Thú cưng** | `game/pets.ts` | art `pets/` + `skills/`; `unlockStage` đang là 20/40 |
| **Màn / bản đồ** | `game/stages.ts` | chạy lại probe cân bằng ([`docs/BALANCE.md`](docs/BALANCE.md)) |
| **Hiệu ứng / hào khí** | `game/stats.ts` + `game/build.ts` | thêm nhánh ngẫu nhiên trong `battle.ts` thì phải thêm test tất định |
| **Màn hình** | file mới trong `src/routes/` | `routeTree.gen.ts` tự sinh; nhớ SPA fallback (§4.3) |
| **Hộp thoại / UI dùng chung** | `store/uiStore.ts` | ❌ không vào `gameStore` (nó bị persist) |
| **Trường trong `RunState`** | `types.ts` → `sanitize.ts` → bump `version` → `migrate.ts` | thiếu `sanitize` ⇒ **trắng trang** (§4.5) |
| **Endpoint API** | `backend/src/routes/` | lỗi qua `ApiError`; thêm test trong `backend/tests/` |
| **Bảng / cột DB** | `prisma/schema.prisma` + migration | migration phải chạy được trên database đang có bảng |

Luật chơi **không** được nằm trong component: `game/` trước, `gameStore` sau, UI cuối cùng.

## 6. Dọn dẹp

❌ Không để lại file tạm — đặt tiền tố `_` (`_preview.tsx`, `_balance.probe.test.ts`) rồi **xoá
trong cùng phiên**. ⚠️ Nếu sửa `.gitignore`: **đừng để quy tắc bắt đầu bằng `_` mà thiếu ngoại lệ**
— `_*` khớp cả `__tests__/` và `routes/__root.tsx`; chuyện này **đã xảy ra thật** (16 file test + 1
file route biến mất khỏi git, clone ra build đỏ). Kiểm bằng `git status --short --ignored`: chỉ được
thấy `.env`, `node_modules/`, `dist/`. ❌ Không commit `.env` thật; ⚠️ nhưng
`frontend/src/routeTree.gen.ts` thì **phải** commit — máy sinh, song `tsc` cần nó.
