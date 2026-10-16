import { useRef } from 'react'
import { ActionBar } from './ActionBar'
import { HeldGhost } from './HeldGhost'
import { InventoryPanel } from './InventoryPanel'
import { PetIcon } from './ItemIcon'
import { PetLoadoutPanel } from './PetLoadoutPanel'
import { PetPanel } from './PetPanel'
import { useHeldItem } from './useHeldItem'
import { estimatePower } from '../game/build'
import { templateFootprint } from '../game/bag'
import { loadoutCellLocked } from '../game/loadout'
import { MAX_PET_LEVEL, getPet } from '../game/pets'
import { FINAL_STAGE, MAPS, getStage } from '../game/stages'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import type { ItemInstance } from '../game/types'
import { cn, panelClass } from './ui'

function StatRow({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'jade' }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-1.5 last:border-b-0">
			<span className="text-[12.5px] text-muted">{label}</span>
			<span className={cn('font-semibold tabular-nums', tone === 'gold' && 'text-gold-soft', tone === 'jade' && 'text-jade')}>
				{value}
			</span>
		</div>
	)
}

/**
 * Phòng chuẩn bị — bố cục theo bản gốc:
 * trái là thú cưng + bảng chỉ số, giữa là sân khấu thú cưng, phải là bảng trang bị;
 * dưới cùng là thanh nút hành động. Kho đồ (sửa được) nằm ở cột giữa dưới sân khấu.
 */
