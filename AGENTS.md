# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Hướng dẫn cho AI agent làm việc trong repo này. Đọc trước khi sửa bất cứ thứ gì.
> Cập nhật lần cuối: **2026-10-17**.

---

## 1. Dự án là gì

Web game **auto-battler nuôi thú cưng** chạy trong trình duyệt, lấy cảm hứng từ event **Martial Cutie (武林萌主)** của *NARAKA: BLADEPOINT*.

**Bắt buộc về nội dung:** toàn bộ game là **tái hiện luật chơi từ mô tả công khai**, tự viết lại. ❌ **Không** sao chép mã nguồn, hình ảnh, âm thanh, font, văn bản hay tài nguyên của NetEase. Art hiện tại là **icon CC0 của ORHstudio** (xem [`docs/ASSETS.md`](docs/ASSETS.md)); emoji vẫn giữ làm dự phòng. Tên vật phẩm/thú cưng/phần chữ đều là nội dung gốc tiếng Việt. Thêm art mới phải là art tự tạo hoặc có giấy phép rõ ràng.

- Thư mục: `E:\Code\martial-cutie` — **pnpm workspace** hai gói: `frontend/` và `backend/`
- Frontend: **React 19 + Vite 8 + TypeScript 6**, quản lý gói bằng **pnpm 11**
- Điều hướng: **TanStack Router** — file-based, cây route sinh vào `frontend/src/routeTree.gen.ts`
- Dữ liệu máy chủ: **TanStack Query** — ⚠️ **chỉ** cho API backend; trạng thái chơi vẫn là zustand (§5.6)
- UI: **Tailwind CSS v4** (plugin `@tailwindcss/vite`). Design token khai báo bằng `@theme` trong `frontend/src/styles/app.css`. ❌ **Không** viết lại CSS thuần kiểu cũ — dùng utility của Tailwind; chỉ thêm `@utility` khi thật sự không diễn đạt được.
- Backend: **Fastify 5 (TypeScript, Node 22)** + **PostgreSQL** qua **Prisma** trong `backend/`
- Đăng nhập: **OAuth 2.0 Google** (Facebook đã bị bỏ — đừng thêm lại nếu user không yêu cầu), phiên bằng cookie JWT httpOnly
- Trạng thái chơi: `localStorage` (`martial-cutie-save`) là **nguồn chính**; khi đã đăng nhập thì đồng bộ thêm lên server. **Chơi ẩn danh vẫn phải hoạt động đầy đủ.**

## 2. Lệnh thường dùng

### Frontend (chạy ở gốc repo)

```bash
pnpm dev        # dev server tại http://localhost:5190 (proxy /api → http://localhost:8000)
pnpm build      # vite build && tsc -b   ← PHẢI pass trước khi kết thúc
pnpm test       # vitest run             ← PHẢI pass trước khi kết thúc
pnpm lint       # oxlint (cả hai gói)    ← PHẢI pass trước khi kết thúc
```

⚠️ **Vì sao `build` chạy `vite build` TRƯỚC `tsc -b`:** plugin TanStack Router sinh
`src/routeTree.gen.ts` trong lúc Vite build. Chạy `tsc -b` trước thì lần build đầu trên máy
sạch sẽ đỏ vì thiếu file đó. Đổi lại: `dist/` có thể được ghi dù typecheck đỏ — mã thoát của
lệnh vẫn tính cả hai.

### Backend (chạy ở gốc repo hoặc trong `backend/`)

```bash
pnpm install                    # cài cả workspace (chạy ở gốc)
docker compose up -d db         # PostgreSQL cho dev
pnpm db:migrate                 # prisma migrate deploy
pnpm dev:be                     # Fastify, cổng 8000 (tsx watch)
pnpm test:be                    # vitest — dùng đúng DATABASE_URL, chạy trong transaction rollback
pnpm build:be                   # prisma generate && tsc --noEmit
```

### Docker — 3 image riêng biệt

| Image | Vai trò | Dockerfile | Cổng |
| --- | --- | --- | --- |
| `db` | PostgreSQL 17 | (image chính thức) | 5432 |
| `be` | Fastify + Prisma, **không** chứa frontend | `backend/Dockerfile` | 8000 |
| `fr` | nginx phục vụ bản build Vite + proxy `/api` → `be` | `frontend/Dockerfile` + `frontend/nginx.conf` | 5190 → 80 |

```bash
docker compose up --build          # cả 3 image → mở http://localhost:5190
docker compose up -d db            # chỉ database, cho dev chạy trực tiếp trên máy
docker compose --profile dev up db be vite   # dev trong Docker (hot reload)
```

⚠️ **Không chạy `fr` và `vite` cùng lúc** — cả hai đều dùng cổng 5190. Khi dùng profile `dev`, chạy `db be vite` (đừng gọi `fr`).

**Vì sao có `fr` (nginx) mà không nhúng frontend vào `be`:** nhờ proxy, trình duyệt chỉ thấy **một origin** (5190) → cookie phiên hoạt động đúng và không cần CORS. Nếu tách hẳn hai origin, cookie `SameSite` sẽ phức tạp hơn nhiều.

⚠️ **Điểm gọi lại OAuth do `BE_PUBLIC_URL` quyết định**, mặc định `http://localhost:5190` — phải là địa chỉ mà **trình duyệt** dùng để mở game, và phải khớp cái đã đăng ký ở Google Console. Đổi `FR_PORT` thì phải đổi `BE_PUBLIC_URL` và đăng ký lại URI.

⚠️ **Cổng dev là 5190** (đã set trong `vite.config.ts`), không phải 5173 — project khác trên máy dùng 5173.

## 3. Kiến trúc

