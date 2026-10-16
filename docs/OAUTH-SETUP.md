# Hướng dẫn lấy Google Client ID / Client Secret

Hướng dẫn tạo khoá OAuth cho **Google**, điền vào `.env` để bật chức năng đăng nhập của Martial Cutie.

> **Bạn không bắt buộc phải làm việc này.** Không có khoá thì game vẫn chơi đầy đủ, chỉ là không đăng nhập / không đồng bộ tiến trình theo tài khoản được.

> **Lưu ý:** Facebook login **đã bị bỏ** khỏi dự án. Endpoint `/api/auth/facebook/login` giờ trả `400 unknown_provider`, và biến `FACEBOOK_CLIENT_ID`/`FACEBOOK_CLIENT_SECRET` không còn tác dụng — có sót lại trong `.env` cũng bị bỏ qua.

---

## 0. Giá trị cần điền — chính xác theo code

Điểm gọi lại (redirect URI) do biến `FRONTEND_URL` (hoặc `BE_PUBLIC_URL` khi chạy Docker) quyết định. **Phải khớp từng ký tự** với cái bạn đăng ký ở Google Console.

| Cách chạy | Cổng game | Redirect URI đăng ký |
| --- | --- | --- |
| Docker (`docker compose up --build`) | 5190 (nginx `fr`) | `http://localhost:5190/api/auth/google/callback` |
| Dev trên máy (`pnpm dev` + `pnpm dev:be`) | 5190 (Vite) | `http://localhost:5190/api/auth/google/callback` |
| Chỉ gọi API trực tiếp | 8000 (container `be`) | `http://localhost:8000/api/auth/google/callback` |

Vì cả hai cách chạy chính đều dùng **cổng 5190**, bạn chỉ cần đăng ký **một** URI. Dòng cổng 8000 là tuỳ chọn — chỉ cần nếu bạn gọi thẳng `/api` của container backend (ví dụ mở `http://localhost:8000/api/docs` rồi bấm đăng nhập từ đó).

Backend dùng các endpoint chính thức sau (không cần cấu hình, chỉ để bạn đối chiếu khi gỡ lỗi):

| Bước | URL |
| --- | --- |
| Xác thực | `accounts.google.com/o/oauth2/v2/auth` |
| Đổi token | `oauth2.googleapis.com/token` |
| Hồ sơ | `openidconnect.googleapis.com/v1/userinfo` |
| Quyền xin | `openid email profile` |

Thông tin lấy được: **mã người dùng (`sub`), tên, email, ảnh đại diện**. Không xin quyền đọc dữ liệu nào khác của Google.

---

## 1. Tạo project

1. Mở https://console.cloud.google.com/ → đăng nhập bằng tài khoản Google.
2. Góc trên bên trái, bấm ô chọn project → **New project**.
3. Đặt tên (ví dụ `martial-cutie`) → **Create** → chờ vài giây → chọn project vừa tạo.

> Không cần bật API nào và **không cần thẻ thanh toán**. Đăng nhập chỉ dùng OpenID Connect, không gọi API trả phí.

## 2. Cấu hình màn hình đồng ý (OAuth consent screen)

Google yêu cầu bước này **trước khi** tạo được khoá. Giao diện mới gọi là **Google Auth Platform**; nếu console của bạn hiện bản cũ, đường dẫn tương đương là **APIs & Services → OAuth consent screen**.

1. Vào https://console.cloud.google.com/auth/overview → bấm **Get started** (hoặc **Bắt đầu**).
2. **App information**
   - *App name*: `Martial Cutie`
   - *User support email*: email của bạn
