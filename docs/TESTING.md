# Kiểm thử & kiểm chứng

> Quy tắc bắt buộc ở [`../AGENTS.md`](../AGENTS.md) §6. File này là chi tiết + những cái bẫy đã
> tốn thời gian thật.

## 0. Chạy gì trước khi kết thúc phiên

```bash
pnpm build && pnpm test && pnpm lint && pnpm test:be
```

Cả bốn phải xanh. `pnpm lint` chạy cho **cả hai gói**.

## 1. Frontend — Vitest

| | |
| --- | --- |
| Lõi game | `frontend/src/game/__tests__/` — môi trường `node` |
| UI | `frontend/src/components/__tests__/` — cần `// @vitest-environment jsdom` ở dòng đầu |

### Bẫy 1 — `renderToString` không thấy state của store

Zustand v5 trả **state khởi tạo** cho `getServerSnapshot`. Component render bằng `renderToString`
luôn thấy store rỗng dù test vừa `setState`. ✅ Luôn dùng `render()` của @testing-library.

### Bẫy 2 — từ khi có router, `renderToString(<App/>)` cũng không dùng được

`RouterProvider` cần router đã `load()` và cần DOM, nếu không sẽ ném
`Cannot read properties of undefined (reading 'matches')`. Dùng helper ở **`frontend/src/test/router.tsx`**:

| Helper | Kiểu | Dùng khi |
| --- | --- | --- |
| `renderInRouter(<PrepScreen/>)` | **đồng bộ** | Chỉ cần component có `useNavigate`. Test lưới/kéo-thả dùng cái này nên **không phải** đổi sang `async` |
| `await renderApp('/cua-hang')` | **`async`** | Test điều hướng — dựng cả cây route thật với browser history |

⚠️ Vì sao `renderInRouter` đồng bộ được: nó dùng `RouterContextProvider` (chỉ cần context), còn
`renderApp` phải qua `RouterProvider` — thứ này **render rỗng ở nhịp đầu** rồi mới khớp route sau
khi `router.load()` xong.

### Bẫy 3 — điều hướng là transition bất đồng bộ

Sau cú bấm, `window.location` có thể đổi **sau** một nhịp. ✅ Chờ DOM trước rồi mới kiểm URL:

```tsx
fireEvent.click(screen.getByText(/Quay về/))
expect(await screen.findByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
expect(window.location.pathname).toBe('/')
```

### Bẫy 4 — file test không dùng được `node:fs`

`tsconfig.app.json` chỉ khai báo `types: ["vite/client"]`. Muốn kiểm tra file có tồn tại thì dùng
`import.meta.glob('...')` (chạy qua Vite) — xem `game/__tests__/art.test.ts`.

### Bẫy 5 — không có backend là trạng thái hợp lệ

Test UI chạy khi backend không tồn tại nên `fetch` thất bại. Đó **không** phải lỗi: game phải vẫn
chơi ẩn danh được. Đừng "sửa" bằng cách cho test cần backend.

### Bẫy 6 — ảnh PNG đọc bằng `?raw`

Byte đầu của PNG (`0x89`) không phải UTF-8 hợp lệ nên bị thay bằng ký tự thay thế. Chỉ kiểm tra 3
byte `PNG`.

## 2. Backend — Vitest

```bash
pnpm test:be           # cần PostgreSQL đang chạy: docker compose up -d db
```

**Một database duy nhất, và không để lại dấu vết.** Mỗi ca chạy trong
`prisma.$transaction(tx => { …; throw sentinel })` rồi bắt sentinel ở ngoài ⇒ rollback.

Điều kiện để cách này hoạt động: **mọi truy cập DB đi qua `db` được tiêm vào**
`buildApp({ db, config })`. ❌ Import `PrismaClient` ở phạm vi module là phá vỡ nó — và test sẽ ghi
vào DB thật.

- ❌ Không tạo database phụ, ❌ không dùng SQLite, ❌ không `migrate reset` / `DROP` / truncate.
- ⚠️ `fileParallelism: false` để hai transaction không chặn nhau ở unique index của `users.email`.
- ⚠️ Sequence **không** rollback theo (`users_id_seq` tăng dần mỗi lần chạy test). Vô hại.
- ✅ `tests/setup.ts` cài `fetch` **ném lỗi** ⇒ mọi lời gọi mạng lọt ra ngoài sẽ đổ ngay. Test OAuth
  thay `fetch` bằng stub trả `Response` thật.
