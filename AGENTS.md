# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Hướng dẫn cho AI agent **và** người mới làm việc trong repo này. Đọc trước khi sửa bất cứ thứ gì.
> Cập nhật lần cuối: **2026-10-17**.
>
> ⚠️ **Giữ file này NGẮN.** Đây là thứ được đọc lại ở mỗi phiên làm việc. Chi tiết, lý do và
> nhật ký lỗi đẩy sang `docs/` — mục 0 có bảng tra.

---

## 0. Đọc gì ở đâu

| Cần biết | Đọc |
| --- | --- |
| Lệnh chạy, ranh giới không được vượt, công thức thêm tính năng | **file này** |
| Vì sao kiến trúc như vậy · luồng dữ liệu · bản lưu đi qua những đâu | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Luật chơi đã cài (nhập sao, giá, lưới, Chấn Đao, hào khí…) | [`docs/GAME-RULES.md`](docs/GAME-RULES.md) |
| Cách viết test · bẫy jsdom/router · quy trình kiểm chứng | [`docs/TESTING.md`](docs/TESTING.md) |
| Cân bằng 60 màn (win-rate) | [`docs/BALANCE.md`](docs/BALANCE.md) |
| Art: nguồn, giấy phép, cách thêm file | [`docs/ASSETS.md`](docs/ASSETS.md) |
| Khoá Google OAuth, bảng lỗi đăng nhập | [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md) |

## 1. Dự án là gì

Web game **auto-battler nuôi thú cưng** chạy trong trình duyệt, lấy cảm hứng từ event **Martial
Cutie (武林萌主)** của *NARAKA: BLADEPOINT*.

**Ràng buộc về nội dung (không thương lượng):** game chỉ **tái hiện luật chơi từ mô tả công
khai**, tự viết lại. ❌ Không sao chép mã nguồn, hình ảnh, âm thanh, font, văn bản hay tài nguyên
của NetEase. Art hiện tại là icon **CC0 của ORHstudio** ([`docs/ASSETS.md`](docs/ASSETS.md)); emoji
luôn giữ làm dự phòng. Tên vật phẩm/thú cưng và toàn bộ chữ là nội dung gốc tiếng Việt. Art thêm
mới phải là tự tạo hoặc có giấy phép rõ ràng.

| Thành phần | Công nghệ |
| --- | --- |
| Gói | **pnpm workspace**: `frontend/` + `backend/` |
| Frontend | React 19 · Vite 8 · TypeScript 6 · pnpm 11 |
| Điều hướng | **TanStack Router** — file-based, cây route sinh ra `frontend/src/routeTree.gen.ts` |
| Dữ liệu máy chủ | **TanStack Query** — ⚠️ **chỉ** cho API backend (mục 4.6) |
| State game | **Zustand** + persist `localStorage` |
| UI | **Tailwind CSS v4** — token ở `@theme` trong `frontend/src/styles/app.css` |
| Backend | **Fastify 5** (TypeScript, Node 22) · **PostgreSQL** · **Prisma** |
| Đăng nhập | Google OAuth 2.0 (Facebook/zing **đã bỏ** — đừng thêm lại nếu user không yêu cầu) |

**Nguyên tắc xuyên suốt:** `localStorage` là **nguồn chính** của tiến trình; đã đăng nhập thì
đồng bộ thêm lên máy chủ. **Chơi ẩn danh (không có backend) phải luôn hoạt động đầy đủ.**

## 2. Chạy & kiểm chứng

### Lệnh — chạy ở **gốc repo**

```bash
pnpm install          # cài cả workspace

# frontend
pnpm dev              # http://localhost:5190 (proxy /api → http://localhost:8000)
pnpm build            # vite build && tsc -b
pnpm test             # vitest run
pnpm lint             # oxlint, cả hai gói

# backend
pnpm dev:be           # Fastify cổng 8000 (tsx watch)
pnpm build:be         # prisma generate && tsc --noEmit
pnpm test:be          # vitest (dùng đúng DATABASE_URL, chạy trong transaction rollback)
pnpm db:migrate       # prisma migrate deploy
docker compose up -d db   # PostgreSQL cho dev
```

### ✅ Trước khi kết thúc phiên — cả bốn phải xanh