3. **Audience** — chọn **External** (bên ngoài). Chọn *Internal* chỉ dùng được với tài khoản trong tổ chức Google Workspace.
4. **Contact information**: điền email của bạn.
5. Tick đồng ý điều khoản → **Create**.
6. Vào mục **Data access** (hoặc *Scopes*) → **Add or remove scopes** → thêm 3 scope sau rồi **Update**:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   Đây đều là scope **không nhạy cảm**, nên ứng dụng **không phải qua quy trình Google xét duyệt**.
7. Vào mục **Audience** → phần **Test users** → **Add users** → thêm **địa chỉ Gmail bạn sẽ dùng để đăng nhập thử**.

⚠️ **Quan trọng nhất:** khi ứng dụng còn ở trạng thái *Testing*, **chỉ những tài khoản trong danh sách Test users mới đăng nhập được**. Người khác sẽ bị chặn với lỗi `access_denied`. Đây là lỗi phổ biến nhất — nếu bạn test bằng Gmail khác, hãy thêm nó vào danh sách này.

## 3. Tạo Client ID

1. Vào https://console.cloud.google.com/auth/clients → **Create client**.
2. *Application type*: chọn **Web application**. (❌ Không chọn *Desktop app* hay *SPA* — chúng không dùng được client secret theo cách backend này cần.)
3. *Name*: `Martial Cutie Web`.
4. **Authorized JavaScript origins** — thêm gốc, **không có đường dẫn**:
   ```
   http://localhost:5190
   ```
   (thêm `http://localhost:8000` chỉ khi bạn muốn gọi thẳng API của container backend)
5. **Authorized redirect URIs** → **Add URI** → dán chính xác:
   ```
   http://localhost:5190/api/auth/google/callback
   ```
   Đây là URI cho cả Docker lẫn dev trên máy — cả hai đều phục vụ game ở cổng 5190. Tuỳ chọn, nếu bạn gọi thẳng cổng backend:
   ```
   http://localhost:8000/api/auth/google/callback
   ```
6. **Create**.
7. Hộp thoại hiện **Client ID** và **Client secret**:
   - **Client ID** có dạng `388199177066-xxxxxxxxxxxxxxxx.apps.googleusercontent.com`
   - **Client secret** có dạng `GOCSPX-xxxxxxxxxxxxxxxxxxxx`

⚠️ **Client secret chỉ hiện đầy đủ một lần.** Hãy copy ngay. Nếu lỡ mất hoặc nghi ngờ bị lộ: vào lại danh sách clients → **Add secret** để tạo secret mới, rồi xoá secret cũ.

## 4. Điền vào .env

```bash
GOOGLE_CLIENT_ID=388199177066-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

Cần điền **cả hai**. Thiếu một trong hai thì nút đăng nhập **không hiện** trong hộp thoại — đây là chủ ý để tránh hiện nút rồi báo lỗi khi bấm.

---

## 5. Chế độ bắt buộc đăng nhập (`AUTO_LOGIN`)

Mặc định (`AUTO_LOGIN=false`) người chơi **vào game ngay**, và tự bấm **Đăng nhập** khi muốn đồng bộ tiến trình.

Nếu bạn muốn **bắt buộc đăng nhập mới chơi được**:

```bash
AUTO_LOGIN=true
```

Cách hoạt động:

- Backend trả cờ này trong `/api/auth/session`; **chỉ true khi đã cấu hình đủ khoá Google**.
- Frontend, sau khi kiểm tra phiên xong và thấy chưa đăng nhập, sẽ chuyển hướng thẳng sang trang chọn tài khoản Google.
- Sau khi đăng nhập thành công, người dùng quay về game và **không bị chuyển hướng nữa**.

Hai điều cần biết:

- **Không có khoá Google thì cờ này vô hiệu** — game vẫn chơi ẩn danh bình thường. Nhờ vậy bật `AUTO_LOGIN=true` mà quên điền khoá sẽ không làm game chết.
- Có **cờ chống vòng lặp** trong `sessionStorage`: một tab đã thử tự đăng nhập rồi thì không thử lại. Nếu đăng nhập lỗi, người dùng thấy thông báo lỗi và có thể bấm **Đăng nhập** thủ công.
- Muốn thoát chế độ bắt buộc: đổi `AUTO_LOGIN=false` rồi khởi động lại backend.

---

## 6. Điền file `.env` và chạy

```bash
cp .env.example .env
```

Mở `.env` và điền tối thiểu:

```bash
# Bắt buộc — sinh khoá bằng lệnh bên dưới
JWT_SECRET=<khoá ngẫu nhiên>

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Gốc của redirect URI — phải khớp cái đã đăng ký
FRONTEND_URL=http://localhost:5190
```

Sinh `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `JWT_SECRET` là khoá ký cookie phiên đăng nhập. Backend **từ chối khởi động** nếu khoá trống, trùng giá trị mẫu trong `.env.example`, hoặc ngắn hơn 32 ký tự — để bạn không vô tình chạy production với khoá ai cũng đoán được.

