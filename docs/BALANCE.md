# Cân bằng 60 màn

> Đừng chỉnh số theo cảm tính. Quy trình dưới đây đã dùng và cho kết quả lặp lại được.

## 1. Mục tiêu

| Giai đoạn | Win-rate mong muốn |
| --- | --- |
| Đầu game | Cao — người chơi phải thấy mình mạnh lên |
| Màn **23–47** | **~50–70%** — vùng căng thẳng chính |
| Cuối game (đã lên 4★) | Dễ dần — phần thưởng cho việc build đúng |

❌ Tránh cả hai cực: **0%** (bí, người chơi bỏ) và **100% đều đều** (nhàm, không còn lý do tối ưu
trang bị).

## 2. Quy trình

1. Tạo **file probe tạm** `frontend/src/game/__tests__/_balance.probe.test.ts`, mô phỏng win-rate
   qua **cả 60 màn** với build "người chơi điển hình": cấp thú + số món + bậc sao **tăng dần theo
   màn**, chạy nhiều seed.
2. Chạy và đọc bảng:

   ```bash
   pnpm test --reporter=verbose src/game/__tests__/_balance.probe.test.ts
   ```

3. Chỉnh `game/stages.ts` (`maxHp`, `attackDamage`, `enemyStar`, `enemyItems`) rồi chạy lại.
4. Lặp tới khi khớp mục tiêu ở §1.
5. ⚠️ **XOÁ file probe ngay khi xong** (`AGENTS.md` §7). File tên `_*.probe.test.ts` nằm trong danh
   sách cảnh báo của repo.

## 3. Tham số đang dùng

```
maxHp        ≈ 400 + (index - 1) × 54      boss ×1.35
attackDamage ≈   8 + (index - 1) × 0.95    boss ×1.12
enemy sao     1★ khi index < 16 · 2★ < 31 · 3★ < 46 · 4★ từ 46
enemyItems    ⌊(index + 3) / 7⌋            tối đa 6
```

Chi tiết blueprint đối thủ ở `game/stages.ts` (`getStage`, `makeRivalBlueprint`).

## 4. Đo hiệu năng mô phỏng (khi cần biết có nghẽn không)

Số đo tham chiếu trên máy dev, quét 60 màn × 120 seed (build "người chơi điển hình"):

| Chỉ số | Giá trị |
| --- | --- |
| `simulateBattle` trung bình | **0.138 ms/trận** (~7 200 trận/giây) |
| Dựng combatant | 0.001 ms/cặp |
| Event/trận | trung bình 47 · cao nhất 93 |
| Thời lượng trình diễn | 93 event × 60 ms ≈ 5,6 s |

⇒ **Mô phỏng không phải nút thắt.** Một trận tốn dưới 1% ngân sách khung hình 60 FPS, và chỉ chạy
một lần mỗi lượt bấm. Đo render trong trình duyệt (playback ×8): p50 **3,6 ms**, p99 3,7 ms, **0
long task**.

⚠️ Hệ quả: **đừng** viết lại `simulateBattle` bằng WASM/Rust hay "tối ưu" nó. Đổi ngôn ngữ chỉ tiết
kiệm được phần nhỏ hơn cả sai số đo, nhưng phá hợp đồng tất định và làm build phức tạp hơn hẳn.
Nếu cần tối ưu, chỗ đáng nhìn là **số lần re-render của React** khi playback.

Cách đo lại: probe tạm `_bench.probe.test.ts` dùng `performance.now()` quanh vòng lặp
`simulateBattle`, rồi xoá ngay sau khi xong.