```
├─ frontend/                   # GÓI `frontend`
│  ├─ src/game/                # Lõi game THUẦN LOGIC — không import React, không chạm DOM
│  │  ├─ types.ts              # Toàn bộ kiểu domain (ItemTemplate, Combatant, BattleEvent, RunState…)
│  │  ├─ rng.ts                # mulberry32 + hashString/makeUid (tất định)
│  │  ├─ stats.ts              # StatKey, StatMods → StatSheet, nhãn tiếng Việt, powerScore
│  │  ├─ items.ts              # 24 template × 4★; pick(star, [1★..4★]); CLASS_LABELS
│  │  ├─ pets.ts               # 3 thú cưng × 5 cấp; GRID_WIDTH=4, hàng 3→5; petLevelStats(); petUpgradeCost()
│  │  ├─ stages.ts             # 60 màn / 3 bản đồ; getStage(); stageTier(); makeRivalBlueprint()
│  │  ├─ build.ts              # buildCombatant() — gộp passive + hào khí liền kề → Combatant
│  │  ├─ battle.ts             # simulateBattle() — mô phỏng tất định, trả BattleResult{events}
│  │  ├─ bag.ts                # Lưới nhiều ô: fitsIn(), resolveDrop(), rotateItem(), planAutoArrange()
│  │  ├─ loadout.ts            # Tách trang bị / kho: acquireItem(), equipFromInventory(), unequipToInventory()
│  │  ├─ migrate.ts            # migrateV1ToV2() — bản lưu cũ `run.items` → `equipped` + `inventory`
│  │  ├─ sanitize.ts           # sanitizeRun() — chuẩn hoá bản lưu hỏng, chống trắng trang
│  │  ├─ art.ts                # Tra đường dẫn art trong public/icons/ (có thì dùng, không thì emoji)
│  │  ├─ economy.ts            # rollShop(), SHOP_SIZE, REROLL_COST, STARTING_CURRENCY
│  │  └─ labels.ts             # STATUS_TEXT / STATUS_ICON
│  ├─ src/api/                 # NÓI CHUYỆN VỚI BACKEND
│  │  ├─ client.ts             # fetch thuần (credentials: 'include') + lớp ApiError
│  │  ├─ queries.ts            # TanStack Query: useSession / usePushRun / usePullRemoteSave / useLogout
│  │  ├─ queryClient.ts        # createQueryClient() — retry:false để chơi ẩn danh được ngay
│  │  └─ saveSync.ts           # pushRun()/pullRun() — LUẬT đồng bộ, tách khỏi React (§5.6)
│  ├─ src/store/
│  │  ├─ gameStore.ts          # Zustand + persist('martial-cutie-save') — luật chơi/tiến trình
│  │  ├─ persistedSave.ts      # hasLocalRun()/writeLocalRun() — truy cập localStorage của bản lưu
│  │  └─ uiStore.ts            # Zustand — hộp thoại bản đồ/đăng nhập (TopBar ↔ ActionBar)
│  ├─ src/router.tsx           # createRouter(routeTree)
│  ├─ src/routeTree.gen.ts     # ⚠️ MÁY SINH RA — ❌ đừng sửa tay (xem §5.7)
│  ├─ src/routes/              # MỖI MÀN HÌNH MỘT FILE
│  │  ├─ __root.tsx            # khung chung: TopBar + hộp thoại + Toasts; màn đấu đè lên Outlet
│  │  ├─ index.tsx             # phòng chuẩn bị — `/`
│  │  └─ cua-hang.tsx          # cửa hàng — `/cua-hang`
│  ├─ src/components/          # UI: mỗi component chỉ hiển thị + gọi action của store
│  │  ├─ ui.ts                 # Chuỗi class Tailwind dùng chung + hằng số
│  │  ├─ AppErrorBoundary.tsx  # Lá chắn lỗi: hiện màn hình khôi phục thay vì trắng trang
│  │  ├─ useHeldItem.ts        # Nhấc/đặt đồ (kéo-thả hoặc bấm–bấm) + phím R/Esc
│  │  ├─ HeldGhost.tsx         # Ảnh món bám theo con trỏ khi đang nhấc
│  │  ├─ GridBoard.tsx         # Khung lưới DÙNG CHUNG cho Trang bị + Kho đồ (ô, gợi ý, kéo/bấm)
│  │  ├─ LoadoutGrid.tsx       # Lớp mỏng trên GridBoard, thêm nút ⟳ / ✕ cho trang bị
│  │  ├─ InventoryGrid.tsx     # Lớp mỏng trên GridBoard, xếp món tuần tự cho kho
│  │  ├─ ItemIcon.tsx          # ItemIcon / PetIcon / SkillIcon
│  │  ├─ InventoryPanel.tsx    # KHO ĐỒ: dự trữ không giới hạn, danh sách cuộn
│  │  ├─ AuthSync.tsx          # Cầu nối game ↔ backend (nạp bản máy chủ, đẩy bản lưu)
│  │  ├─ ShopScreen.tsx        # TRANG cửa hàng riêng (đường dẫn /cua-hang)
│  │  ├─ ActionBar.tsx         # Thanh nút đáy phòng chuẩn bị
│  │  ├─ PetLoadoutPanel.tsx   # TRANG BỊ (đồ đang mang) + nút "Mua Vật Phẩm »"
│  │  ├─ LoginDialog.tsx, AccountChip.tsx, ProviderIcon.tsx
│  │  └─ TopBar, PrepScreen, PetPanel, BattleScreen,
│  │     ResultDialog, StageMapDialog, VictoryScreen, Toasts
│  ├─ src/styles/app.css       # @import tailwindcss + @theme (token) + @utility riêng
│  ├─ src/test/router.tsx      # renderApp()/renderInRouter() — helper render có router (§6)
│  ├─ index.html, vite.config.ts, tsconfig*.json, .oxlintrc.json
│  ├─ Dockerfile               # image `fr` (ngữ cảnh build = gốc repo)
│  └─ nginx.conf               # SPA fallback + proxy /api → be:8000
└─ backend/                    # GÓI `backend`
   ├─ src/
   │  ├─ config.ts             # Đọc .env (../.env → backend/.env) + kiểm tra JWT_SECRET khi khởi động
   │  ├─ db.ts                 # Prisma client + kiểu `Db` (client thật HOẶC transaction client)
   │  ├─ security.ts           # JWT phiên, cookie, ký `state` chống CSRF
   │  ├─ oauth.ts              # Luồng authorization code Google (fetch)
   │  ├─ services.ts           # Liên kết tài khoản, đọc/ghi bản lưu
   │  ├─ deps.ts               # currentUser / optionalUser
   │  ├─ errors.ts             # ApiError — mã lỗi + thông báo tiếng Việt + header X-Error-Code
   │  ├─ routes/auth.ts        # /api/auth/*
   │  ├─ routes/saves.ts       # /api/me, /api/me/save
   │  ├─ app.ts                # buildApp({ db, config }) — nhận db TIÊM VÀO (để test rollback được)
   │  └─ main.ts               # Tạo Prisma client thật rồi listen 8000
   ├─ prisma/
   │  ├─ schema.prisma         # users, oauth_identities, game_saves (tên bảng/cột snake_case)
   │  └─ migrations/0_init/    # SQL baseline — ⚠️ idempotent (IF NOT EXISTS) để chạy trên DB đang có
   ├─ tests/                   # vitest — mỗi test chạy trong transaction LUÔN ROLLBACK
   ├─ Dockerfile               # image `be` (ngữ cảnh build = gốc repo)
   └─ docker-entrypoint.sh     # chờ DB → prisma migrate deploy → tsx src/main.ts
```