```bash
pnpm build && pnpm test && pnpm lint && pnpm test:be
```

### Docker — 3 image

| Image | Vai trò | Cổng |
| --- | --- | --- |
| `db` | PostgreSQL 17 | 5432 |
| `be` | Fastify + Prisma, **không** chứa frontend | 8000 |
| `fr` | nginx phục vụ bản build Vite + proxy `/api` → `be` | **5190** → 80 |

`docker compose up --build` dựng cả ba; `docker compose --profile dev up db be vite` để dev có hot
reload. ⚠️ **Không chạy `fr` và `vite` cùng lúc** — cả hai dùng cổng 5190.

### Bốn điều dễ sập nhất khi làm việc ở repo này

1. **Cổng 5190 là của `fr`.** Muốn mở dev server khác thì phải chọn cổng khác — nhưng xem cảnh
   báo ở mục 4.6 trước khi mở trình duyệt.
2. **`pnpm build` chạy `vite build` TRƯỚC `tsc -b`** (cố ý): plugin TanStack Router sinh
   `routeTree.gen.ts` trong lúc Vite build, nên `tsc` phải chạy sau. ❌ Đừng đảo lại thứ tự.
3. **`pnpm-workspace.yaml` phải giữ khối `allowBuilds`.** pnpm 11 chặn script cài đặt của
   Prisma/esbuild nếu không khai báo → mọi `pnpm install`/`pnpm run` lỗi `ERR_PNPM_IGNORED_BUILDS`.
4. **Điểm gọi lại OAuth do `BE_PUBLIC_URL` quyết định** (mặc định `http://localhost:5190`) — phải
   là địa chỉ **trình duyệt** dùng để mở game và phải khớp cái đã đăng ký ở Google Console. Đổi
   `FR_PORT` thì phải đổi `BE_PUBLIC_URL` **và** đăng ký lại URI.

## 3. Bố cục mã nguồn

```
frontend/
├─ src/game/        # LÕI GAME — thuần logic, không React, không DOM (mục 4.3)
│                   #   items · pets · stages · build · battle · bag · loadout
│                   #   economy · stats · rng · art · labels · sanitize · migrate · types
├─ src/api/         # client.ts (fetch + ApiError) · queries.ts (TanStack Query)
│                   # queryClient.ts · saveSync.ts (LUẬT đồng bộ — mục 4.6)
├─ src/store/       # gameStore.ts (chơi, persisted) · uiStore.ts (hộp thoại) · persistedSave.ts
├─ src/routes/      # MỖI MÀN HÌNH MỘT FILE: __root.tsx · index.tsx (/) · cua-hang.tsx (/cua-hang)
├─ src/router.tsx   # createRouter(routeTree)
├─ src/routeTree.gen.ts   # ⚠️ máy sinh ra — ❌ đừng sửa tay
├─ src/components/  # UI: chỉ hiển thị + gọi action của store
├─ src/test/        # helper render có router cho test
├─ public/icons/    # art (items · pets · skills · ui)
├─ Dockerfile       # image `fr`   ├─ nginx.conf   ← SPA fallback + proxy /api
└─ (index.html · vite.config.ts · tsconfig*.json · .oxlintrc.json)

backend/
├─ src/             # config · db · security · oauth · services · deps · errors · baseline
│                   # app.ts (buildApp) · main.ts · routes/{auth,saves}.ts
├─ prisma/          # schema.prisma · migrations/0_init (baseline idempotent)
├─ tests/           # vitest — mỗi test rollback, không để lại dữ liệu
├─ scripts/         # wait-for-db.mjs · migrate.mjs
├─ Dockerfile       # image `be`   └─ docker-entrypoint.sh
└─ README.md        # chi tiết backend
```

## 4. Bất biến — BẮT BUỘC

Các mục dưới đây là những chỗ **đã từng sai thật** hoặc sẽ làm hỏng dữ liệu người chơi. Vi phạm
một dòng nào cũng phải hỏi lại trước khi làm.

### 4.1 Tất định (`game/battle.ts`)

`simulateBattle()` **phải** cho kết quả y hệt với cùng seed.

