import { useNavigate } from '@tanstack/react-router'
import { estimatePower } from '../game/build'
import { REROLL_COST, SHOP_SIZE } from '../game/economy'
import { CLASS_LABELS, QUALITY_LABELS, getTemplate, starLabel } from '../game/items'
import { MAX_PET_LEVEL, getPet } from '../game/pets'
import { getStage } from '../game/stages'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import { ItemIcon } from './ItemIcon'
import { btnClass, btnGoldClass, btnSmClass, cn, itemTileClass, panelClass, panelHeadClass, panelTitleClass } from './ui'

/**
 * The dedicated shop page (`/shop`).
 *
 * Layout follows the original: title plus the Paw Tally count, the list of purchasable items, and
 * a button back to the preparation room. After buying you stay here to keep shopping.
 */
export function ShopScreen() {
	const run = useGameStore((state) => state.run)
	const buyOffer = useGameStore((state) => state.buyOffer)
	const reroll = useGameStore((state) => state.reroll)
	const navigate = useNavigate()

	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1
	const combatant = playerCombatantFor(run)
	const power = estimatePower(combatant)
	const stage = getStage(run.stage)
	const remaining = run.shop.filter((offer) => !offer.sold).length
	const inventoryCount = run.inventory.length

	return (
		<div className="flex flex-col gap-3.5">
			<section className={panelClass}>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-xl">Cửa hàng vật phẩm</h1>
						<p className="m-0 text-[13px] text-muted">
							{pet.name} cấp {level}/{MAX_PET_LEVEL} · Sức mạnh {power.toLocaleString('vi-VN')} · Màn{' '}
							{stage.index}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2.5">
						<span className="rounded-full border border-gold/45 bg-ink-700 px-4 py-1.5 font-bold text-gold-soft tabular-nums">
							{run.currency} 🐾
						</span>
						<button type="button" className={cn(btnClass, btnSmClass)} onClick={() => void navigate({ to: '/' })}>
							« Quay về
						</button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2.5">
					<button
						type="button"
						className={cn(btnClass, btnSmClass)}
						disabled={run.currency < REROLL_COST}
						onClick={reroll}
						title={`Đổi danh sách đồ với ${REROLL_COST} Paw Tally`}
					>
						🎲 Đổi danh sách · {REROLL_COST} 🐾
					</button>
					<span className="text-[12.5px] text-muted">
						Lần đổi: {run.rerolls} · còn {remaining}/{SHOP_SIZE} món
						{inventoryCount > 0 ? ` · ${inventoryCount} món trong kho` : ''}
					</span>
				</div>
			</section>

			<div className="grid gap-2.5 lg:grid-cols-2">
				{run.shop.map((offer, index) => {
					const template = getTemplate(offer.templateId)
					const affordable = run.currency >= offer.cost
					const size = template.space
					return (
						<article
							key={`${offer.templateId}-${index}`}
							className={cn(
								panelClass,
								'gap-2.5 p-3',
								offer.sold && 'opacity-40 grayscale-[0.7]',
							)}
						>
							<div className="flex items-start gap-3">
								<div
									className={cn(
										'surface-item grid size-14 shrink-0 place-items-center rounded-[10px] border p-1',
										itemTileClass(template.cls, template.quality, offer.star),
									)}
								>
									<ItemIcon templateId={offer.templateId} star={offer.star} emojiClass="text-3xl" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1.5 font-semibold">
										{template.name}
										<span className="rounded-md border border-gold/45 px-1.5 py-px text-[11px] text-gold-soft">
											{starLabel(offer.star)}
										</span>
										<span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">
											{CLASS_LABELS[template.cls]}
										</span>
										<span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">
											Phẩm {QUALITY_LABELS[template.quality]}
										</span>
										<span className="rounded-md border border-line px-1.5 py-px text-[11px] text-muted">
											{size.w}×{size.h} ô
										</span>
									</div>
									<p className="m-0 mt-1 text-[12.5px] text-muted">{template.desc(offer.star)}</p>
								</div>
							</div>

							<button
								type="button"
								className={cn(btnClass, 'justify-center', btnGoldClass)}
								disabled={offer.sold || !affordable}
								onClick={() => buyOffer(index)}
								title={offer.sold ? 'Đã mua' : affordable ? 'Mua món này' : 'Không đủ Paw Tally'}
							>
								{offer.sold ? 'Đã mua' : `Mua · ${offer.cost} 🐾`}
							</button>
						</article>
					)
				})}
			</div>

			<section className={cn(panelClass, 'gap-2')}>
				<div className={panelHeadClass}>
					<h2 className={panelTitleClass}>Mẹo mua sắm</h2>
				</div>
				<p className="m-0 text-[13px] text-muted">
					Mua 2 món <strong>giống hệt nhau</strong> rồi thả chồng lên nhau trong kho để nhập thành +1★ — bản 5★
					mạnh hơn hẳn bản 1★. Nền ô cho biết <strong>phẩm</strong> của món: Bạc, Xanh lá, Lam, Tím rồi Vàng cam.
					Món dài (kiếm 1×3, thân đao 1×4) nên xoay ngang khi kho chật. Kho chỉ có 4 cột nên hãy cân nhắc trước khi
					mua món to như đại đao 2×3.
				</p>
			</section>
		</div>
	)
}
