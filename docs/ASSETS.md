# Hình ảnh & Ghi công

Toàn bộ art của game là **tài nguyên bên ngoài có giấy phép tự do**. Tài liệu này ghi
nguồn, giấy phép, cách đặt file và nghĩa vụ ghi công.

⚠️ **Không bao giờ** dùng tài nguyên của NetEase / NARAKA: BLADEPOINT (xem `AGENTS.md` §1).

---

## Quy tắc khi thêm art

- ✅ **Chỉ khai đường dẫn khi chắc chắn file có thật** (`stars` trong `items.ts`, `art`/`skillArt`
  trong `pets.ts`). ❌ Không đoán tên file.
- ✅ **Luôn giữ emoji dự phòng** trong `icon`; `ArtIcon` tự lùi về emoji khi ảnh lỗi — nhờ vậy thêm
  art dần được mà không bao giờ có ô trống.
- ⚠️ **Kiểm kênh alpha thật** trước khi dùng (xem bẫy ORHstudio bên dưới): đọc byte PNG, `colorType`
  phải là **6 = RGBA**. `game/__tests__/artAlpha.test.ts` canh việc này.
- ⚠️ Nguồn **CC BY** bắt buộc có mục **Ghi công** mở được từ menu. CC0 không bắt buộc, nhưng vẫn
  ghi nguồn vào file này.
- ⚠️ Ghi rõ nếu art do **AI tạo** (pack ORHstudio có khai báo "AI Assisted").
- ⚠️ Thêm **thư mục tĩnh mới** trong `frontend/` thì kiểm image `fr` có `COPY` nó không — thiếu thì
  ảnh 404 và nginx trả `index.html` (HTTP vẫn 200, rất khó thấy).

### Art đại diện của thú cưng (khung đấu sĩ)

Khung đại diện trên sàn đấu (`components/AvatarCard.tsx`) lấy ảnh theo thứ tự:

1. **Ảnh đại diện riêng** — `public/icons/pets/<petId>-avatar.png`, bật bằng `avatar: true` trong
   `game/pets.ts` (đổi đuôi thì thêm `avatarExt`). Hàm tra: `avatarArtSrc`.
2. **Art thú cưng** — `public/icons/pets/<petId>.png` (`art: true`), đã có sẵn.
3. **Emoji dự phòng** — `icon` trong `pets.ts`.

⇒ Bổ sung ảnh đại diện **không phải sửa component**: đặt file đúng tên rồi bật cờ. Khung đã bo
viền nét đứt quanh vùng ảnh, nên chưa có ảnh vẫn trông là "chỗ dành cho ảnh" chứ không phải lỗi.

## Đang dùng

### ORHstudio — Wuxia Icon Series (CC0)

Nguồn: <https://itch.io/c/7530014/wuxia-icon-series> · tác giả **ORHstudio**

**Giấy phép: CC0 1.0 (public domain)** — dùng tự do, **không bắt buộc ghi công**. Tôi vẫn
ghi lại ở đây để biết nguồn gốc.

