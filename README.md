# Martial Cutie — Đấu Trường Thú Cưng

Auto-battler nuôi thú cưng chạy trên trình duyệt (**React 19 + Vite + TypeScript + Tailwind CSS v4**, điều hướng bằng **TanStack Router**, dữ liệu máy chủ bằng **TanStack Query**), có **backend Fastify + Prisma** để đăng nhập Google và đồng bộ tiến trình. Repo là một **pnpm workspace** gồm hai gói `frontend/` và `backend/`. Lấy cảm hứng từ **event Martial Cutie (武林萌主)** của *NARAKA: BLADEPOINT*.

Dự án này **tự viết lại toàn bộ luật chơi** theo mô tả công khai của event — không sao chép tài nguyên, mã nguồn, hình ảnh, âm thanh hay văn bản của NetEase. Art vật phẩm/thú cưng là **icon CC0 của [ORHstudio](https://itch.io/c/7530014/wuxia-icon-series)** (xem [`docs/ASSETS.md`](docs/ASSETS.md)); emoji được giữ làm phương án dự phòng. Tên vật phẩm/thú cưng và phần chữ đều là nội dung gốc.

## Chạy nhanh

### Cách 1 — Docker: 3 image riêng biệt (khuyến nghị)

```bash
cp .env.example .env      # điền JWT_SECRET, và key Google nếu muốn đăng nhập
docker compose up --build # mở http://localhost:5190
```

Ba image độc lập, mỗi cái một vai trò:

| Image | Vai trò | Cổng |
| ----- | ------- | ---- |
| `db`  | PostgreSQL 17 | 5432 |
| `be`  | Fastify + Prisma (**không** chứa frontend) | 8000 |
| `fr`  | nginx phục vụ bản build Vite + proxy `/api` → `be` | **5190** → 80 |

Mở **http://localhost:5190**. `fr` chuyển tiếp `/api/*` sang `be` nên trình duyệt chỉ thấy một origin — cookie phiên đăng nhập hoạt động đúng và không cần CORS.

```bash
docker compose up -d db                       # chỉ database
docker compose --profile dev up db be vite    # dev trong Docker (Vite hot reload)
docker compose down -v                        # dừng và xoá dữ liệu
```

⚠️ Đừng chạy `fr` và `vite` cùng lúc — cả hai đều dùng cổng 5190.

### Cách 2 — Dev trên máy (hot reload nhanh nhất)

```bash
# Terminal 1: chỉ cần PostgreSQL trong Docker
docker compose up -d db

# Terminal 2: backend (Fastify, cổng 8000)
pnpm install              # một lần, ở gốc repo (cài cả hai gói)
pnpm db:migrate           # prisma migrate deploy
pnpm dev:be

# Terminal 3: frontend
pnpm dev                  # http://localhost:5190
```

Vite proxy `/api` sang `http://localhost:8000`, nên một lần nữa trình duyệt chỉ nói chuyện cùng origin. Điểm gọi lại OAuth cũng là cổng 5190 ở cả hai cách chạy — không phải đăng ký thêm URI.

### Cách 3 — Chỉ chơi frontend (không cần backend)

```bash
pnpm install
pnpm dev                  # game chơi được đầy đủ, tiến trình lưu ở localStorage
```

Không có backend thì nút **Đăng nhập** vẫn hiện nhưng hộp thoại báo chưa cấu hình — mọi tính năng chơi vẫn hoạt động bình thường.

## Lệnh

| Lệnh                            | Việc                                        |
| ------------------------------- | ------------------------------------------- |
| `pnpm dev`                      | Dev server tại http://localhost:5190 (HMR)  |
| `pnpm build`                    | Build production vào `frontend/dist/` + typecheck |
| `pnpm test`                     | Chạy test frontend (Vitest)                 |
| `pnpm lint`                     | Lint cả hai gói (oxlint)                    |
| `pnpm dev:be`                   | Chạy backend Fastify ở cổng 8000            |
| `pnpm build:be`                 | `prisma generate` + typecheck backend       |
| `pnpm test:be`                  | Chạy test backend (Vitest)                  |
| `pnpm db:migrate`               | Chạy migration (`prisma migrate deploy`)    |

## Đăng nhập Google

Backend dùng luồng **OAuth 2.0 authorization code**. Điểm gọi lại phải đăng ký đúng với Google:

| Nơi tạo khoá | Redirect URI cần đăng ký |
| ------------ | ------------------------------------------------- |
| https://console.cloud.google.com/auth/clients | `http://localhost:5190/api/auth/google/callback` |

**Cả hai cách chạy đều dùng cổng 5190** (Docker: nginx `fr`; dev: Vite), nên chỉ cần đăng ký **một** URI duy nhất — không phải thêm URI cho cổng 8000.

Điền `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` vào `.env` — cần **cả hai**, thiếu một trong hai thì nút đăng nhập không hiện.

> 📖 **Hướng dẫn từng bước lấy khoá, chế độ bắt buộc đăng nhập, và bảng lỗi thường gặp: [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md)**

### Bắt buộc đăng nhập mới chơi được?

Mặc định người chơi **vào game ngay** (chơi ẩn danh), tự bấm **Đăng nhập** khi muốn đồng bộ. Đặt `AUTO_LOGIN=true` trong `.env` thì khách chưa đăng nhập được đưa thẳng tới Google. Cờ này **vô hiệu khi chưa cấu hình khoá Google**, nên bật nhầm cũng không làm game chết.

Sau khi đăng nhập, tiến trình được đồng bộ lên server (`PUT /api/me/save`) — `localStorage` vẫn là nguồn chính, server chỉ giữ bản sao để chơi tiếp trên máy khác.

## Vòng lặp chơi

Game có **hai màn hình**, điều hướng bằng đường dẫn thật (nút Back của trình duyệt hoạt động):

| Màn hình | Đường dẫn | Nội dung |
| -------- | --------- | -------- |
| **Phòng chuẩn bị** | `/` | Thú cưng + bảng chỉ số (Sức mạnh, Máu, Lịch sử đấu) · sân khấu thú cưng · **Kho đồ** (dự trữ) · **Trang bị** (đồ đang mang) · thanh nút hành động |
| **Cửa hàng** | `/cua-hang` | Mua vật phẩm bằng Paw Tally, đổi danh sách shop. Mở từ nút **Mua Vật Phẩm »** |

### Trang bị và Kho đồ khác nhau thế nào

| | **Trang bị** | **Kho đồ** |
| --- | --- | --- |
| Là gì | Đồ thú cưng **đang mang** | Đồ **dự trữ**, chưa dùng |
| Sức chứa | Lưới **4 cột**, số hàng tăng theo cấp thú (12–20 ô) | **Không giới hạn** |
| Có tham chiến? | ✅ Có — passive, hào khí, vũ khí đều tính | ❌ Không, nằm không thì không có hiệu lực |
| Món vào đây khi nào | Mua ở cửa hàng nếu trang bị **còn chỗ** | Mua khi trang bị **hết chỗ**, hoặc khi bạn tháo ra |

Chuyển đồ giữa hai chỗ: **giữ chuột kéo** món sang ô khác rồi nhả, hoặc **bấm** món rồi **bấm** ô để đặt.
Khi đang cầm, bấm **R** hoặc **chuột phải** để xoay 90° (không cần đặt xuống trước), **Esc** để bỏ.
Kéo xuống **Kho đồ** để cất; kéo từ Kho lên lưới để mang. Vẫn có nút **↑** và **↓ Tháo hết**.

1. **Mua đồ** ở trang Cửa hàng bằng **Paw Tally (萌主币)** kiếm được qua mỗi màn — món tự lên trang bị nếu còn chỗ.
2. **Xếp trang bị**: mỗi món chiếm một **hình chữ nhật ô** (kiếm 1×3, đại đao 2×3, thân đao 1×4, ngọc/đan 1×1).
3. **Xoay 90°** món bằng **chuột phải** hoặc nút **⟳** khi chật — **kể cả đang giữ chuột kéo**. Chỉ xoay được nếu hướng mới vừa chỗ.
4. **Nhập 2 món giống hệt** (thả chồng lên nhau) → `+1★` (tối đa **4★**). Bán lại nhận **50%** Paw Tally.
5. **Đấu Thú Cưng** — thú tự động đánh. Xem lại toàn bộ diễn biến ở tốc độ ×1/×2/×4/×8.
6. **60 màn / 3 bản đồ** (Tụ Khốt Châu → Hỏa La Quốc → Stormchant), màn 10/20/30… là **thủ lĩnh**.
7. **Giao hữu PvP** với đối thủ được sinh theo sức mạnh của bạn (không ảnh hưởng tiến trình màn).

Tiến trình lưu tự động vào `localStorage` (khoá `martial-cutie-save`), và đồng bộ lên server khi đã đăng nhập. Nút **Nhiệm Vụ** và **Bộ Sưu Tập** đã có chỗ trong bố cục nhưng chưa có nội dung — bấm vào sẽ báo "sẽ có ở bản sau".

## Cơ chế chiến đấu

Mô phỏng theo bước 50 ms, **hoàn toàn tất định** theo seed → cùng một trận luôn diễn ra y hệt, có thể replay.

- **Máu (HP)** + **Giáp khởi đầu (shield)** hấp thụ sát thương trước.
- **Kiếm Thế (Sword Energy)**: hồi theo thời gian, và **+4 mỗi lần bị đánh**.
    - **Chấn Đao (Counter)** — tốn **65 Kiếm Thế**, tỉ lệ theo `counterChance`: phá đòn, phản kích bằng `referenceAtk × counterPower` và **đẩy lùi thanh đòn của đối thủ 350 ms**.
    - **Trọng kích (Charged Attack)** — tốn **24–40 Kiếm Thế** (tuỳ tốc độ vũ khí), sát thương **×2.2**.
- **Hiệu ứng trạng thái**: Chậm, Đóng Băng, Độc, Cháy, Hồi phục, Cuồng phong, Giòn.
- **Liền kề (adjacency)**: hào khí như *Trống Trận* chỉ kích hoạt khi có **vũ khí liền kề**; *Cờ Lụa* cần **một món không phải vũ khí liền kề** — tính từ **mọi ô** món chiếm, nhờ đó vị trí đặt đồ trong kho mới quan trọng.

Thông số cân bằng nằm ở [`frontend/src/game/items.ts`](frontend/src/game/items.ts), [`frontend/src/game/stages.ts`](frontend/src/game/stages.ts) và [`frontend/src/game/pets.ts`](frontend/src/game/pets.ts).

## Cấu trúc mã nguồn

```
frontend/                     # Gói `frontend`
├─ src/game/                  # Lõi game thuần logic (không phụ thuộc React)
│  ├─ types.ts                # Kiểu dữ liệu domain
│  ├─ items.ts                # 24 vật phẩm × 4★ (Vũ khí / Hộ giáp / Hồn Ngọc / Pháp Bảo / Đan Dược)
│  ├─ pets.ts                 # 3 thú cưng, 5 cấp, số hàng kho theo cấp (4 cột)
│  ├─ stages.ts               # 60 màn / 3 bản đồ + blueprint PvP
│  ├─ build.ts                # Gộp passive + hào khí → chỉ số chiến đấu
│  ├─ battle.ts               # Mô phỏng auto-battle tất định
│  ├─ sanitize.ts             # Chuẩn hoá bản lưu hỏng (chống trắng trang)
│  ├─ art.ts                  # Tra đường dẫn art (có thì dùng ảnh, không thì emoji)
│  ├─ bag.ts                  # Lưới nhiều ô: va chạm, xoay, nhập sao, giá bán
│  ├─ economy.ts              # Roll shop, reroll
│  └─ rng.ts                  # PRNG mulberry32 (tất định)
├─ src/api/                   # Nói chuyện với backend
│  ├─ client.ts               # fetch thuần + lớp ApiError
│  ├─ queries.ts              # TanStack Query: phiên đăng nhập, đẩy/nạp bản lưu
│  ├─ queryClient.ts          # createQueryClient()
│  └─ saveSync.ts             # pushRun/pullRun — luật đồng bộ, tách khỏi React
├─ src/store/
│  ├─ gameStore.ts            # Zustand + persist localStorage (luật chơi, tiến trình)
│  ├─ persistedSave.ts        # Đọc/ghi localStorage của bản lưu
│  └─ uiStore.ts              # Hộp thoại bản đồ / đăng nhập
├─ src/router.tsx             # createRouter(routeTree)
├─ src/routeTree.gen.ts       # Cây route do plugin sinh — đừng sửa tay
├─ src/routes/                # Mỗi màn hình một file
│  ├─ __root.tsx              # Khung chung (TopBar, hộp thoại, Toasts)
│  ├─ index.tsx               # Phòng chuẩn bị (/)
│  └─ cua-hang.tsx            # Cửa hàng (/cua-hang)
├─ src/components/            # UI React
│  ├─ ItemIcon.tsx            # ItemIcon / PetIcon / SkillIcon — art hoặc emoji dự phòng
│  ├─ ArtIcon.tsx             # Hiển thị ảnh, tự lùi về emoji khi thiếu file
│  ├─ GridBoard.tsx           # Lưới nhiều ô dùng chung (kho + bảng trang bị)
│  ├─ PrepScreen.tsx          # Phòng chuẩn bị (đường dẫn /)
│  ├─ ShopScreen.tsx          # Trang cửa hàng riêng (/cua-hang)
│  ├─ ActionBar.tsx           # Thanh nút đáy: Mua Vật Phẩm · Nhiệm Vụ · Bộ Sưu Tập · Bản đồ · Đấu
│  ├─ PetLoadoutPanel.tsx     # TRANG BỊ (đang mang) + nút mở cửa hàng
│  └─ …                       # TopBar, InventoryPanel, PetPanel, BattleScreen, dialog…
├─ src/styles/app.css         # @theme (design token) + @utility riêng
├─ src/test/router.tsx        # Helper render có router cho test
├─ public/icons/              # Art vật phẩm/thú cưng/kỹ năng (xem docs/ASSETS.md)
├─ Dockerfile                 # image `fr` (ngữ cảnh build = gốc repo)
└─ nginx.conf                 # SPA fallback + proxy /api → be:8000

backend/                      # Gói `backend`
├─ src/                       # Fastify: config, db, oauth, security, services, routes
├─ prisma/schema.prisma       # Bảng users, oauth_identities, game_saves
├─ prisma/migrations/0_init/  # SQL baseline (idempotent, chạy được trên DB đang có)
├─ tests/                     # Vitest — mỗi test rollback, không để lại dữ liệu
├─ Dockerfile                 # image `be` (ngữ cảnh build = gốc repo), chạy bằng tsx
└─ docker-entrypoint.sh       # chờ DB → prisma migrate deploy → tsx src/main.ts
```

### API chính

| Method | Đường dẫn                        | Việc                                          |
| ------ | -------------------------------- | --------------------------------------------- |
| GET    | `/api/auth/session`              | Trạng thái đăng nhập + nhà cung cấp khả dụng  |
| GET    | `/api/auth/google/login`         | Chuyển hướng sang Google                       |
| GET    | `/api/auth/google/callback`      | Nhận mã uỷ quyền, tạo phiên                   |
| POST   | `/api/auth/logout`               | Đăng xuất, thu hồi token cũ                   |
| GET    | `/api/me`                        | Hồ sơ người dùng hiện tại                     |
| GET    | `/api/me/save`                   | Bản lưu trên server                           |
| PUT    | `/api/me/save`                   | Ghi bản lưu (có kiểm tra `revision`)          |
| GET    | `/api/health`                    | Kiểm tra sống + nhà cung cấp đã cấu hình      |
| GET    | `/docs` (Fastify)                | Không có Swagger; xem `backend/src/routes/`    |

## Kiểm thử

```bash
pnpm test                      # 312 test frontend
pnpm test:be                   # test backend (Vitest, chạy trong transaction rollback)
```

Frontend bao phủ: lưới trang bị nhiều ô & luật nhập sao, hình dạng/xoay vật phẩm, **tách trang bị ↔ kho** (mua tự lên trang bị, hết chỗ thì vào kho, tháo/mang qua lại), giá bán 50%, catalog vật phẩm, roll shop, thang 60 màn, chỉ số thú cưng, gộp passive/hào khí, tính tất định của battle, Chấn Đao, hiệu ứng trạng thái, toàn bộ vòng lặp store, playback màn đấu, **điều hướng phòng chuẩn bị ↔ cửa hàng**, **migration v1 → v2**, **chuẩn hoá bản lưu hỏng + màn hình khôi phục**, và **art có nền trong suốt thật** (`artAlpha.test.ts`).

### Art

Icon vật phẩm/thú cưng là **CC0 của [ORHstudio](https://itch.io/c/7530014/wuxia-icon-series)** — không bắt buộc ghi công. Chi tiết nguồn, giấy phép, bảng ánh xạ và một cái bẫy đã gặp (pack ghi "transparent background" nhưng 31 file là ảnh đen đục): xem [`docs/ASSETS.md`](docs/ASSETS.md).

![Bảng icon vật phẩm](docs/images/icon-sheet.png)

Backend bao phủ: phiên đăng nhập, ẩn danh vẫn chơi được, đăng xuất thu hồi token, đồng bộ bản lưu + xung đột `revision`, giới hạn kích thước, luồng OAuth (state giả mạo, lỗi nhà cung cấp, chuẩn hoá hồ sơ), liên kết tài khoản theo email, và cấu hình (từ chối `JWT_SECRET` mẫu/quá ngắn).

## Dành cho AI agent / phiên làm việc tiếp theo

Đọc **[`AGENTS.md`](AGENTS.md)** — quy ước kiến trúc, luật chơi bất biến, yêu cầu tất định của battle engine, quy tắc Tailwind và backend, quy trình cân bằng bằng probe test, và quy tắc dọn file tạm.