**Nguyên tắc phân lớp — BẮT BUỘC:**

- ✅ Mọi luật chơi nằm trong `frontend/src/game/`. Component React **chỉ hiển thị + gọi action của store**.
- ❌ Không tính toán sát thương / merge / giá cả trong component.
- ✅ Thêm vật phẩm = sửa **`items.ts`** (không cần đụng UI). Thêm màn/thú = sửa `stages.ts`/`pets.ts`.
- ✅ Backend **không** chứa luật chơi. Nó chỉ xác thực danh tính và lưu/đọc `RunState` nguyên dạng JSON. ❌ Không validate sâu `RunState`, không tính toán trận đấu ở server.
- ✅ `frontend/src/game/` **không được** import React, TanStack Router/Query, hay chạm DOM. Test lõi game chạy ở môi trường `node`.

## 4. Luật chơi đã cài (đừng phá)

| Cơ chế         | Chi tiết                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Nhập sao       | 2 món **cùng template + cùng sao** → `+1★`, tối đa **4★**. Khác nhau thì **hoán đổi vị trí**.    |
| Giá            | `starPrice(cost, star) = cost × star`. Bán lại = **50%** của `paid` (tổng thực trả).             |
| Kho đồ         | **Trang bị** (đồ đang mang) là lưới **4 cột**, số hàng theo cấp thú: 3→5 (12–20 ô). **Kho đồ** (dự trữ) **không giới hạn**, không phải lưới. |
| Món ở đâu      | Mua ở cửa hàng → **tự mang lên trang bị nếu còn chỗ**, hết chỗ thì vào kho. ❌ **Chỉ đồ trong `run.equipped` mới tham chiến** (passive, hào khí, vũ khí); đồ trong `run.inventory` không có hiệu lực. |
| Chuyển đồ      | **Kéo-thả** giữa hai bảng, hoặc **bấm** món rồi **bấm** ô. `R` / chuột phải để xoay khi đang cầm, `Esc` để bỏ. Vẫn giữ các nút ↑ / ↓ / "Tháo hết". |
| Hình dạng món  | Mỗi template có `space: {w,h}`; món chiếm một **hình chữ nhật ô** (kiếm 1×3, đại đao 2×3, thân đao 1×4, ngọc/đan 1×1). Xem `items.ts`. |
| Xoay           | Phím `R`, chuột phải, hoặc nút ⟳ → xoay 90°, hoán đổi `w`/`h`. ❌ Chỉ đổi khi hướng mới **vừa chỗ**. |
| Va chạm        | `fitsIn(slot, size, …)` là **vị từ lõi** cho mọi thao tác. Biên lưới kiểm theo **ô neo**, không theo danh sách ô suy ra (món có thể tràn dòng). |
| Ô neo khi đặt  | Ô con trỏ có thể không phải ô neo hợp lệ (ô 5 cho món 4×1 trong lưới 4 cột). **Luôn đi qua `anchorFor()`** trước khi vẽ gợi ý **và** trước khi đặt — dùng chung một hàm để hai bên không lệch. ❌ Không gọi thẳng `cellsOf(hoverSlot, …)`. |
| Mua khi hết chỗ| Trang bị không còn vùng vừa → món vào **kho** (`slot = -1`), bấm để mang lên sau.                |
| Kiếm Thế (SE)  | Hồi `seRegen`/giây, **+4 khi bị đánh**.                                                          |
| Chấn Đao       | Tốn **65 SE** (`COUNTER_COST`), phá đòn → phản kích `referenceAtk × counterPower`, đẩy lùi 350 ms.|
| Trọng kích     | Tốn **24–40 SE** (theo tốc độ vũ khí), sát thương **×2.2**. Bạo kích **×1.8**.                   |
| Liền kề        | Hào khí tính từ **mọi ô** của món (`adjacentUids`), không chỉ ô neo. `aura.target`: `adjacent` / `adjacentWeapon` / `adjacentNonWeapon` / `all`. |
| Tiến trình     | Qua màn → `clearedStage = max(clearedStage, stage)`, `stage + 1` (chặn ở 60). Thú mở khoá ở màn **20 / 40**. |
| PvP            | `makeRivalBlueprint(power, stage, seed)` — **không** đổi `stage`/`clearedStage`.                  |

## 5. Quy tắc kỹ thuật — BẮT BUỘC

### 5.1 Tất định (determinism)

`simulateBattle()` **phải** cho kết quả giống hệt với cùng seed. Khi sửa `battle.ts`:

- ❌ Không dùng `Math.random()` — luôn dùng `sim.rng` (đã seed).
- ❌ Không dùng `Date.now()` / `performance.now()` trong `frontend/src/game/`.
- ✅ Thứ tự duyệt mảng (`sides`, `weapons`, `statuses`) là một phần của hợp đồng — đổi thứ tự = đổi kết quả trận.
- ✅ Giữ test `'is deterministic for a given seed'` xanh; thêm test mới nếu thêm nhánh ngẫu nhiên.

### 5.2 UI tiếng Việt