- ❌ `Math.random()` — chỉ dùng `sim.rng` (đã seed).
- ❌ `Date.now()` / `performance.now()` ở bất kỳ đâu trong `game/`.
- ✅ **Thứ tự duyệt mảng** (`sides`, `weapons`, `statuses`) là một phần của hợp đồng: đổi thứ tự
  = đổi kết quả trận.
- ✅ Giữ test `'is deterministic for a given seed'` xanh; thêm nhánh ngẫu nhiên thì thêm test.

### 4.2 UI tiếng Việt

Mọi chữ hiện cho người chơi **phải là tiếng Việt**, kể cả thông báo lỗi API. Thuật ngữ cố định:
Vũ khí · Hộ giáp · Hồn Ngọc · Pháp Bảo · Đan Dược · Kiếm Thế · Chấn Đao · Trọng kích · Thú cưng ·
Màn · Bản đồ. ❌ Không lẫn tiếng Anh (trừ tên riêng như *Stormchant*, *Paw Tally*).

### 4.3 Phân lớp

- ✅ Mọi luật chơi nằm ở `frontend/src/game/`. Component React **chỉ hiển thị + gọi action của store**.
- ❌ Không tính sát thương / merge / giá cả trong component.
- ❌ `game/` **không được** import React, TanStack Router/Query, hay chạm DOM. Test lõi game chạy ở
  môi trường `node`.
- ✅ Backend **không** chứa luật chơi: chỉ xác thực danh tính và lưu/đọc `RunState` nguyên dạng
  JSON. ❌ Không validate sâu `RunState`, không tính trận ở server.

### 4.4 React & Tailwind

- ❌ **Không** dùng `requestAnimationFrame` cho playback trận — tab nền bị throttle. Dùng
  `setInterval` với `TICK_MS = 60`.
- ✅ Playback đi theo `elapsedRef` (thời gian mô phỏng) và tra `events[next].t <= elapsed`;
  ❌ không giả định index khớp thời gian.
- ✅ `commitBattle()` chỉ trả thưởng **một lần** (`battle.committed`). Giữ guard này.
- ✅ Không `setState` trong render — dùng `useEffect` (xem `BattleScreen`).
- ✅ Mutation qua action của store; ❌ không sửa `run` tại chỗ.
- ✅ Token màu/khoảng cách ở `@theme` trong `styles/app.css`; ❌ không rải mã hex trong component.
- ✅ Dùng hằng class chung ở `components/ui.ts` (`panelClass`, `btnClass`, `statClass`…).
- ❌ **Không ghép tên class động** kiểu `` `bg-cls-${value}` `` — Tailwind chỉ sinh class có trong
  source; phải dùng bảng tra (ví dụ `ITEM_BORDER_BY_CLASS`).
- ⚠️ Class sai **không** làm build đỏ, chỉ mất style → kiểm CSS thật
  ([`docs/TESTING.md`](docs/TESTING.md)).

### 4.5 Điều hướng (TanStack Router)

- ✅ **Đường dẫn URL là nguồn sự thật.** ❌ Store không giữ `route` (từng có `route` +
  `syncFromLocation` và hai nguồn đó lệch nhau).
- ✅ Thêm màn hình = **thêm một file trong `frontend/src/routes/`**. ❌ Không sửa
  `routeTree.gen.ts` — plugin sinh lại.
- ✅ `routes/__root.tsx` là khung chung (TopBar + hộp thoại + Toasts) và render `<Outlet/>`.
  Trong trận (`battle`/`result`) màn đấu **đè lên** `Outlet`.
- ✅ Trạng thái mở/đóng hộp thoại dùng chung nằm ở `store/uiStore.ts` (TopBar và ActionBar không
  còn chung component cha). ❌ Đừng nhét vào `gameStore` — nó bị persist.
- ✅ Đường dẫn lạ → `notFoundComponent` của root render `PrepScreen` (không trắng trang, không đổi URL).
- ✅ SPA fallback phải có ở **cả hai phía**: `frontend/nginx.conf` và plugin `spaFallback` trong
  `vite.config.ts`. Thiếu một trong hai thì F5 ở `/cua-hang` sẽ 404.
- ✅ Nút chưa có chức năng hiện ra để giữ bố cục nhưng bấm phải **báo** "sẽ có ở bản sau" — ❌ không im lặng.