Sau khi sửa `.env`, **khởi động lại backend** (biến môi trường chỉ đọc lúc khởi động).

---

## 7. Kiểm tra đã đúng chưa

### Bước 1 — Backend nhận được khoá chưa?

```bash
curl http://localhost:8000/api/health
```

Kết quả mong đợi:

```json
{"status":"ok","environment":"development","providers":["google"]}
```

- `"providers":[]` → chưa điền đủ cặp khoá, hoặc **chưa khởi động lại backend**.

### Bước 2 — URL uỷ quyền có đúng không?

```bash
curl -s "http://localhost:8000/api/auth/google/login" -o /dev/null -D - | Select-String -Pattern "location"
```

Trong URL trả về, kiểm tra hai tham số quan trọng:

- `client_id` = Client ID của bạn (bắt đầu bằng `388199177066-`…)
- `redirect_uri` = `http%3A%2F%2Flocalhost%3A5190%2Fapi%2Fauth%2Fgoogle%2Fcallback`

Nếu `redirect_uri` không khớp cái bạn đã đăng ký ở Google Console, sửa `FRONTEND_URL` trong `.env`.

### Bước 2 — Kiểm tra Google đã chấp nhận redirect URI chưa

Lỗi `redirect_uri_mismatch` xảy ra khi URI app gửi lên **không có** trong danh sách đã đăng ký. Chờ 1–2 phút sau khi Save ở console, rồi kiểm tra bằng đúng URL mà app sẽ dùng:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8000/api/auth/google/login"
```

Nhưng cách chắc chắn nhất là mở trực tiếp URL uỷ quyền trong trình duyệt và xem Google báo gì:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>&redirect_uri=<URI_ESCAPED>&response_type=code&scope=openid+email+profile&prompt=none
```

- Nếu Google hiện trang **"Access blocked: This app's request is invalid"** kèm `Error 400: redirect_uri_mismatch` → URI đó **chưa được đăng ký**.
- Nếu Google chuyển thẳng tới trang đăng nhập/chọn tài khoản → URI **đã hợp lệ**.

> Mẹo dò nhanh nhiều URI cùng lúc: dùng `prompt=none` để Google không hỏi gì, rồi tìm câu `You can't sign in because this app sent an invalid request` trong nội dung trang trả về. Trang lỗi chứa câu đó; trang đăng nhập thì không. ⚠️ Đừng chỉ tìm chuỗi `redirect_uri_mismatch` trong HTML — trang lỗi nhúng sẵn chuỗi này trong JavaScript nên dễ báo dương tính giả.

### Bước 3 — Thử đăng nhập

1. Mở http://localhost:5190 (nếu `AUTO_LOGIN=true` thì trình duyệt tự nhảy sang Google).
2. Chọn tài khoản **đã có trong danh sách Test users** → đồng ý.
3. Quay về game, thanh trên hiện **tên + ảnh đại diện** và dòng **Đã đồng bộ**.

---

## 8. Lỗi thường gặp

