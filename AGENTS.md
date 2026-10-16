# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Hướng dẫn cho AI agent làm việc trong repo này. Đọc trước khi sửa bất cứ thứ gì.
> Cập nhật lần cuối: **2026-10-16**.

---

## 1. Dự án là gì

Web game **auto-battler nuôi thú cưng** chạy trong trình duyệt, lấy cảm hứng từ event **Martial Cutie (武林萌主)** của *NARAKA: BLADEPOINT*.

**Bắt buộc về nội dung:** toàn bộ game là **tái hiện luật chơi từ mô tả công khai**, tự viết lại. ❌ **Không** sao chép mã nguồn, hình ảnh, âm thanh, font, văn bản hay tài nguyên của NetEase. Icon hiện tại là **emoji**, tên vật phẩm/thú cưng/phần chữ đều là nội dung gốc tiếng Việt. Nếu sau này thêm art, phải là art tự tạo hoặc có giấy phép rõ ràng.

- Thư mục: `E:\Code\martial-cutie`
- Stack: **React 19 + Vite 8 + TypeScript 6**, quản lý gói bằng **pnpm 11**
- UI: **CSS thuần** trong `src/styles/globals.css` + design token CSS variables. **Chưa** dùng Tailwind, chưa dùng shadcn. Giữ nguyên như vậy trừ khi user yêu cầu đổi.
- **Không có backend, không có database.** Trạng thái lưu ở `localStorage`.

## 2. Lệnh thường dùng

```bash
pnpm dev        # dev server tại http://localhost:5190
pnpm build      # tsc -b && vite build   ← PHẢI pass trước khi kết thúc
pnpm test       # vitest run             ← PHẢI pass trước khi kết thúc
pnpm lint       # oxlint
```

⚠️ **Cổng dev là 5190** (đã set trong `vite.config.ts`), không phải 5173 — project khác trên máy dùng 5173.

## 3. Kiến trúc

```
src/
├─ game/                 # Lõi game THUẦN LOGIC — không import React, không chạm DOM
│  ├─ types.ts           # Toàn bộ kiểu domain (ItemTemplate, Combatant, BattleEvent, RunState…)
│  ├─ rng.ts             # mulberry32 + hashString/makeUid (tất định)
│  ├─ stats.ts           # StatKey, StatMods → StatSheet, nhãn tiếng Việt, powerScore
│  ├─ items.ts           # 24 template × 4★; pick(star, [1★..4★]); CLASS_LABELS
│  ├─ pets.ts            # 3 thú cưng × 5 cấp; petLevelStats(); petUpgradeCost()
│  ├─ stages.ts          # 60 màn / 3 bản đồ; getStage(); stageTier(); makeRivalBlueprint()
│  ├─ build.ts           # buildCombatant() — gộp passive + hào khí liền kề → Combatant
│  ├─ battle.ts          # simulateBattle() — mô phỏng tất định, trả BattleResult{events}
│  ├─ bag.ts             # neighbors(), resolveDrop() (move/merge/swap), sellValue()
│  ├─ economy.ts         # rollShop(), SHOP_SIZE, REROLL_COST, STARTING_CURRENCY
│  └─ labels.ts          # STATUS_TEXT / STATUS_ICON
├─ store/gameStore.ts    # Zustand + persist('martial-cutie-save')
├─ components/           # TopBar, PrepScreen, BagPanel, ShopPanel, PetPanel,
│                        # BattleScreen, ResultDialog, StageMapDialog, VictoryScreen, Toasts, ItemTile
└─ styles/globals.css
```

**Nguyên tắc phân lớp — BẮT BUỘC:**

- ✅ Mọi luật chơi nằm trong `src/game/`. Component React **chỉ hiển thị + gọi action của store**.
- ❌ Không tính toán sát thương / merge / giá cả trong component.
- ✅ Thêm vật phẩm = sửa **`items.ts`** (không cần đụng UI). Thêm màn/thú = sửa `stages.ts`/`pets.ts`.