### 4.6 Đồng bộ bản lưu ⚠️ chỗ nguy hiểm nhất

Luật nằm ở **`frontend/src/api/saveSync.ts`** (`pushRun` / `pullRun`) — thuần, tách khỏi React để
test gọi thẳng. `api/queries.ts` chỉ là lớp nối TanStack Query vào đó.

- ✅ `PUT /api/me/save` là **optimistic concurrency**: gửi kèm `revision` đã biết; lệch → **400
  `revision_conflict`**, và server **không** ghi gì. Revision mới lấy từ **response**.
- ✅ Revision sống trong **cache TanStack Query** (`['save']`, xem `revisionHolder()`).
  ❌ Không dựng store thứ hai giữ revision.
- ❌ **Không nạp đè bản máy chủ khi xung đột.** `pushRun` phải: `GET` revision mới → `PUT` lại
  **dữ liệu của mình** → thử lại **đúng một lần**. (Nạp đè ⇒ mất thay đổi vừa làm *và* xung đột tiếp.)
- ❌ **Không đẩy trong mỗi lần render.** `AuthSync` giữ `pushedRef` so `JSON.stringify(run)` +
  debounce 1,5 s. (Thiếu guard ⇒ mỗi PUT thành công làm store đổi → effect chạy lại → **vòng lặp
  PUT vô tận**; đã xảy ra thật, log xen kẽ 200/400.)
- ✅ `pullRun` ghi revision **TRƯỚC** khi ghi localStorage + `rehydrate` (ngược lại thì lần đẩy
  ngay sau dùng revision cũ ⇒ xung đột).
- ✅ Chỉ nạp bản máy chủ khi máy này **chưa có tiến trình** (`hasLocalRun()`); có tiến trình sẵn thì
  localStorage thắng.
- 🔴 **TUYỆT ĐỐI không mở `http://localhost:5190` trong profile trình duyệt riêng khi
  `AUTO_LOGIN=true`.** Profile mới không có `martial-cutie-save` → app tự đăng nhập tài khoản của
  người dùng → nạp bản máy chủ thất bại → **đẩy run rỗng lên, ghi đè bản lưu thật**. Việc này **đã
  xảy ra một lần**. Cách kiểm chứng an toàn: [`docs/TESTING.md`](docs/TESTING.md).
- 🔴 **Không thử API ghi bằng tài khoản thật.** `PUT /api/me/save` không khôi phục được.

### 4.7 Bản lưu và chống trắng trang

- ✅ Mọi `RunState` đọc từ bản lưu **phải** đi qua `sanitizeRun()` (`game/sanitize.ts`), gắn vào
  `merge` của zustand persist. ❌ Không dùng thẳng `persisted.run`.
- ⚠️ **Vì sao:** bản lưu thiếu `equipped` làm `run.equipped.filter(...)` ném lỗi, và `getPet(id lạ)`
  ném lỗi. Lỗi xảy ra lúc `createRoot().render()` nên React **không hiện gì cả** → trắng trang,
  người chơi hết đường bấm.
- ✅ Thêm trường vào `RunState` = thêm vào `sanitizeRun` **và** bump `version` + viết `migrate`.
- ✅ Món trong `equipped` có `slot` ngoài lưới hiện tại phải **chuyển về `inventory`**; để nguyên
  `slot: -1` thì món vô hình ở cả hai panel.
- ✅ `AppErrorBoundary` bọc `App` trong `main.tsx` — mọi lỗi render còn lại hiện màn hình khôi phục
  kèm nút xoá bản lưu. ❌ Không bao giờ để trắng trang.

### 4.8 Backend

- ✅ Cấu hình qua `loadConfig()` (`backend/src/config.ts`): `../.env` → `backend/.env` → biến môi
  trường. ❌ Không hardcode secret.
- ✅ **Fail-fast:** `JWT_SECRET` trùng giá trị mẫu hoặc ngắn hơn 32 ký tự → **ném lỗi lúc khởi
  động**, không để tới lúc người chơi đăng nhập mới hỏng.
- ✅ Endpoint cần đăng nhập dùng `currentUser`; cho phép ẩn danh dùng `optionalUser`.
- ✅ Mọi lỗi trả `{"error": "<mã>", "message": "<tiếng Việt>"}` **kèm header `X-Error-Code`**, đi
  qua **một** `setErrorHandler`.