| Hiện tượng | Nguyên nhân & cách sửa |
| --- | --- |
| Hộp thoại báo *"Máy chủ chưa được cấu hình đăng nhập"* | `/api/health` trả `providers: []`. Điền `.env` rồi **khởi động lại backend**. |
| `Error 403: access_denied` | Tài khoản đăng nhập không nằm trong **Test users**. Thêm vào (mục 2 bước 7), hoặc bấm **Publish app** ở mục *Audience*. |
| `Error 400: redirect_uri_mismatch` | URI không khớp. So **từng ký tự** với `http://localhost:5190/api/auth/google/callback`. Google coi `localhost` và `127.0.0.1` là **hai URI khác nhau**, và URI đăng ký **không được có `/` ở cuối**. Kiểm tra cả `FRONTEND_URL` trong `.env` — cổng trong biến này phải trùng cổng đã đăng ký. Sau khi Save ở console phải chờ 1–2 phút và thử lại; nếu vẫn lỗi, dùng cách dò ở mục 7 bước 2 để biết chắc Google đã nhận URI nào. |
| Dán URI vào *JavaScript origins* thay vì *redirect URIs* | Google báo `invalid_request` khi lưu. `JavaScript origins` chỉ nhận **gốc** (`http://localhost:5190`), không nhận đường dẫn. |
| `Error 400: invalid_client` | Sai **Client Secret** (dán thiếu ký tự), hoặc secret đã bị xoá/rotate. Vào console tạo secret mới. |
| Quay về game nhưng báo *"Phiên đăng nhập không hợp lệ hoặc đã hết hạn"* | Cookie `state` chống giả mạo bị mất. Kiểm tra bạn không chặn cookie cho `localhost`. |
| Bấm đăng nhập mà không chuyển trang | Backend chưa chạy, hoặc Vite proxy không hoạt động. Kiểm tra `curl http://localhost:8000/api/health` và xem terminal của `pnpm dev`. |
| Bật `AUTO_LOGIN=true` mà vào game bình thường | Chưa cấu hình đủ khoá Google (cờ bị vô hiệu), hoặc tab này đã thử tự đăng nhập rồi. Mở tab mới hoặc bấm **Đăng nhập** thủ công. |
| Tự đăng nhập xong bị quay lại trang đăng nhập mãi | Cờ chống vòng lặp chỉ sống trong một tab. Kiểm tra backend có đổi được code lấy token không: `docker compose logs -f be` hoặc terminal chạy `pnpm dev:be`. |

### Xem log chi tiết

- **Backend dev**: log in ngay trong terminal chạy `pnpm dev:be`.
- **Docker**: `docker compose logs -f api`.
- **Trình duyệt**: mở DevTools → tab **Network**, xem request `/api/auth/google/callback` để thấy tham số `error` Google trả về.

---

## 9. Khi triển khai thật (production)

1. Đổi `FRONTEND_URL` thành domain thật, ví dụ `https://game.example.com`, rồi **đăng ký lại redirect URI** ở Google Console:
   ```
   https://game.example.com/api/auth/google/callback
   ```
   Google yêu cầu **HTTPS** với domain thật (localhost là ngoại lệ dành cho phát triển).

2. Đặt `COOKIE_SECURE=true` trong `.env`. Bắt buộc — thiếu bước này cookie phiên có thể bị gửi qua HTTP không mã hoá.

3. Sinh `JWT_SECRET` **mới**, khác hoàn toàn khoá dev. Đổi khoá sẽ làm mọi phiên đang đăng nhập hết hiệu lực (người dùng phải đăng nhập lại) — đó là hành vi mong muốn.

4. Cho người ngoài danh sách Test users đăng nhập được: vào **Audience** → **Publish app**. Vì chỉ dùng 3 scope không nhạy cảm, thường không phải qua xét duyệt.

5. Cân nhắc đặt `AUTO_LOGIN=false` ở production nếu bạn muốn khách xem được game trước khi quyết định đăng nhập.