Mọi chữ hiển thị cho người dùng **phải là tiếng Việt** (thuật ngữ: Vũ khí, Hộ giáp, Hồn Ngọc, Pháp Bảo, Đan Dược, Kiếm Thế, Chấn Đao, Trọng kích, Thú cưng, Màn, Bản đồ). ❌ Không để lẫn tiếng Anh trong UI (trừ tên riêng như *Stormchant*, *Paw Tally*). Thông báo lỗi API cũng bằng tiếng Việt.

### 5.3 React

- ❌ Không dùng `requestAnimationFrame` cho playback battle — headless/background tab bị throttle → phải dùng `setInterval` (`TICK_MS = 60`).
- ✅ Playback đi theo `elapsedRef` (thời gian mô phỏng) và tra `events[next].t <= elapsed`; **không** giả định index khớp thời gian.
- ✅ `commitBattle()` **chỉ trả thưởng một lần** (`battle.committed`). Giữ guard này.
- ✅ Không `setState` trực tiếp trong render; dùng `useEffect` (xem `BattleScreen`).
- ✅ Store là Zustand; mutation phải qua action, không sửa `run` tại chỗ.

### 5.4 Tailwind

- ✅ Token màu/khoảng cách khai báo một chỗ: `@theme` trong `src/styles/app.css`. ❌ Không rải mã màu hex trong component.
- ✅ Dùng hằng chuỗi class chung ở `frontend/src/components/ui.ts` (`panelClass`, `btnClass`, `statClass`…) thay vì lặp lại.
- ❌ **Không ghép tên class động** kiểu `` `bg-cls-${value}` `` — Tailwind chỉ sinh class có trong source. Phải dùng bảng tra như `ITEM_BORDER_BY_CLASS`.
- ⚠️ Class viết sai **không** làm build đỏ, chỉ mất style. Khi đổi giao diện, kiểm tra CSS thật trong `frontend/dist/assets/*.css` (xem mục 7).

### 5.5 Backend

- ✅ Mọi cấu hình qua `loadConfig()` (`backend/src/config.ts`), đọc `../.env` → `backend/.env` → biến môi trường. ❌ Không hardcode secret.
- ✅ **Fail-fast:** `JWT_SECRET` trùng giá trị mẫu hoặc ngắn hơn 32 ký tự → **ném lỗi lúc khởi động**, không để tới lúc người chơi đăng nhập mới hỏng.
- ✅ Endpoint cần đăng nhập dùng `currentUser`; endpoint cho phép ẩn danh dùng `optionalUser` (`backend/src/deps.ts`).
- ✅ Lỗi trả về dạng `{"error": "<mã>", "message": "<tiếng Việt>"}` **kèm header `X-Error-Code`**, tất cả đi qua một `setErrorHandler` duy nhất.
- ✅ Cookie phiên là **httpOnly + SameSite=Lax**. Khi triển khai HTTPS phải đặt `COOKIE_SECURE=true`.
- ✅ `state` của OAuth phải được **ký và so sánh timing-safe**, rồi đối chiếu với cookie (`security.verifyState`) — ❌ không tin tham số `state` trên URL.
- ✅ Đăng xuất tăng `users.session_epoch` để **thu hồi token cũ**; token mang epoch lệch bị coi là hết hiệu lực.
- ✅ **DB luôn được TIÊM VÀO** `buildApp({ db, config })`. ❌ Không dùng Prisma client ở phạm vi module — làm vậy test không thể rollback và sẽ ghi vào DB thật của người dùng.
- ✅ Test backend chạy trong **transaction luôn rollback** (`prisma.$transaction` + ném sentinel ở cuối). **Một database duy nhất** — ❌ không tạo DB phụ, ❌ không dùng SQLite, ❌ không `migrate reset`/`DROP`.
- ✅ Đổi schema → sửa `prisma/schema.prisma` rồi sinh migration mới. ❌ Không sửa tay DB production. Migration baseline phải **idempotent** (`IF NOT EXISTS`) vì DB đang chạy đã có sẵn các bảng đó.
- ✅ Chỉ hỗ trợ **Google**. `/api/auth/<provider khác>/login` phải trả **400 `unknown_provider`** (có test). ❌ Không thêm nhà cung cấp mới khi user chưa yêu cầu.
- ✅ `AUTO_LOGIN` (mặc định false) chỉ có tác dụng khi đã cấu hình đủ khoá Google — cờ trả về frontend phải là `config.autoLogin && availableProviders.length > 0`. Frontend có cờ chống vòng lặp trong `sessionStorage`; giữ nó.
- 📖 Khi user hỏi về khoá OAuth hoặc gặp lỗi đăng nhập: xem [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md) (hướng dẫn lấy client id/secret + bảng lỗi thường gặp). Giữ tài liệu này khớp với `backend/src/oauth.ts` khi đổi endpoint.

### 5.6 Đồng bộ bản lưu (đã từng sai, đừng lặp lại)