- ✅ Test config truyền env **tường minh** vào `loadConfig`, ❌ đừng phụ thuộc `.env` của máy.

### Kiểm chứng dữ liệu người dùng không bị đụng

```bash
docker exec martial-cutie-db-1 psql -U martial -d martial_cutie -t -c \
  "SELECT 'users=' || (SELECT count(*) FROM users) || ' saves=' || (SELECT count(*) FROM game_saves);"
```

So số **trước và sau** khi chạy test. Phải giống nhau.

## 3. Kiểm chứng giao diện

### ⚠️ Cái bẫy đã ghi đè bản lưu thật

`.env` có `AUTO_LOGIN=true`. Mở `http://localhost:5190` trong **profile trình duyệt riêng**:

```
profile mới, không có martial-cutie-save
  → app tự đăng nhập tài khoản người dùng (AUTO_LOGIN)
  → restore() nạp bản máy chủ thất bại (không có tiến trình cục bộ để so)
  → AuthSync đẩy run RỖNG lên
  → GHI ĐÈ BẢN LƯU THẬT
```

**Đã xảy ra một lần.** Bản lưu thật chỉ còn cứu được vì localStorage là nguồn chính.

### Hai cách kiểm chứng an toàn

**A. Chỉ test tự động** (mặc định nên dùng): `pnpm test` phủ 16 file; không mở trình duyệt, không
thêm cổng nào.

**B. Harness cách ly** khi thật sự cần nhìn giao diện:

```powershell
cd frontend
$env:VITE_API_TARGET='http://127.0.0.1:9'   # cổng chết ⇒ mọi /api đều 502
pnpm dev --port <cổng đang trống>
```

⇒ **Không thể đăng nhập, không thể ghi gì lên tài khoản người dùng.** Nhưng:

- ⚠️ Phải **nói trước** dùng cổng nào (5190 là của container `fr`, không dùng được).
- ⚠️ Trong harness, giao diện sẽ hiện "Không kết nối được máy chủ đăng nhập" — **đó là hành vi
  đúng**, không phải bug.
- ✅ **Tắt server và đóng tab ngay sau khi xong.** Tab trỏ vào harness rất dễ bị hiểu nhầm là game lỗi.

**C. Muốn kiểm chứng thật trên 5190**: đặt `AUTO_LOGIN=false` trong `.env`, khởi động lại `be`, rồi
mở như người dùng thật.

### Đăng nhập

Mở hộp thoại **Đăng nhập** ở thanh trên. Nếu backend chưa có khoá OAuth, hộp thoại hiện hướng dẫn
điền `.env` — hành vi đúng. Nếu **không gọi được** backend, hộp thoại phải nói "Không kết nối được
máy chủ" kèm nút **Thử lại** (đừng nhầm hai tình huống này).

### Backend nhanh

```bash
curl http://localhost:8000/api/health      # {"status":"ok","providers":["google"]}
curl -i http://localhost:8000/api/me       # 401 + x-error-code: unauthorized
```

## 4. Kiểm chứng CSS của Tailwind

Build xanh **không** bảo đảm class đúng — Tailwind im lặng bỏ qua class viết sai.

1. `pnpm build` rồi đọc CSS thật trong `frontend/dist/assets/*.css`.
2. Với mỗi class nghi ngờ, tìm chuỗi selector tương ứng.
3. ⚠️ **Đừng tự mô phỏng luật escape của Tailwind** — nó escape `[`, `]`, `/`, `.`, `:`, `(`, `)`,
   `,` và cả `-` trong arbitrary value (`.max-w-\[1400px\]`), đồng thời minify số (`0.02em` →
   `.02em`). Mô phỏng sai sẽ báo "thiếu class" giả. ✅ Cách chắc chắn: trích **tên class** trong CSS
   (bỏ backslash) thành một `Set` rồi tra.
4. ❌ Không viết test Vitest gọi `vite build` để kiểm CSS — build trong Vitest cho kết quả khác
   build CLI. Chạy `pnpm build` ở CLI rồi kiểm file CSS.