- ✅ Cookie phiên httpOnly + `SameSite=Lax`; bật `COOKIE_SECURE=true` khi chạy HTTPS.
- ✅ `state` OAuth phải **ký + so sánh timing-safe** rồi đối chiếu cookie — ❌ không tin `state` trên URL.
- ✅ Đăng xuất tăng `users.session_epoch` để thu hồi token cũ; token mang epoch lệch là hết hiệu lực.
- ✅ **DB luôn được TIÊM VÀO** `buildApp({ db, config })`. ❌ Không dùng Prisma client ở phạm vi
  module — làm vậy test không rollback được và **sẽ ghi vào DB thật của người dùng**.
- ✅ Test backend chạy trong **transaction luôn rollback**. **Một database duy nhất**:
  ❌ không tạo DB phụ, ❌ không SQLite, ❌ không `migrate reset`/`DROP`/truncate.
- ✅ Đổi schema → sửa `prisma/schema.prisma` + sinh migration mới, và migration phải **chạy được
  trên database đang có bảng** (baseline idempotent `IF NOT EXISTS`; `scripts/migrate.mjs` tự
  baseline khi schema đã có bảng mà Prisma chưa có lịch sử). ❌ Không sửa tay DB production.
- ✅ Chỉ hỗ trợ **Google**: `/api/auth/<provider khác>/login` → **400 `unknown_provider`** (có test).
- ✅ `AUTO_LOGIN` chỉ có tác dụng khi đã cấu hình đủ khoá Google; cờ trả về frontend phải là
  `config.autoLogin && availableProviders.length > 0`. Cờ chống vòng lặp trong `sessionStorage`
  của `AuthSync` phải giữ.

### 4.9 Art

- ✅ Chỉ khai đường dẫn khi **chắc chắn file có thật** (`stars` trong `items.ts`, `art`/`skillArt`
  trong `pets.ts`). ❌ Không đoán tên file.
- ✅ Luôn giữ **emoji dự phòng** trong `icon`; `ArtIcon` tự lùi về emoji khi ảnh lỗi — nhờ vậy thêm
  art dần được mà không bao giờ có ô trống.
- ⚠️ **Kiểm tra ảnh mới có KÊNH ALPHA thật.** Pack ORHstudio ghi "transparent background" nhưng 31
  file là ảnh **đen đục** (alpha = 255) → món hiện thành khối đen. Đọc byte PNG (`colorType` phải
  là **6 = RGBA**); `game/__tests__/artAlpha.test.ts` canh việc này.
- ⚠️ Nguồn **CC BY** phải có mục **Ghi công** mở được từ menu. CC0 (ORHstudio, Kenney) không bắt
  buộc nhưng vẫn ghi nguồn trong [`docs/ASSETS.md`](docs/ASSETS.md).

## 5. Thêm tính năng — sửa ở đâu

| Muốn thêm | Sửa file | Đừng quên |
| --- | --- | --- |
| **Vật phẩm** | `game/items.ts` (template + `space` + `stars`) | art `public/icons/items/<id>-<sao>.png`; `game/__tests__/content.test.ts` đếm số lượng |
| **Thú cưng** | `game/pets.ts` (`art`, `skillArt`, `unlockStage`) | art `pets/` + `skills/`; ngưỡng mở khoá đang là màn 20/40 |
| **Màn / bản đồ** | `game/stages.ts` | chạy lại probe cân bằng ([`docs/BALANCE.md`](docs/BALANCE.md)) |
| **Hiệu ứng / hào khí mới** | `game/stats.ts` + `game/build.ts` | nếu thêm nhánh ngẫu nhiên trong `battle.ts` thì thêm test tất định |
| **Màn hình mới** | tạo file trong `src/routes/` | `routeTree.gen.ts` tự sinh; nhớ SPA fallback (mục 4.5) |
| **Hộp thoại / UI dùng chung** | `store/uiStore.ts` | ❌ không nhét vào `gameStore` (bị persist) |
| **Trường mới trong `RunState`** | `game/types.ts` → `game/sanitize.ts` → bump `version` → `game/migrate.ts` | thiếu `sanitize` ⇒ **trắng trang** (mục 4.7) |
| **Endpoint API** | `src/routes/*.ts` | lỗi qua `ApiError`; thêm test ở `backend/tests/` |
| **Bảng/cột DB** | `backend/prisma/schema.prisma` + migration | phải chạy được trên DB đang có (mục 4.8) |
| **Cơ chế chơi mới** | `game/` trước, `gameStore` sau, UI cuối cùng | luật chơi **không** được nằm trong component |

