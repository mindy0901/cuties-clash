# Luật chơi đã cài

> Đừng phá các luật dưới đây khi sửa code. Muốn đổi luật thì đổi **có chủ ý**, kèm test.
> Mã nguồn: `frontend/src/game/` (thuần logic, không React).

## 1. Trang bị

| Cơ chế | Chi tiết |
| --- | --- |
| Nhập sao | 2 món **cùng template + cùng sao** → `+1★`, tối đa **4★**. Khác nhau thì **hoán đổi vị trí** |
| Giá | `starPrice(cost, star) = cost × star`. Bán lại = **50%** của `paid` (tổng thực trả) |
| Kho đồ | **Trang bị** (đang mang) là lưới **4 cột**, số hàng theo cấp thú: 3→5 (12–20 ô). **Kho đồ** (dự trữ) **không giới hạn**, không phải lưới |
| Món ở đâu | Mua ở cửa hàng → **tự mang lên trang bị nếu còn chỗ**, hết chỗ thì vào kho. ❌ **Chỉ đồ trong `run.equipped` mới tham chiến** (passive, hào khí, vũ khí); đồ trong `run.inventory` không có hiệu lực |
| Chuyển đồ | **Kéo-thả** giữa hai bảng, hoặc **bấm** món rồi **bấm** ô. `R` / chuột phải để xoay khi đang cầm, `Esc` để bỏ. Vẫn giữ nút ↑ / ↓ / "Tháo hết" |
| Hình dạng | Mỗi template có `space: {w,h}`; món chiếm một **hình chữ nhật ô** (kiếm 1×3, đại đao 2×3, thân đao 1×4, ngọc/đan 1×1) |
| Xoay | `R`, chuột phải, hoặc nút ⟳ → xoay 90°, hoán đổi `w`/`h`. ❌ Chỉ đổi khi hướng mới **vừa chỗ** |
| Va chạm | `fitsIn(slot, size, …)` là **vị từ lõi** cho mọi thao tác. Biên lưới kiểm theo **ô neo**, không theo danh sách ô suy ra (món có thể tràn dòng) |
| Ô neo | Ô con trỏ có thể không phải ô neo hợp lệ (ô 5 cho món 4×1 trong lưới 4 cột). **Luôn đi qua `anchorFor()`** trước khi vẽ gợi ý **và** trước khi đặt — dùng chung một hàm để hai bên không lệch. ❌ Không gọi thẳng `cellsOf(hoverSlot, …)` |
| Mua khi hết chỗ | Trang bị không còn vùng vừa → món vào **kho** (`slot = -1`), bấm để mang lên sau |

## 2. Chiến đấu

| Cơ chế | Chi tiết |
| --- | --- |
| Kiếm Thế (SE) | Hồi `seRegen`/giây, **+4 mỗi lần bị đánh** |
| Chấn Đao | Tốn **65 SE** (`COUNTER_COST`), phá đòn → phản kích `referenceAtk × counterPower`, đẩy lùi thanh đòn đối thủ **350 ms** |
| Trọng kích | Tốn **24–40 SE** (theo tốc độ vũ khí), sát thương **×2.2**. Bạo kích **×1.8** |
| Trạng thái | Chậm · Đóng Băng · Độc · Cháy · Hồi phục · Cuồng phong · Giòn |
| Liền kề | Hào khí tính từ **mọi ô** của món (`adjacentUids`), không chỉ ô neo. `aura.target`: `adjacent` / `adjacentWeapon` / `adjacentNonWeapon` / `all` |

## 3. Tiến trình

| Cơ chế | Chi tiết |
| --- | --- |
| Qua màn | `clearedStage = max(clearedStage, stage)`, rồi `stage + 1` (chặn ở **60**) |
| Mở khoá thú | Thú thứ hai ở **màn 20**, thứ ba ở **màn 40** (`unlockStage`) |
| PvP | `makeRivalBlueprint(power, stage, seed)` — **không** đổi `stage`/`clearedStage` |
| Bản đồ | 60 màn chia 3 bản đồ (`MAPS`), 20 màn mỗi bản đồ |

## 4. Tiếng Việt trong UI

Mọi chữ hiện cho người chơi — **kể cả thông báo lỗi API** — phải là tiếng Việt. ❌ Không lẫn tiếng
Anh (trừ tên riêng như *Stormchant*, *Paw Tally*).

Thuật ngữ cố định (dùng đúng chữ này): Vũ khí · Hộ giáp · Hồn Ngọc · Pháp Bảo · Đan Dược · Kiếm
Thế · Chấn Đao · Trọng kích · Thú cưng · Màn · Bản đồ · Trang bị · Kho đồ · Sức mạnh · Paw Tally.

## 5. Ánh xạ luật → mã nguồn

| Luật | File |
| --- | --- |
| Nhập sao, giá, bán lại, va chạm lưới | `game/bag.ts` |
| Tách trang bị ↔ kho, tự xếp chỗ | `game/loadout.ts` |
| Template vật phẩm, bậc sao | `game/items.ts` |
| Thú cưng, cấp, số hàng lưới | `game/pets.ts` |
| Màn, bản đồ, blueprint PvP | `game/stages.ts` |
| Gộp passive + hào khí → chỉ số | `game/build.ts` |
| Mô phỏng trận (tất định) | `game/battle.ts` |
| Roll cửa hàng, reroll, tiền | `game/economy.ts` |
| Chỉ số, nhãn tiếng Việt | `game/stats.ts` |
| Hiệu ứng trạng thái (nhãn/icon) | `game/labels.ts` |
| Chuẩn hoá bản lưu hỏng | `game/sanitize.ts` |
| Nâng bản lưu v1 → v2 | `game/migrate.ts` |
| PRNG tất định dùng chung | `game/rng.ts` |

Muốn **thêm** vật phẩm / thú / màn / cơ chế mới: xem `AGENTS.md` §5.