## 4. Luật chơi đã cài (đừng phá)

| Cơ chế         | Chi tiết                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Nhập sao       | 2 món **cùng template + cùng sao** → `+1★`, tối đa **4★**. Khác nhau thì **hoán đổi vị trí**.    |
| Giá            | `starPrice(cost, star) = cost × star`. Bán lại = **50%** của `paid` (tổng thực trả).             |
| Ô túi          | `6 × rows`, rows tăng theo **cấp thú** (xem `pets.ts`). Ô vượt `bagSize` là **khoá**.           |
| Mua khi túi đầy| Món rơi vào **khay chờ** (`slot = -1`), kéo vào túi sau.                                        |
| Kiếm Thế (SE)  | Hồi `seRegen`/giây, **+4 khi bị đánh**.                                                          |
| Chấn Đao       | Tốn **65 SE** (`COUNTER_COST`), phá đòn → phản kích `referenceAtk × counterPower`, đẩy lùi 350 ms.|
| Trọng kích     | Tốn **24–40 SE** (theo tốc độ vũ khí), sát thương **×2.2**. Bạo kích **×1.8**.                   |
| Liền kề        | `aura.target`: `adjacent` / `adjacentWeapon` / `adjacentNonWeapon` / `all`. Hào khí **chỉ** kích hoạt khi điều kiện đúng. |
| Tiến trình     | Qua màn → `clearedStage = max(clearedStage, stage)`, `stage + 1` (chặn ở 60). Thú mở khoá ở màn **20 / 40**. |
| PvP            | `makeRivalBlueprint(power, stage, seed)` — **không** đổi `stage`/`clearedStage`.                  |

## 5. Quy tắc kỹ thuật — BẮT BUỘC

### 5.1 Tất định (determinism)

`simulateBattle()` **phải** cho kết quả giống hệt với cùng seed. Khi sửa `battle.ts`:

- ❌ Không dùng `Math.random()` — luôn dùng `sim.rng` (đã seed).
- ❌ Không dùng `Date.now()` / `performance.now()` trong `src/game/`.
- ✅ Thứ tự duyệt mảng (`sides`, `weapons`, `statuses`) là một phần của hợp đồng — đổi thứ tự = đổi kết quả trận.
- ✅ Giữ test `'is deterministic for a given seed'` xanh; thêm test mới nếu thêm nhánh ngẫu nhiên.

### 5.2 UI tiếng Việt

Mọi chữ hiển thị cho người dùng **phải là tiếng Việt** (thuật ngữ: Vũ khí, Hộ giáp, Hồn Ngọc, Pháp Bảo, Đan Dược, Kiếm Thế, Chấn Đao, Trọng kích, Thú cưng, Màn, Bản đồ). ❌ Không để lẫn tiếng Anh trong UI (trừ tên riêng như *Stormchant*, *Paw Tally*).

### 5.3 React

- ❌ Không dùng `requestAnimationFrame` cho playback battle — headless/background tab bị throttle → phải dùng `setInterval` (`TICK_MS = 60`).
- ✅ Playback đi theo `elapsedRef` (thời gian mô phỏng) và tra `events[next].t <= elapsed`; **không** giả định index khớp thời gian.
- ✅ `commitBattle()` **chỉ trả thưởng một lần** (`battle.committed`). Giữ guard này.
- ✅ Không `setState` trực tiếp trong render; dùng `useEffect` (xem `BattleScreen`).
- ✅ Store là Zustand; mutation phải qua action, không sửa `run` tại chỗ.

### 5.4 Đặt tên

- ❌ **Không** dùng `word`/`words` cho từ vựng ở các project khác của user — ở repo này không liên quan, nhưng giữ thói quen đặt tên rõ nghĩa: `item`, `template`, `combatant`, `stage`, `pet`.
- ✅ Component: PascalCase + đuôi `Screen`/`Panel`/`Dialog`.
- ✅ File logic: camelCase (`gameStore.ts`), component: PascalCase (`BagPanel.tsx`).

