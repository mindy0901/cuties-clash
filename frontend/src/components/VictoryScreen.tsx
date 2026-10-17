import type { ReactNode } from 'react'
import { PETS, getPet, petLevelStats } from '../game/pets'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { PetIcon } from './ItemIcon'
import { btnClass, btnPrimaryClass, cn, dialogClass, overlayClass, statClass, statGridClass } from './ui'

function Stat({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className={statClass}>
			<span className="text-muted">{label}</span>
			<span className="font-semibold">{value}</span>
		</div>
	)
}

/** Screen shown after clearing stage 60. */
export function VictoryScreen() {
	const run = useGameStore((state) => state.run)
	// Restarting wipes the finished run too, so it asks first (dialog lives in the root layout).
	const openRestart = useUiStore((state) => state.openRestart)
	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1
	const levelStats = petLevelStats(pet, level)

	return (
		<div className={overlayClass}>
			<div className={dialogClass} role="dialog" aria-label="Phá đảo">
				<div className="flex items-center gap-3 text-[26px]">
					<span>🏆</span>
					<h2 className="text-[22px] text-gold-soft">Phá đảo 60 màn!</h2>
				</div>
				<p className="m-0 text-sm text-muted">
					{pet.name} cấp {level} đã chinh phục Tụ Khốt Châu, Hỏa La Quốc và Stormchant.
				</p>
				<div className={statGridClass}>
					<Stat label="Paw Tally còn lại" value={`${run.currency} 🐾`} />
					<Stat label="Đồ đang mang" value={`${run.equipped.filter((item) => item.slot >= 0).length} món`} />
					<Stat label="Kho dự trữ" value={`${run.inventory.length} món`} />
					<Stat label="Ô trang bị" value={`${levelStats.bag.width}×${levelStats.bag.rows}`} />
					<Stat
						label="Thú đã mở khoá"
						value={
							<span className="inline-flex items-center gap-1">
								{PETS.filter((entry) => run.unlockedPets.includes(entry.id)).map((entry) => (
									<span className="grid size-5 place-items-center" key={entry.id} title={entry.name}>
										<PetIcon petId={entry.id} emojiClass="text-base" />
									</span>
								))}
							</span>
						}
					/>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2.5">
					<button type="button" className={cn(btnClass, btnPrimaryClass)} onClick={openRestart}>
						Chơi lại từ đầu
					</button>
				</div>
			</div>
		</div>
	)
}
