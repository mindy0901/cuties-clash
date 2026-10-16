# Martial Cutie — Đấu Trường Thú Cưng

Auto-battler nuôi thú cưng chạy trên trình duyệt (React + Vite + TypeScript), lấy cảm hứng từ **event Martial Cutie (武林萌主)** của *NARAKA: BLADEPOINT*.

Dự án này **tự viết lại toàn bộ luật chơi** theo mô tả công khai của event — không sao chép tài nguyên, mã nguồn, hình ảnh, âm thanh hay văn bản của NetEase. Toàn bộ icon là emoji, tên vật phẩm/thú cưng và phần chữ đều là nội dung gốc.

## Chạy dự án

```bash
pnpm install
pnpm dev        # http://localhost:5190
```

| Lệnh           | Việc                                     |
| -------------- | ---------------------------------------- |
| `pnpm dev`     | Dev server (HMR)                         |
| `pnpm build`   | Typecheck + build production vào `dist/` |
| `pnpm test`    | Chạy test (Vitest)                       |
| `pnpm lint`    | Lint (oxlint)                            |
| `pnpm preview` | Xem bản build production                 |

## Vòng lặp chơi

1. **Mua đồ** ở Cửa hàng bằng **Paw Tally (萌主币)** kiếm được qua mỗi màn.
2. **Kéo thả** đồ vào **túi** của thú cưng (lưới 6 cột, số hàng tăng theo cấp thú).
3. **Nhập 2 món giống hệt** → `+1★` (tối đa **4★**). Bán lại nhận **50%** Paw Tally.
4. **Xuất chiến** — thú tự động đánh. Xem lại toàn bộ diễn biến ở tốc độ ×1/×2/×4/×8.
5. **60 màn / 3 bản đồ** (Tụ Khốt Châu → Hỏa La Quốc → Stormchant), màn 10/20/30… là **thủ lĩnh**.
6. **Giao hữu PvP** với đối thủ được sinh theo sức mạnh của bạn (không ảnh hưởng tiến trình màn).

Tiến trình được lưu tự động vào `localStorage` (khoá `martial-cutie-save`).

## Cơ chế chiến đấu

Mô phỏng theo bước 50 ms, **hoàn toàn tất định** theo seed → cùng một trận luôn diễn ra y hệt, có thể replay.

- **Máu (HP)** + **Giáp khởi đầu (shield)** hấp thụ sát thương trước.
- **Kiếm Thế (Sword Energy)**: hồi theo thời gian, và **+4 mỗi lần bị đánh**.
    - **Chấn Đao (Counter)** — tốn **65 Kiếm Thế**, tỉ lệ theo `counterChance`: phá đòn, phản kích bằng `referenceAtk × counterPower` và **đẩy lùi thanh đòn của đối thủ 350 ms**.
    - **Trọng kích (Charged Attack)** — tốn **24–40 Kiếm Thế** (tuỳ tốc độ vũ khí), sát thương **×2.2**.
- **Hiệu ứng trạng thái**: Chậm, Đóng Băng, Độc, Cháy, Hồi phục, Cuồng phong, Giòn (gây thêm sát thương và giảm máu tối đa).
- **Liền kề (adjacency)**: hào khí như *Trống Trận* chỉ kích hoạt khi có **vũ khí liền kề**; *Cờ Lụa* cần **một món không phải vũ khí liền kề** — nhờ đó vị trí đặt đồ trong túi mới quan trọng.

Thông số cân bằng quan trọng nằm ở [`src/game/items.ts`](src/game/items.ts), [`src/game/stages.ts`](src/game/stages.ts) và [`src/game/pets.ts`](src/game/pets.ts).

## Cấu trúc mã nguồn

```
src/
├─ game/                 # Lõi game thuần logic (không phụ thuộc React)
│  ├─ types.ts           # Kiểu dữ liệu domain
│  ├─ items.ts           # 24 vật phẩm × 4★ (Vũ khí / Hộ giáp / Hồn Ngọc / Pháp Bảo / Đan Dược)
│  ├─ pets.ts            # 3 thú cưng, 5 cấp, kích thước túi theo cấp
│  ├─ stages.ts          # 60 màn / 3 bản đồ + blueprint PvP
│  ├─ build.ts           # Gộp passive + hào khí → chỉ số chiến đấu
│  ├─ battle.ts          # Mô phỏng auto-battle tất định
│  ├─ bag.ts             # Lưới túi, liền kề, nhập sao, giá bán
│  ├─ economy.ts         # Roll shop, reroll
│  └─ rng.ts             # PRNG mulberry32 (tất định)
├─ store/gameStore.ts    # Zustand + persist localStorage
├─ components/           # UI React (mỗi màn một component)
└─ styles/globals.css    # Design token + CSS thuần
```

## Kiểm thử

44 test bao phủ: lưới túi & luật nhập sao, giá bán 50%, catalog vật phẩm, roll shop theo bản đồ, thang 60 màn, chỉ số thú cưng, gộp passive/hào khí, tính tất định của battle, Chấn Đao, hiệu ứng trạng thái, và **toàn bộ vòng lặp store** (mua → nhập → đánh → nhận thưởng → sang màn) cùng **playback màn đấu** (chạy, tạm dừng, bỏ qua, commit một lần).

```bash
pnpm test
```

## Dành cho AI agent / phiên làm việc tiếp theo

Đọc **[`AGENTS.md`](AGENTS.md)** — quy ước kiến trúc, luật chơi bất biến, yêu cầu tất định của battle engine, quy trình cân bằng bằng probe test, và quy tắc dọn file tạm.