## 6. Kiểm thử

- Framework: **Vitest**. Test lõi ở `src/game/__tests__/`, test UI ở `src/components/__tests__/`.
- File UI cần `// @vitest-environment jsdom` ở dòng đầu (mặc định là `node`).
- UI test dùng `@testing-library/react` + `vi.useFakeTimers()` (playback dùng `setInterval`).
- ✅ Khi thêm vật phẩm/cơ chế mới → **thêm test**. Khi sửa cân bằng → chạy probe (mục 7).
- ✅ Trước khi kết thúc phiên: `pnpm build` + `pnpm test` + `pnpm lint` phải **pass cả ba**.

## 7. Quy trình cân bằng (đã dùng, nên lặp lại)

Đừng chỉnh số theo cảm tính. Cách đã kiểm chứng:

1. Tạo **file probe tạm** `src/game/__tests__/_balance.probe.test.ts` mô phỏng win-rate qua cả 60 màn với build "người chơi điển hình" (cấp thú + số món + sao tăng dần theo màn, nhiều seed).
2. Chạy `pnpm test --reporter=verbose src/game/__tests__/_balance.probe.test.ts` và đọc bảng.
3. Chỉnh `stages.ts` (`maxHp`, `attackDamage`, `enemyStar`, `enemyItems`) rồi chạy lại.
4. Mục tiêu: win-rate **cao ở đầu game, ~50–70% ở màn 23–47, dễ dần về cuối** khi người chơi đã lên 4★. Tránh 0% (bí) và 100% đều đều (nhàm).
5. ⚠️ **XOÁ file probe ngay sau khi xong** (xem mục 8). Bản cân bằng hiện tại: `maxHp ≈ 400 + (index-1)×54`, `attackDamage ≈ 8 + (index-1)×0.95`, boss `×1.35`/`×1.12`, enemy sao `1★ <16, 2★ <31, 3★ <46, 4★ ≥46`, số món `⌊(index+3)/7⌋` (tối đa 6).

## 8. Dọn dẹp — BẮT BUỘC

- ❌ Không để lại script/ảnh/file tạm. Đặt tên có tiền tố `_` (`_balance.probe.test.ts`, `_preview.tsx`) rồi **xoá trong cùng phiên**.
- ✅ Danh sách cảnh báo trong repo này: `*.probe.test.ts`, `_preview.tsx`, `preview.html`, `_shot-*.png`, `*.dump`, `*.bak`.
- ✅ Khi cần chụp ảnh/kiểm tra UI tạm: tạo harness `_preview.tsx` + `preview.html` + `?scene=` rồi xoá sau khi xong (đã từng làm, đã dọn).

## 9. Kiểm tra UI thực tế

- Dev server: `pnpm dev` → `http://localhost:5190`.
- Nếu user share browser page → **navigate sang 5190** rồi tương tác thật (mua đồ → đánh → xem dialog kết quả). Kiểm tra: log battle tăng dần, thanh HP/SE đổi, dialog kết quả hiện đúng thưởng, stage +1 khi thắng.
- Lưu ý: state cũ nằm ở `localStorage` khoá `martial-cutie-save` → khi test cần trạng thái sạch thì bấm **"Chơi lại"** (có `window.confirm`, phải accept dialog trong Playwright).

## 10. Việc còn có thể làm (chưa có)

- Âm thanh/hiệu ứng đánh (hiện chỉ có animation `shake` + floater sát thương).
- Tooltip chi tiết hơn cho vật phẩm (đang dùng `title`).
- Bảng xếp hạng PvP thật / seed đối thủ chia sẻ được giữa người chơi.
- Nhiều bộ thú cưng hơn, cơ chế "bán đồ tự động khi túi đầy".
- Dịch đa ngôn ngữ (hiện hardcode tiếng Việt trong `items.ts`/`pets.ts`/component).
