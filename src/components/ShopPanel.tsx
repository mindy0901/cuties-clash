import { REROLL_COST } from '../game/economy'
import { CLASS_LABELS, getTemplate, starLabel } from '../game/items'
import { useGameStore } from '../store/gameStore'

/** Shop of the current stage: buy gear with Paw Tally, reroll the offer list. */
export function ShopPanel() {
	const run = useGameStore((state) => state.run)
	const buyOffer = useGameStore((state) => state.buyOffer)
	const reroll = useGameStore((state) => state.reroll)

	return (
		<section className="panel">
			<div className="panel-head">
				<h2 className="panel-title">Cửa hàng</h2>
				<div className="row">
					<span className="tag nowrap">Lần đổi: {run.rerolls}</span>
					<button
						type="button"
						className="btn btn-sm"
						disabled={run.currency < REROLL_COST}
						onClick={reroll}
						title={`Đổi danh sách đồ với ${REROLL_COST} Paw Tally`}
					>
						Đổi shop · {REROLL_COST}
					</button>
				</div>
			</div>

			<div className="shop-list">
				{run.shop.map((offer, index) => {
					const template = getTemplate(offer.templateId)
					const affordable = run.currency >= offer.cost
					return (
						<article key={`${offer.templateId}-${index}`} className={`offer${offer.sold ? ' sold' : ''}`}>
							<div className="offer-icon">{template.icon}</div>
							<div>
								<div className="offer-name">
									{template.name}
									<span className="tag tag-gold">{starLabel(offer.star)}</span>
									<span className="tag">{CLASS_LABELS[template.cls]}</span>
								</div>
								<div className="offer-desc">{template.desc(offer.star)}</div>
							</div>
							<button
								type="button"
								className="btn btn-sm btn-gold"
								disabled={offer.sold || !affordable}
								onClick={() => buyOffer(index)}
								title={offer.sold ? 'Đã mua' : affordable ? 'Mua món này' : 'Không đủ Paw Tally'}
							>
								{offer.sold ? 'Đã mua' : `${offer.cost} 🐾`}
							</button>
						</article>
					)
				})}
			</div>
			<p className="hint">Mua 2 món giống nhau rồi nhập lại để tiết kiệm — bản 4★ mạnh hơn hẳn bản 1★.</p>
		</section>
	)
}