- ✅ `PUT /api/me/save` dùng **optimistic concurrency**: body gửi kèm `revision` đã biết; lệch → **400 `revision_conflict`**. Mỗi lần ghi thành công server tăng revision, client phải lấy revision từ **response**.
- ✅ Luật đồng bộ nằm ở **`frontend/src/api/saveSync.ts`** (`pushRun` / `pullRun`) — thuần, **tách khỏi React** để test gọi thẳng. `frontend/src/api/queries.ts` chỉ là lớp nối TanStack Query vào đó.
- ✅ Revision sống trong **cache của TanStack Query** (`['save']`), xem `revisionHolder()` trong `queries.ts`. ❌ Không lưu revision trong một store thứ hai — hai nguồn sẽ lệch.
- ❌ **Không nạp đè bản máy chủ khi xung đột.** `pushRun` khi gặp xung đột phải: `GET` lấy revision mới → `PUT` lại **dữ liệu của mình** → chỉ thử lại **một lần** (và lỗi khác `revision_conflict` thì **không** thử lại).
- ❌ **Không đẩy lên trong mỗi lần render.** `AuthSync` giữ `pushedRef` so sánh `JSON.stringify(run)`; thiếu guard này thì mỗi PUT thành công làm store đổi → effect chạy lại → **vòng lặp PUT vô tận** (đã xảy ra thật, log xen kẽ 200/400).
- ✅ `pullRun` phải gọi `revision.set()` **trước** khi ghi localStorage + `rehydrate`, nếu không lần đẩy ngay sau đó dùng revision cũ → xung đột.
- ✅ Chỉ nạp bản máy chủ khi máy này **chưa có tiến trình** (`AuthSync` kiểm tra `hasLocalRun()` trong `store/persistedSave.ts`). Có tiến trình sẵn thì localStorage thắng — tránh mất tiến trình đang chơi.
- ⚠️ **Khi thử nghiệm API ghi, TUYỆT ĐỐI không dùng tài khoản thật của người dùng.** `PUT /api/me/save` ghi đè bản lưu thật và không khôi phục được. Dùng tài khoản tạm trong DB, hoặc chỉ `GET` + một request xung đột. Đã một lần làm hỏng bản lưu thật vì probe.
- ⚠️ **Đừng mở `http://localhost:5190` trong profile trình duyệt riêng khi `AUTO_LOGIN=true`.** Profile mới không có `martial-cutie-save` → app tự đăng nhập vào tài khoản của người dùng → `restore()` lấy bản máy chủ thất bại → **đẩy run rỗng lên, ghi đè bản lưu thật**. Muốn kiểm chứng giao diện thì chạy dev server riêng với `VITE_API_TARGET` trỏ vào cổng chết (ví dụ `http://127.0.0.1:9`) để mọi lời gọi API đều 502 — không thể đăng nhập, không thể ghi.

### 5.7 Điều hướng màn hình

- ✅ Hai màn hình: **phòng chuẩn bị** (`frontend/src/routes/index.tsx` → `/`) và **cửa hàng** (`frontend/src/routes/cua-hang.tsx` → `/cua-hang`). Router: **TanStack Router, file-based**.
- ✅ **Đường dẫn URL là nguồn sự thật.** ❌ Store **không** giữ `route` — trước đây có `route` + `syncFromLocation` và đó là hai nguồn lệch nhau. Đổi màn bằng `useNavigate()` / `<Link>`.
- ✅ Thêm màn mới = **thêm một file trong `frontend/src/routes/`**. `routeTree.gen.ts` do plugin sinh lại — ❌ **không sửa tay** file đó.
- ✅ `__root.tsx` là khung chung (TopBar, hộp thoại, Toasts) và render `<Outlet/>`. Trạng thái mở/đóng hộp thoại nằm ở `store/uiStore.ts` vì `TopBar` và `ActionBar` không còn chung component cha.
- ✅ Đường dẫn lạ → `notFoundComponent` của root render `PrepScreen` (giữ hành vi cũ: hiện phòng chuẩn bị, không trắng trang, không đổi URL).
- ✅ SPA fallback có ở **cả hai phía**: `frontend/nginx.conf` (`try_files … /index.html`) và plugin `spaFallback` trong `frontend/vite.config.ts` (dev). ❌ Thiếu một trong hai thì F5 ở `/cua-hang` sẽ 404.
- ✅ Trong trận (`phase === 'battle' | 'result'`) `__root.tsx` render màn đấu **thay cho** `Outlet`, bất kể đang ở đường dẫn nào.
- ✅ Nút chưa có chức năng (Nhiệm Vụ, Bộ Sưu Tập) hiện ra để giữ bố cục nhưng bấm chỉ báo "sẽ có ở bản sau" — ❌ không im lặng.

### 5.8 Bản lưu và chống trắng trang

- ✅ Mọi `RunState` đọc từ bản lưu **phải** đi qua `sanitizeRun()` (`frontend/src/game/sanitize.ts`), được gắn vào `merge` của zustand persist. ❌ Không dùng thẳng `persisted.run`.
- ⚠️ **Vì sao bắt buộc:** `run.equipped.filter(...)` ném lỗi nếu `equipped` là `undefined`, và `getPet('id lạ')` ném lỗi. Lỗi xảy ra lúc `createRoot().render()` nên React **không hiện gì cả** → trang trắng, người chơi không còn nút nào để bấm. Đã gặp đúng lỗi này một lần; đừng bỏ `sanitizeRun`.
- ✅ `AppErrorBoundary` bọc `App` trong `main.tsx`: mọi lỗi render còn lại hiện màn hình khôi phục kèm nút xoá bản lưu. ❌ Không bao giờ để trắng trang.
- ✅ Thêm trường mới vào `RunState` = thêm vào `sanitizeRun` **và** bump `version` + viết `migrate`. Trường cũ thiếu phải có mặc định an toàn.
- ✅ Món ở `equipped` có `slot` ngoài lưới hiện tại phải **chuyển về `inventory`**; để nguyên `slot: -1` trong `equipped` thì món vô hình ở cả hai panel.

### 5.9 Hình ảnh & ghi công