| Pack | Nội dung | Dùng cho |
| ---- | -------- | -------- |
| [Wuxia Weapons](https://orhstudio.itch.io/wuxia-weapon-icons-complete) | 216 icon = 18 vũ khí × 12 bậc vật liệu | 8 món: vũ khí + Nanh Lò Rèn + Thần Đúc Sư |
| [Wuxia Chest Armor](https://orhstudio.itch.io/wuxia-chest-armor-icons) | 96 icon | 3 giáp |
| [Wuxia Shields](https://orhstudio.itch.io/wuxia-shields-icons) | 108 icon | Chuông Bão, Cờ Lụa |
| [Wuxia Rings](https://orhstudio.itch.io/wuxia-rings-icons) · [Earrings](https://orhstudio.itch.io/wuxia-earrings-icons) · [Bracelets](https://orhstudio.itch.io/wuxia-bracelets-icons) · [Amulets](https://orhstudio.itch.io/wuxia-amulets-icons) · [Tokens](https://orhstudio.itch.io/wuxia-tokens-icons) | 96 icon mỗi bộ | 6 Hồn Ngọc + Trống Trận + Phù/Gương |
| [Wuxia Medicines](https://orhstudio.itch.io/wuxia-medicines-icons) | 96 icon | 4 Đan Dược |
| [Wuxia Masks](https://orhstudio.itch.io/wuxia-masks-icons) | 96 icon | Đèn Quỷ + 3 mặt thú cưng |
| [Wuxia Gloves](https://orhstudio.itch.io/wuxia-gloves-icons) | 96 icon | Song Trảo |

Kích thước: **64×64, 128×128, 32×32** PNG nền trong suốt + sprite sheet. Game dùng bản
**128×128** (nét khi phóng to / màn hình retina).

⚠️ **AI Disclosure:** trang pack ghi *"AI Assisted / Graphics"* — ảnh do AI tạo, tác giả có
rà soát lại. CC0 vẫn hợp lệ, nhưng cần biết nếu phát hành thương mại.

### ⚠️ Bẫy: pack ghi "transparent background" nhưng 31 file KHÔNG trong suốt

Trang pack ghi rõ *"Transparent background (PNG alpha)"*, nhưng thực tế **31 file item là
ảnh ĐEN ĐỤC** — alpha = 255 khắp nơi, nền đen chiếm 59–88% diện tích. Đưa thẳng vào game
thì món đồ hiện thành **khối đen**, và món dài (thương 4×1) thành khối đen méo.

Cách phát hiện (không thấy được bằng mắt qua ảnh preview, phải đọc pixel):

```powershell
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::FromFile('public\icons\items\wooden-blade-1.png')
$opaque = 0
for ($y=0; $y -lt $b.Height; $y++) { for ($x=0; $x -lt $b.Width; $x++) {
  if ($b.GetPixel($x,$y).A -gt 240) { $opaque++ } } }
"$([Math]::Round(100*$opaque/($b.Width*$b.Height)))% đục"   # nền đen cho ~100%
```

**Cách sửa đã dùng:** loang từ viền (flood fill) chỉ trên pixel gần đen → giữ được màu
đen nằm *bên trong* hình (viền kiếm, mắt thú). Sau đó thu về 64×64 (nhỏ hơn 3×, vẫn nét vì
ô lưới chỉ ~60–90px). Kết quả: 12–15% đục thay vì 100%, 4 góc trong suốt.

Ảnh đã sửa nằm trong `public/icons/` và **được commit** — không cần chạy lại bước này.
`frontend/src/game/__tests__/artAlpha.test.ts` canh chừng: mọi ảnh phải là PNG **RGBA (color type 6)**.

---

## Ánh xạ đang dùng

Mỗi món lấy **một loại** trong pack, và mỗi mức sao lấy **một bậc vật liệu** khác nhau —
nên món 4★ trông khác hẳn món 1★, người chơi nhìn ra ngay.

**Bậc vật liệu theo sao:**

| Sao | Bậc vật liệu |
| --- | ------------ |
| ★ | `natural_wood` |
| ★★ | `green_jade` |
| ★★★ | `ebony_steel` |
| ★★★★ | `divine_gold_inlaid_wood` |

Ngoại lệ (hợp chất liệu hơn): `poison-dagger` bắt đầu bằng `rusty_stone`; `twin-claws`
dùng `worn_leather` → `forged_iron` → `shining_silver`.

**Loại icon của từng món:**

| Món | Pack | Loại |
| --- | ---- | ---- |
| `wooden-blade` | weapons | `jian_sword` |
| `fire-spear` | weapons | `spear` |
| `frost-fan` | weapons | `iron_fan` |
| `poison-dagger` | weapons | `dagger` |
| `great-axe` | weapons | `battle_axe` |
| `forge-fang` | weapons | `hook_blade` |
| `divine-forger` | weapons | `war_hammer` |
| `twin-claws` | gloves | `tiger_claw_glove` |
| `hide-vest` | chest-armor | `cloth_armor` |
| `chain-mail` | chest-armor | `chainmail` |
| `warden-plate` | chest-armor | `general_chestplate` |
| `jade-fury` | amulets | `dragon_jade` |
| `jade-vampire` | amulets | `phoenix_jade` |
| `jade-guard` | amulets | `qilin_jade` |
| `jade-haste` | rings | `yinyang_ring` |
| `jade-crit` | earrings | `tiger_fang_earring` |
| `jade-sword` | tokens | `sword_token` |
| `war-drum` | bracelets | `bell_bracelet` |
| `ghost-lantern` | masks | `fox_mask` |
| `storm-bell` | shields | `sun_shield` |
| `silk-banner` | shields | `rectangular_shield` |
| `frost-seal` | tokens | `cloud_token` |
| `mirror-shard` | tokens | `hexagon_token` |
| `venom-vial` | medicines | `black_medicine` |
| `heal-dew` | medicines | `white_medicine` |
| `tiger-tonic` | medicines | `orange_medicine` |
| `iron-brew` | medicines | `gold_medicine` |

**Thú cưng** (masks, bậc ★★★): `fire-pup`→`tiger_mask` · `white-rabbit`→`fox_mask` ·
`spirit-cat`→`skull_mask`

**Kỹ năng** (weapons, bậc ★★★): `fire-pup`→`monk_spade` · `white-rabbit`→`ji_halberd` ·
`spirit-cat`→`whip`

Đổi ánh xạ thì sửa bảng chọn icon và chạy lại script chép — **không** sửa tay từng file.

---

## Phương án dự phòng

### game-icons.net (CC BY 3.0)

Nguồn: <https://game-icons.net/> · kho ~5000 SVG một màu, tô được theo màu của game.

**Giấy phép: CC BY 3.0 — BẮT BUỘC ghi công.** Nguồn: [about](https://game-icons.net/about.html),
[license.txt](https://raw.githubusercontent.com/game-icons/icons/master/license.txt).

Cách ghi công: `Icons made by {tác giả}. Available on https://game-icons.net`

Trong game phải có mục **Ghi công** mở được từ menu ([FAQ](https://game-icons.net/faq.html)
nói rõ điều này là đủ cho video game). Các tác giả đang dùng: **Lorc**, **Delapouite**.

Ưu điểm: tải được tự động từ repo GitHub, không cần thao tác tay.

### Kenney (CC0)

Nguồn: <https://kenney.nl/assets> · mỗi pack ghi rõ **CC0**. Phong cách fantasy châu Âu,
hợp cho **icon UI** (nút, chỉ số) hơn là vật phẩm võ hiệp.

---

## Cách đặt file

```
public/icons/
├─ items/   <templateId>-<star>.png     ví dụ: wooden-blade-1.png, great-axe-4.png
├─ pets/    <petId>.png                 ví dụ: fire-pup.png
├─ skills/  <petId>-skill.png           ví dụ: fire-pup-skill.png
└─ ui/      (icon giao diện, tuỳ ý)
```

Đuôi file khác `png` thì khai báo `artExt` trong template.

## Cách code tìm art

`frontend/src/game/art.ts` tra đường dẫn; `frontend/src/components/ItemIcon.tsx` hiển thị
(`ItemIcon`, `PetIcon`, `SkillIcon`), nền là `ArtIcon`.

**Nguyên tắc quan trọng:** chỉ trả đường dẫn khi **biết chắc file có thật**, dựa trên danh
sách sao khai báo trong `items.ts` (`stars: [1, 2, 3, 4]`) / `pets.ts` (`art: true`).
Không đoán tên file — đoán sai sẽ hiện icon vỡ.

Không có art, hoặc ảnh tải lỗi → **tự lùi về emoji**. Nhờ vậy thêm art dần dần được, và
game chưa bao giờ hiện ô trống.

```ts
// items.ts — khai báo art có ở những sao nào
{
  id: 'wooden-blade',
  icon: '🗡️',                    // dự phòng, luôn giữ
  stars: [1, 2, 3, 4],          // có art cho cả 4 sao
  artExt: 'png',                // tuỳ chọn, mặc định 'png'
}

// pets.ts
{
  id: 'fire-pup',
  icon: '🐶',                    // dự phòng, luôn giữ
  art: true,                    // có public/icons/pets/fire-pup.png
  skillArt: true,               // có public/icons/skills/fire-pup-skill.png
}
```

## Test bảo vệ

`frontend/src/game/__tests__/art.test.ts` kiểm tra:
- mọi template khai báo `stars` đều có **file thật** cho từng sao đó
- mọi `art`/`skillArt` của thú cưng đều có file
- **không có file thừa** trong `public/icons/` (file không khớp template nào — dấu hiệu ánh xạ sai)
- trả `null` đúng lúc để lùi về emoji

Test này đã bắt được 4 file `vine-fan-*.png` thừa từ một lần ánh xạ sai.

`frontend/src/game/__tests__/artAlpha.test.ts` kiểm tra mọi ảnh là **PNG RGBA** (có kênh alpha) —
xem phần "Bẫy" ở trên.