## 6. Kiểm thử

```bash
pnpm test        # frontend — 16 file, jsdom cho UI, node cho lõi game
pnpm test:be     # backend — mỗi test rollback, không để lại dữ liệu
```

Bẫy quan trọng (chi tiết + cách làm đúng: [`docs/TESTING.md`](docs/TESTING.md)):

- ⚠️ Test UI **phải** dùng `render()` của @testing-library, ❌ không `renderToString` (zustand v5
  trả state khởi tạo cho `getServerSnapshot`).
- ⚠️ Từ khi có router, `renderToString(<App/>)` **không dùng được nữa** — dùng helper ở
  `src/test/router.tsx`: `renderInRouter(ui)` (đồng bộ, chỉ cần `useNavigate`) và
  `await renderApp(path)` (router thật, dùng cho test điều hướng).
- ⚠️ Điều hướng là transition bất đồng bộ: `await screen.findByText(...)` **rồi mới** kiểm tra
  `window.location.pathname`.
- ⚠️ Test chạy khi **không có backend** là trạng thái hợp lệ — game phải vẫn chơi ẩn danh được.

## 7. Dọn dẹp

- ❌ Không để lại script/ảnh/file tạm. Đặt tiền tố `_` (`_preview.tsx`, `_balance.probe.test.ts`,
  `_verify-css.mjs`) rồi **xoá trong cùng phiên**.
- ✅ Cảnh báo sẽ kiểm: `*.probe.test.ts` · `_preview.tsx` · `preview.html` · `_shot-*.png` ·
  `*.dump` · `*.bak`.
- ⚠️ **Đừng để quy tắc ignore bắt đầu bằng `_` mà thiếu ngoại lệ.** `.gitignore` dùng `_*` cho
  file tạm, nhưng `_*` khớp cả tên bắt đầu bằng **hai** gạch dưới: `__tests__/` và
  `routes/__root.tsx`. Hậu quả **đã xảy ra thật**: 16 file test + 1 file route không có trong git,
  clone repo ra là build đỏ. Hai dòng `!**/__tests__/` và `!**/__root.tsx` là **bắt buộc**.
- ✅ Sau khi thêm/xoá file, kiểm bằng `git status --short --ignored` — **chỉ** được thấy `.env`,
  `node_modules/`, `dist/`. Thấy đường dẫn nào khác là ignore quá rộng.
- ❌ Không commit `.env` thật; chỉ commit `.env.example`.
- ⚠️ **`frontend/src/routeTree.gen.ts` thì NGƯỢC LẠI: phải commit.** Máy sinh, nhưng `tsc` cần nó và
  thiếu nó thì build đầu trên máy sạch sẽ đỏ.

## 8. Việc còn có thể làm (chưa có)

- Âm thanh / hiệu ứng đánh (hiện chỉ có animation `shake` + floater sát thương).
- Tooltip chi tiết cho vật phẩm (đang dùng `title`).
- Bảng xếp hạng PvP thật, hoặc seed đối thủ chia sẻ được giữa người chơi.
- Nhiều bộ thú cưng hơn; lọc/tìm đồ khi kho đã nhiều món.
- Đa ngôn ngữ (hiện hardcode tiếng Việt trong `items.ts`/`pets.ts`/component).
- Backend: refresh token OAuth, rate limit, dọn phiên hết hạn. Bảng `oauth_identities` đã sẵn sàng
  cho việc liên kết nhiều nhà cung cấp nhưng hiện chỉ dùng Google.
- `autoCodeSplitting` cho TanStack Router (bundle hiện ~422 KB · 134 KB gzip).
- Swagger/OpenAPI cho Fastify (`/api/docs` của FastAPI đã mất khi chuyển sang Fastify).