- 📖 Nguồn art, giấy phép, cách đặt file: xem [`docs/ASSETS.md`](docs/ASSETS.md). Giữ tài liệu này khớp khi thêm nguồn mới.
- ✅ Art nằm trong `frontend/public/icons/`; tra đường dẫn bằng `frontend/src/game/art.ts`, hiển thị bằng `ArtIcon`.
- ✅ **Chỉ trả đường dẫn khi chắc chắn file có thật** — khai báo `stars` trong `items.ts`, `art`/`skillArt` trong `pets.ts`. ❌ Không đoán tên file.
- ✅ Luôn giữ **emoji dự phòng** trong `icon`, và `ArtIcon` lùi về emoji khi ảnh lỗi. Nhờ vậy thêm art dần được mà không bao giờ có ô trống.
- ✅ Nguồn **CC0** (ORHstudio, Kenney): không bắt buộc ghi công, nhưng vẫn ghi nguồn trong `docs/ASSETS.md`.
- ⚠️ Nguồn **CC BY** (game-icons.net): **bắt buộc** có mục **Ghi công** mở được từ menu, ghi `Icons made by {tác giả}`. ❌ Không dùng CC BY mà bỏ phần ghi công.
- ⚠️ Ghi rõ nếu art do **AI tạo** (pack ORHstudio có khai báo "AI Assisted").
- ⚠️ **Kiểm tra ảnh mới có KÊNH ALPHA thật, đừng tin mô tả của pack.** Pack ORHstudio ghi "transparent background" nhưng 31 file là **ảnh đen đục** (alpha=255 khắp nơi) → món đồ hiện thành khối đen, món dài thành khối méo. Đọc byte PNG (`colorType` phải là **6 = RGBA**) hoặc đếm pixel đục; xem cách sửa trong [`docs/ASSETS.md`](docs/ASSETS.md). `frontend/src/game/__tests__/artAlpha.test.ts` canh chừng việc này.
- ⚠️ **Đọc file bằng `?raw` trong test: byte đầu của PNG (`0x89`) không phải UTF-8 hợp lệ** nên bị thay bằng ký tự thay thế. Chỉ kiểm tra 3 byte `PNG`, đừng kiểm tra `0x89`.
- ⚠️ **Thêm thư mục tài nguyên tĩnh mới vào `frontend/` thì phải `COPY` nó trong `frontend/Dockerfile`.** Vite chỉ chép `public/` vào `dist/` khi thư mục đó **có trong ngữ cảnh build**; image `fr` hiện `COPY frontend ./frontend` nên mọi thứ trong `frontend/` đều có — nhưng nếu sau này thu hẹp danh sách `COPY`, quên `public/` thì mọi ảnh sẽ 404 và nginx trả `index.html` (SPA fallback) thay vì ảnh — lỗi rất khó thấy vì HTTP vẫn 200.

### 5.11 Chuyển đồ — **KÉO-THẢ** hoặc **BẤM–BẤM**

- ✅ Hai cách, **dùng chung một trạng thái** (`useHeldItem`) nên không thể lệch nhau:
  - **Kéo-thả**: giữ chuột trên món → kéo sang ô khác → nhả. Món chỉ được nhấc khi con trỏ đã **di chuyển** (ngưỡng 4px), nên cú bấm và cú kéo không chồng lên nhau.
  - **Bấm–bấm**: bấm món để nhấc, bấm ô để đặt.
- ✅ Xoay khi đang cầm: phím **`R`** hoặc **chuột phải**. `Esc` để bỏ. Xoay **không cần đặt xuống trước**.
- ✅ Kéo xuống **Kho** = cất vào kho; kéo từ **Kho** lên lưới = mang lên đúng ô đang trỏ.
- ❌ **Không dùng HTML5 `draggable`/`dataTransfer`** — trình duyệt nắm quyền điều khiển con trỏ và chặn sự kiện chuột khác. Dùng Pointer Events.
- ⚠️ **Chặn `onDragStart`/`onDragOver` của trình duyệt trên lưới** (`chanDragNative`). Nút món có chữ nên trình duyệt coi là phần tử kéo được; nếu không chặn, **HTML5 drag native sẽ bật lên** → con trỏ đổi thành "đang kéo" và **không có `click`** sau `pointerup`.
- ⚠️ **`pointerup` bắn ở nơi con trỏ đang ở, không phải trên phần tử nguồn.** Vì vậy:
  - Kéo **từ kho** lên lưới → `InventoryPanel` phải nghe `pointerup` ở **`document`**.
  - Kéo **từ lưới** xuống kho → `LoadoutGrid` phải nghe `pointerup` ở **`document`** và tự kiểm tra con trỏ có ra ngoài lưới.
- ⚠️ **Ô để đặt tính theo TOẠ ĐỘ con trỏ (`mousemove`), ❌ không dùng `mouseenter`/`onClick` của từng ô.** Lý do: món dài **phủ lên nhiều ô** (đao gỗ 1×3 phủ cả một cột), nên `mouseenter` bắn lên **món** chứ không phải ô, và cú bấm vào "ô 8" có thể rơi trúng món đang đè lên ô đó.
- ⚠️ **Đang cầm món thì bấm chỗ nào trong lưới cũng là ĐẶT.** ❌ Không thêm chốt kiểu "bấm trúng món đang cầm thì bỏ nhấc" — món dài phủ lên ô đích nên chốt đó sẽ chặn mất thao tác đặt.
- ✅ Ô gợi ý và chỗ đặt dùng chung `anchorFor`, nên gợi ý luôn khớp kết quả.
- ✅ **Hai bảng dùng CHUNG `GridBoard`** — cùng công thức và cùng giao diện ô/gợi ý. `LoadoutGrid` và `InventoryGrid` chỉ là lớp mỏng trên nó. ❌ Đừng tách ra hai bản vẽ lưới riêng: sẽ lệch nhau (đã từng lệch: kho co thành một hàng mỏng vì ô đặt `absolute`).
- ⚠️ **Bề rộng cột là hằng số `CELL_SIZE` (px), ❌ không dùng `minmax(0, 1fr)`.** Hai bảng nằm ở hai cột panel rộng khác nhau, nên chia theo bề rộng panel sẽ cho ô của kho to/nhỏ khác ô của trang bị. Cố định thì hai bảng luôn cùng cỡ ô.
- ⚠️ **Ô gợi ý căn giữa theo TÂM ô đang trỏ** (`hover.col + 0.5 - size.w / 2`), rồi kẹp cho khối nằm trọn trong lưới. ❌ Không dán vào góc ô — món dài neo ở ô đầu nên khối sẽ lệch hẳn khỏi con trỏ.
- ⚠️ **Bóng mờ (ô tô nền) và khung đứt phải tính từ CÙNG một ô neo.** Nếu tính hai chỗ khác nhau (ô tô theo `anchorFor`, khung theo vị trí căn giữa) thì khung sẽ **lệch** khỏi vùng tô — đã gặp đúng lỗi này. Có test `'khung đứt bao đúng các ô đang tô nền (không lệch)'` canh chừng.
- ⚠️ **Chỗ đặt dùng đúng ô neo mà gợi ý đang vẽ** (`GridBoard` báo lên qua `onAnchorSlot`), ❌ không tự tính lại từ ô thô dưới con trỏ. Gợi ý căn giữa nên ô neo khác ô thô; tính lại sẽ làm món rơi lệch khỏi khung người chơi thấy.
- ⚠️ **Chỉ nhấc món ở MỘT chỗ.** `GridBoard.onClick` lo phần "đang cầm thì đặt xuống"; việc nhấc món do `buttonProps.onClick` của chính món làm. ❌ Không nhấc ở cả hai: cú `click` bubble lên nên sẽ chạy hai lần → nhấc rồi bỏ ngay.
- ⚠️ **Ô gợi ý: tô nền từng ô nhưng chỉ vẽ MỘT viền đứt bao quanh cả khối** (`data-preview-outline`). ❌ Không vẽ viền cho từng ô — các cạnh chung chồng lên nhau thành những đường đứt nằm giữa khối, trông rối và không rõ món chiếm vùng nào.
- ⚠️ **Món đang cầm chỉ làm mờ (opacity 0.45)**, ❌ không tô thêm viền/`ring` quanh nó. Viền nét **liền** đó nằm chồng lên ô đầu của khung gợi ý, trông như một đường thừa.
- ✅ Phải có **ảnh món bám con trỏ** (`HeldGhost`) khi đang nhấc — nếu chỉ làm mờ món tại chỗ thì người chơi không thấy mình đang cầm gì.
- ⚠️ Ảnh bám con trỏ chỉ vẽ **icon món**, ❌ **không** vẽ khung/nền bo góc. Khung đó trông như một "ô nhỏ" thừa và che mất ô gợi ý bên dưới.
- ✅ Món từ kho: đặt vào ô đang trỏ nếu vừa (`equipFromInventoryAt`); không vừa thì để store tự tìm chỗ (`findFreePlacement`, **thử cả hai hướng xoay**). Hết chỗ thì **phải báo toast** — ❌ im lặng làm người chơi tưởng thao tác không ăn.
- ✅ Nút ⟳ và ✕ mang `data-no-drop` và `stopPropagation` để không bị hiểu là "đặt món".
- ✅ State "đang cầm" nằm ở **cha chung** (`PrepScreen` / `useHeldItem`), vì Kho và Trang bị là hai panel anh em.