export function PrepScreen() {
	const run = useGameStore((state) => state.run)
	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1
	const combatant = playerCombatantFor(run)
	const power = estimatePower(combatant)
	const stage = getStage(run.stage)
	const map = MAPS[Math.min(MAPS.length - 1, Math.floor((run.stage - 1) / 20))]
	const totalMatches = run.wins + run.losses

	// Kéo-thả đồ giữa kho và trang bị — state phải ở đây vì hai panel là anh em.
	const { held, hold, clear, pointerRef } = useHeldItem(run.equipped, run.inventory)
	const equipAt = useGameStore((state) => state.equipAt)
	const unequipAt = useGameStore((state) => state.unequipAt)
	const dropItem = useGameStore((state) => state.dropItem)
	const dropInKho = useGameStore((state) => state.dropInKho)
	const rotateInKho = useGameStore((state) => state.rotateInKho)
	const pushToast = useGameStore((state) => state.pushToast)
	const openItem = useUiStore((state) => state.openItem)

	const hoverSlotRef = useRef<number | null>(null)
	/** Ô neo đang vẽ gợi ý **trong kho** (kho là lưới nên thả theo ô, không chỉ "cất vào kho"). */
	const khoSlotRef = useRef<number | null>(null)
	/**
	 * Gợi ý của từng lưới đang báo **chặn** (vướng món khác / ô khoá) → thả xuống là không đặt.
	 *
	 * ⚠️ Phải **một cờ cho mỗi lưới**, ❌ không dùng chung: cả hai lưới đều báo lên ở mỗi lần
	 * render, nên cờ chung sẽ bị lưới báo sau ghi đè — lưới kia "chặn" mà cờ lại thành `false`
	 * và thao tác thả vẫn đặt món (đã gặp đúng lỗi này khi thả trong kho).
	 */
	const chanGridRef = useRef(false)
	const chanKhoRef = useRef(false)
	const inventoryRef = useRef<HTMLElement | null>(null)

	/** Con trỏ có đang nằm trong vùng Kho đồ không. */
	const trongKho = () => {
		const box = inventoryRef.current?.getBoundingClientRect()
		if (!box) return false
		const { x, y } = pointerRef.current
		return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
	}

	/**
	 * Món đang được **giữ chuột**, để biết lúc nhả thì đang kéo món nào.
	 *
	 * ⚠️ Cần ref riêng cho trường hợp kéo **từ kho**: `held` trong closure của `onDragEnd` có
	 * thể chưa kịp có giá trị mới, mà `pointerup` lại cần biết ngay.
	 *
	 * ⚠️ Hướng xoay phải **đọc từ `held`** lúc nhả, không lấy giá trị chụp lúc bắt đầu kéo —
	 * người chơi có thể đã bấm `R` giữa chừng và giá trị chụp sẽ cũ.
	 */
	const keoRef = useRef<{ uid: string; from: 'inventory' | 'loadout' } | null>(null)

	/** Bắt đầu kéo một món (dùng chung cho lưới và kho). */
	const batDauKeo = (item: ItemInstance, from: 'inventory' | 'loadout') => {
		keoRef.current = { uid: item.uid, from }
		hold(item, from)
	}

	/**
	 * Nhả chuột.
	 *
	 * `moved = true` (đã kéo đi) → đặt xuống ô đang trỏ, hoặc cất vào kho nếu nhả trên kho.
	 * `moved = false` (chỉ bấm, không di chuyển) → **không** đặt gì: cú `click` ngay sau đó mở
	 * hộp thoại chi tiết, và trạng thái "đang kéo" chưa từng được tạo.
	 */
	const onDragEnd = (moved: boolean) => {
		if (!moved) return
		const dangKeo = keoRef.current
		keoRef.current = null
		if (!dangKeo) return

		// Hướng xoay đọc từ `held` **lúc nhả** — người chơi có thể đã bấm `R` giữa chừng.
		const rotated = held?.rotated ?? false

		// Nhả **trong kho**: kho là lưới tự do nên thả vào ô nào thì món nằm ở ô đó.
		// - Món của trang bị → cất vào kho (đúng ô đang trỏ; không trỏ ô nào thì tự tìm chỗ).
		// - Món vốn ở kho → **di chuyển trong kho** (trước đây bỏ qua nên kéo trong kho vô hiệu).
		if (trongKho()) {
			// Gợi ý trong kho đang báo **chặn** (vướng món khác) → không đặt, món trở về chỗ cũ.
			if (chanKhoRef.current) {
				pushToast('Chỗ đó đã có món — chọn chỗ trống khác', 'bad')
				clear()
				return
			}
			if (dangKeo.from === 'loadout') unequipAt(dangKeo.uid, khoSlotRef.current, rotated)
			else dropInKho(dangKeo.uid, khoSlotRef.current, rotated)
			clear()
			return
		}

		const slot = hoverSlotRef.current
		if (slot === null) {
			// Thả ngoài **mọi** chỗ đặt (không ở kho, không ở ô nào của lưới) → huỷ: món trở về
			// chỗ cũ. Kéo món chỉ là trạng thái giao diện, chưa bao giờ bỏ món khỏi `run`, nên
			//
			// ⚠️ ❌ Không đặt vào ô nhớ sẵn: từ khi lưới xoá ô đang trỏ lúc con trỏ rời đi, `slot`
			// là `null` đúng khi con trỏ **không** ở trên lưới — đặt vào đó là đặt vào ô người chơi
			// không hề trỏ tới. Cũng ❌ không để món "cầm lửng" lại: người chơi đã nhả chuột mà ảnh
			// món vẫn bám con trỏ thì trông như thao tác bị treo.
			clear()
			return
		}

		// Gợi ý đang báo **chặn** → thả xuống là **không đặt**, món trở về chỗ cũ. Đây đúng là điều
		// gợi ý đã hứa bằng viền đỏ; ❌ không được lặng lẽ đặt sang chỗ khác.
		//
		// ⚠️ Món dài (1×4) không lọt lưới trang bị đang mở (cấp thú thấp) cũng rơi vào đây — chủ ý:
		// xoay bằng `R` rồi thả, thay vì để game tự xoay và đặt ở chỗ người chơi không trỏ tới.
		if (chanGridRef.current) {
			pushToast(
				'Chỗ đó không vừa món — bấm R để xoay, hoặc chọn ô khác',
				'bad',
			)
			clear()
			return
		}

		if (dangKeo.from === 'loadout') {
			dropItem(dangKeo.uid, slot, rotated)
			clear()
			return
		}

		// Kho → trang bị. Ô **khoá** thì không đặt được ở đó, và cũng không được lùi về tự tìm chỗ —
		// làm vậy là phá đúng thứ ô khoá sinh ra để ngăn.
		if (loadoutCellLocked(run, slot)) {
			pushToast('Ô đó còn khoá — nâng cấp thú cưng để mở thêm ô', 'bad')
			clear()
			return
		}
		// Gợi ý và chỗ đặt dùng **chung một ô neo** nên tới đây là vừa chỗ; nếu vẫn không vừa thì
		// báo, ❌ không tự tìm chỗ khác (món sẽ rơi lệch khỏi khung người chơi đang thấy).
		if (!equipAt(dangKeo.uid, slot, rotated)) pushToast('Không đặt được món vào ô đó', 'bad')
		clear()
	}

	/**
	 * Ô **neo đang vẽ gợi ý**, do `LoadoutGrid` báo lên.
	 *
	 * ⚠️ Dùng ô này làm chỗ đặt, ❌ không tự tính lại từ ô thô: gợi ý căn giữa con trỏ nên ô
	 * neo khác ô thô — tính lại sẽ làm món rơi lệch khỏi khung người chơi đang thấy.
	 */
	const onAnchorSlotFromGrid = (slot: number | null, blocked: boolean) => {
		hoverSlotRef.current = slot
		chanGridRef.current = blocked
	}

	/**
	 * Ô neo đang vẽ gợi ý **trong kho**. Kho cũng là lưới tự do nên khi thả chuột, món nằm
	 * đúng ô này (không còn "cất vào kho" là xong, vị trí do kho tự xếp).
	 */
	const onAnchorSlotFromKho = (slot: number | null, blocked: boolean) => {
		khoSlotRef.current = slot
		chanKhoRef.current = blocked
	}

	const heldItem = held
		? ([...run.equipped, ...run.inventory].find((item) => item.uid === held.uid) ?? null)
		: null
	/** Dạng rút gọn cho hai panel: chỉ cần biết món nào và hướng đang chọn. */
	const heldInfo = held
		? { uid: held.uid, rotated: held.rotated, templateId: held.templateId }
		: null

	return (
		<div className="flex flex-col gap-3.5">
			{/*
			 * ⚠️ **Ba cột bằng nhau** (`1fr`), và mỗi panel lưới chiếm **một cột**.
			 *
			 * Vì sao: bề rộng ô do bề rộng panel quyết định. Hai panel ở hai cột khác bề rộng thì
			 * ô sẽ khác cỡ, hoặc panel rộng hơn lưới sẽ **thừa một mảng nền** bên phải các ô.
			 * Cho hai panel cùng bề rộng thì lưới lấp đầy panel và ô **tự khớp nhau** — không cần
			 * ép cỡ px nào.
			 *
			 * ⚠️ Cột dùng `minmax(0, 1fr)`, ❌ không cố định px: cố định sẽ tràn ngang ở màn hẹp.
			 */}
			{/*
			 * Ba cột: **chỉ số thú cưng** · **sân khấu + kho** (lưới 8 cột × 50px ≈ 442px) · **trang bị**
			 * (lưới 4 cột × 50px ≈ 226px).
			 *
			 * ⚠️ Cột đặt theo **nội dung** (`minmax(0, …)` với trần tính từ số cột × `CELL_SIZE`),
			 * ❌ không dùng `1fr`: panel rộng hơn lưới sẽ thừa một mảng nền bên phải các ô.
			 */}
			<div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,320px)_minmax(0,545px)_minmax(0,310px)] max-lg:grid-cols-1">
				{/* ── Trái: bảng chỉ số + panel thú cưng ─────────────────────────── */}
				<div className="flex min-w-0 flex-col gap-2.5">
					<section className={cn(panelClass, 'gap-2.5')}>
						<div className="flex items-center gap-3">
							<div className="surface-pet grid size-16 shrink-0 place-items-center rounded-[16px] border border-line p-1.5">
								<PetIcon petId={pet.id} emojiClass="text-4xl" />
							</div>
							<div>
								<div className="flex items-baseline gap-2">
									<span className="text-3xl leading-none font-bold text-gold-soft">{level}</span>
									<span className="font-semibold">{pet.name}</span>
								</div>
								<div className="text-[12px] text-muted">
									{level >= MAX_PET_LEVEL ? 'Đã đạt cấp tối đa' : `Cấp ${level}/${MAX_PET_LEVEL}`}
								</div>
							</div>
						</div>

						<div className="overflow-hidden rounded-[10px] border border-line bg-black/25">
							<StatRow label="Sức mạnh" value={power.toLocaleString('vi-VN')} tone="gold" />
							<StatRow label="Máu tối đa" value={String(Math.round(combatant.maxHp))} />
							<StatRow
								label="Lịch sử đấu"
								value={totalMatches === 0 ? 'chưa đấu' : `${run.wins} thắng, ${run.losses} thua`}
								tone={run.losses === 0 && run.wins > 0 ? 'jade' : undefined}
							/>
							<StatRow label="Tiến trình" value={`${Math.round((run.clearedStage / FINAL_STAGE) * 100)}%`} />
							<StatRow label="Kiếm Thế" value={`${combatant.maxSe} (+${Math.round(combatant.seRegen)}/s)`} />
						</div>
					</section>

					<PetPanel />
				</div>

				{/* ── Giữa: sân khấu thú cưng + kho đồ ───────────────────────────── */}
				<div className="flex flex-col gap-2.5">
					<section className="surface-stage relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-panel border border-line px-4 py-8">
						<div className="surface-pet relative grid size-40 place-items-center rounded-full border-2 border-gold/40 p-6 leading-none shadow-[0_0_48px_rgb(217_162_39/25%)]">
							<PetIcon petId={pet.id} emojiClass="text-[104px]" />
						</div>
						<div className="relative text-center">
							<div className="text-lg font-bold tracking-[0.02em] text-gold-soft">{pet.name}</div>
							<div className="text-[12px] text-muted">
								{map.name} · Màn {stage.index} · {pet.skill.name}
							</div>
						</div>
					</section>

					<InventoryPanel
						onRef={(node) => {
							inventoryRef.current = node
						}}
						held={heldInfo}
						onItemClick={(item) => openItem(item.uid)}
						onDragStart={(item) => batDauKeo(item, 'inventory')}
						onDragEnd={onDragEnd}
						onAnchorSlot={onAnchorSlotFromKho}
						onRotate={rotateInKho}
					/>
				</div>

				{/* ── Phải: trang bị + đối thủ kế tiếp ──────────────────────────── */}
				<div className="flex flex-col gap-2.5">
					<PetLoadoutPanel
						held={heldInfo}
						onItemClick={(item) => openItem(item.uid)}
						onDragStart={(item) => batDauKeo(item, 'loadout')}
						onDragEnd={onDragEnd}
						onAnchorSlot={onAnchorSlotFromGrid}
					/>

					<section className={cn(panelClass, 'gap-2.5')}>
						<div className="flex items-center gap-3">
							<div className="grid size-14 shrink-0 place-items-center rounded-[14px] border border-line bg-ink-700 text-3xl">
								{stage.enemy.icon}
							</div>
							<div className="min-w-0">
								<div className="font-semibold">{stage.enemy.name}</div>
								<div className="text-[12px] text-muted">
									Màn {stage.index} · {stage.enemy.items.length} món · thưởng {stage.reward} 🐾
								</div>
							</div>
						</div>
						<div className="overflow-hidden rounded-[10px] border border-line bg-black/25">
							<StatRow label="Máu đối thủ" value={String(stage.enemy.maxHp)} />
							<StatRow label="Sát thương" value={String(stage.enemy.attackDamage)} />
							<StatRow label="Tỉ lệ Chấn Đao" value={`${Math.round(stage.enemy.counterChance * 100)}%`} />
						</div>
					</section>
				</div>
			</div>

			<ActionBar />

			{/* Ảnh món bám theo con trỏ trong lúc đang nhấc. */}
			{held && heldItem ? (
				<HeldGhost
					templateId={held.templateId}
					star={held.star}
					rotated={held.rotated}
					w={templateFootprint(heldItem.templateId, false).w}
					h={templateFootprint(heldItem.templateId, false).h}
					x={held.x}
					y={held.y}
				/>
			) : null}
		</div>
	)
}