### 5.12 Đặt tên

- ✅ Component: PascalCase + đuôi `Screen`/`Panel`/`Dialog`. File logic: camelCase (`gameStore.ts`).
- ✅ Giữ thói quen đặt tên rõ nghĩa: `item`, `template`, `combatant`, `stage`, `pet`.

## 6. Kiểm thử

### Frontend — Vitest (ở `frontend/`)

- Test lõi ở `frontend/src/game/__tests__/`, test UI ở `frontend/src/components/__tests__/`.
- File UI cần `// @vitest-environment jsdom` ở dòng đầu (mặc định là `node`). `src/game/` chạy ở `node`.
- ⚠️ File test nằm trong `src/` **không dùng được `node:fs`**: `tsconfig.app.json` chỉ khai báo `types: ["vite/client"]`. Muốn kiểm tra file có tồn tại thì dùng `import.meta.glob('...')` (chạy qua Vite) — xem `frontend/src/game/__tests__/art.test.ts`.
- UI test dùng `@testing-library/react` + `vi.useFakeTimers()` (playback dùng `setInterval`).
- ⚠️ **Test UI muốn thấy state của store thì phải dùng `render()` của @testing-library, KHÔNG dùng `renderToString`.** Zustand v5 trả **state khởi tạo** cho `getServerSnapshot`, nên component render bằng `renderToString` luôn thấy store rỗng (`items: 0`) dù test vừa `setState`. Đã mất thời gian truy đuổi "bug" này một lần.
- ⚠️ **Từ khi có router, `renderToString` KHÔNG còn dùng để smoke-test `App` được nữa.** `RouterProvider` cần router đã `load()` và cần DOM → `Cannot read properties of undefined (reading 'matches')`. Dùng helper trong **`src/test/router.tsx`**:
  - `renderInRouter(<PrepScreen/>)` — **đồng bộ**, router tối giản, chỉ để component có `useNavigate`. Dùng cho test lưới/kéo-thả.
  - `await renderApp('/cua-hang')` — **`async`**, dựng cả cây route thật với browser history. Dùng cho test điều hướng; callback của `it` phải `async`, và **phải `await`** vì `RouterProvider` render rỗng ở nhịp đầu.
- ⚠️ Điều hướng của router là transition bất đồng bộ: sau cú bấm, hãy `await screen.findByText(...)` **rồi mới** kiểm tra `window.location.pathname`.
- File test dùng JSX phải có đuôi `.tsx`; file `.ts` chỉ dùng `createElement`.
- `App` render cả `AuthSync`; test UI chạy khi **không** có backend nên `fetch` thất bại — đó là trạng thái hợp lệ, game phải vẫn chơi được ẩn danh.

### Backend — Vitest (ở `backend/`)

- Test ở `backend/tests/`, chạy `pnpm test:be` (hoặc `pnpm --filter backend test`).
- ⚠️ **KHÔNG có database phụ.** Test dùng đúng `DATABASE_URL` trong `.env` — nhưng **mỗi test chạy trong `prisma.$transaction(...)` và luôn rollback** (ném sentinel ở cuối rồi bắt ở ngoài). Vì vậy test không để lại dữ liệu và không đụng vào bản lưu thật. ❌ Không `migrate reset`, không `DROP`, không truncate.
- Vì thế **`buildApp({ db })` nhận db tiêm vào** — mọi truy cập DB phải đi qua tham số đó. ❌ Không import Prisma client ở phạm vi module.
- Gọi mạng ra Google bị chặn bằng mock `fetch` — ❌ test không được gọi mạng thật.
- Test config phải truyền env **tường minh** vào `loadConfig`, đừng phụ thuộc `.env` của máy.

### Trước khi kết thúc phiên

✅ `pnpm build` + `pnpm test` + `pnpm lint` pass **cả ba**, và `pnpm test:be` pass.

## 7. Kiểm chứng giao diện Tailwind

Build xanh **không** bảo đảm class đúng: Tailwind im lặng bỏ qua class viết sai. Cách kiểm tra đã dùng:

1. `pnpm build` rồi đọc CSS thật trong `frontend/dist/assets/*.css`.
2. Với mỗi class nghi ngờ, tìm chuỗi selector tương ứng trong CSS.
3. ⚠️ **Đừng tự mô phỏng luật escape của Tailwind** — nó escape `[`, `]`, `/`, `.`, `:`, `(`, `)`, `,` và cả `-` khi nằm trong arbitrary value (`.max-w-\[1400px\]`), đồng thời minify số (`0.02em` → `.02em`). Mô phỏng sai sẽ báo "thiếu class" giả. Cách chắc chắn: trích **tên class** trong CSS (bỏ backslash) thành một `Set` rồi tra.
4. ❌ Không viết test Vitest gọi `vite build` để kiểm tra CSS — build trong Vitest cho ra kết quả khác build CLI (thiếu nhiều utility). Chạy `pnpm build` ở CLI rồi kiểm tra file CSS là đáng tin.

## 8. Quy trình cân bằng (đã dùng, nên lặp lại)

Đừng chỉnh số theo cảm tính. Cách đã kiểm chứng:

1. Tạo **file probe tạm** `frontend/src/game/__tests__/_balance.probe.test.ts` mô phỏng win-rate qua cả 60 màn với build "người chơi điển hình" (cấp thú + số món + sao tăng dần theo màn, nhiều seed).
2. Chạy `pnpm test --reporter=verbose src/game/__tests__/_balance.probe.test.ts` và đọc bảng.
3. Chỉnh `stages.ts` (`maxHp`, `attackDamage`, `enemyStar`, `enemyItems`) rồi chạy lại.
4. Mục tiêu: win-rate **cao ở đầu game, ~50–70% ở màn 23–47, dễ dần về cuối** khi người chơi đã lên 4★. Tránh 0% (bí) và 100% đều đều (nhàm).
5. ⚠️ **XOÁ file probe ngay sau khi xong** (xem mục 9). Bản cân bằng hiện tại: `maxHp ≈ 400 + (index-1)×54`, `attackDamage ≈ 8 + (index-1)×0.95`, boss `×1.35`/`×1.12`, enemy sao `1★ <16, 2★ <31, 3★ <46, 4★ ≥46`, số món `⌊(index+3)/7⌋` (tối đa 6).

## 9. Dọn dẹp — BẮT BUỘC

- ❌ Không để lại script/ảnh/file tạm. Đặt tên có tiền tố `_` (`_balance.probe.test.ts`, `_preview.tsx`, `_verify-css.mjs`) rồi **xoá trong cùng phiên**.
- ✅ Danh sách cảnh báo trong repo này: `*.probe.test.ts`, `_preview.tsx`, `preview.html`, `_shot-*.png`, `*.dump`, `*.bak`.
- ⚠️ **KHÔNG để quy tắc ignore bắt đầu bằng `_` mà thiếu ngoại lệ.** `.gitignore` dùng `_*` cho file tạm, nhưng `_*` khớp cả tên bắt đầu bằng **hai** gạch dưới: `__tests__/` và `routes/__root.tsx`. Hậu quả đã xảy ra thật: **16 file test và 1 file route không có trong git**, clone repo ra là build đỏ. Hai dòng `!**/__tests__/` và `!**/__root.tsx` trong `.gitignore` là **bắt buộc** — ❌ đừng bỏ khi dọn dẹp khối đó.
- ✅ Sau khi thêm/xoá file, kiểm tra bằng `git status --short --ignored`: chỉ được thấy `.env`, `node_modules/`, `dist/`. Thấy đường dẫn nào khác là dấu hiệu ignore quá rộng.
- ✅ Khi cần chụp ảnh/kiểm tra UI tạm: tạo harness `_preview.tsx` + `preview.html` + `?scene=` rồi xoá sau khi xong (đã từng làm, đã dọn).
- ❌ Không commit `.env` thật (đã có trong `.gitignore`); chỉ commit `.env.example`.
- ⚠️ **`frontend/src/routeTree.gen.ts` thì NGƯỢC LẠI: phải commit.** Đó là file máy sinh nhưng `tsc` cần nó để typecheck, và nếu không commit thì lần build đầu trên máy sạch sẽ đỏ. ❌ Đừng xoá, đừng sửa tay — `pnpm dev` / `pnpm build` sẽ sinh lại.

## 10. Kiểm tra UI thực tế

- Dev: `pnpm dev` → `http://localhost:5190` (cần backend chạy ở 8000, hoặc `docker compose --profile dev up`).
- Nếu user share browser page → **navigate sang 5190** rồi tương tác thật (mua đồ → đánh → xem dialog kết quả). Kiểm tra: log battle tăng dần, thanh HP/SE đổi, dialog kết quả hiện đúng thưởng, stage +1 khi thắng.
- Lưu ý: state cũ nằm ở `localStorage` khoá `martial-cutie-save` → khi test cần trạng thái sạch thì bấm **"Chơi lại"** (có `window.confirm`, phải accept dialog trong Playwright).
- Đăng nhập: mở hộp thoại **Đăng nhập** ở thanh trên. Nếu backend chưa có key OAuth, hộp thoại hiện hướng dẫn điền `.env` — đây là hành vi đúng, không phải lỗi.
- Kiểm tra backend nhanh: `curl http://localhost:8000/api/health` → `{"status":"ok","providers":[...]}`.

## 11. Việc còn có thể làm (chưa có)

- Âm thanh/hiệu ứng đánh (hiện chỉ có animation `shake` + floater sát thương).
- Tooltip chi tiết hơn cho vật phẩm (đang dùng `title`).
- Bảng xếp hạng PvP thật / seed đối thủ chia sẻ được giữa người chơi.
- Nhiều bộ thú cưng hơn, và tuỳ chọn lọc/tìm đồ trong kho khi kho đã nhiều món.
- Dịch đa ngôn ngữ (hiện hardcode tiếng Việt trong `items.ts`/`pets.ts`/component).
- Backend: refresh token OAuth, rate limit, và dọn phiên hết hạn. (Bảng `oauth_identities` đã sẵn sàng cho việc liên kết nhiều nhà cung cấp, nhưng hiện chỉ dùng Google.)
