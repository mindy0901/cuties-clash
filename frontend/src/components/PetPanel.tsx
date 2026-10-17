import { MAX_PET_LEVEL, PETS, getPet, petLevelStats, petUpgradeCost } from '../game/pets'
import { STAT_LABELS, formatStat } from '../game/stats'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import type { StatKey } from '../game/types'
import { PetIcon } from './ItemIcon'
import { btnBlockClass, btnClass, btnPrimaryClass, cn, panelClass, panelHeadClass, panelTitleClass, statClass, statGridClass, tagClass } from './ui'

const SHOWN_STATS: StatKey[] = ['atk', 'atkPct', 'critRate', 'haste', 'lifesteal', 'dr', 'counterChance']

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className={statClass}>
			<span className="text-muted">{label}</span>
			<span className="font-semibold">{value}</span>
		</div>
	)
}

/** Pet panel: pick a pet, upgrade it, and inspect the derived stats. */
export function PetPanel() {
	const run = useGameStore((state) => state.run)
	const selectPet = useGameStore((state) => state.selectPet)
	const upgradePet = useGameStore((state) => state.upgradePet)
	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1
	const levelStats = petLevelStats(pet, level)
	const combatant = playerCombatantFor(run)
	const upgradeCost = petUpgradeCost(level)

	return (
		<section className={panelClass}>
			<div className={panelHeadClass}>
				<h2 className={panelTitleClass}>Thú cưng</h2>
				<span className={cn(tagClass, 'whitespace-nowrap')}>
					Cấp {level}/{MAX_PET_LEVEL}
				</span>
			</div>

			<div className="flex items-center gap-2.5">
				<div className="surface-pet grid size-[52px] place-items-center rounded-[14px] border border-line p-1">
					<PetIcon petId={pet.id} emojiClass="text-[30px]" />
				</div>
				<div>
					<div className="font-semibold">
						{pet.name} · {pet.skill.name}
					</div>
					<div className="text-xs text-muted">{pet.blurb}</div>
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				{PETS.map((entry) => {
					const unlocked = run.unlockedPets.includes(entry.id)
					return (
						<button
							type="button"
							key={entry.id}
							className={cn(
								'flex items-center gap-2 rounded-[10px] border border-line bg-ink-700 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40',
								entry.id === run.petId && 'border-gold bg-gold/14',
							)}
							disabled={!unlocked}
							onClick={() => selectPet(entry.id)}
							title={unlocked ? entry.blurb : `Mở khoá khi qua màn ${entry.unlockStage}`}
						>
							<span className="grid size-6 shrink-0 place-items-center">
								<PetIcon petId={entry.id} emojiClass="text-xl" />
							</span>
							<span>{entry.name}</span>
							{!unlocked ? <span className={tagClass}>Màn {entry.unlockStage}</span> : null}
						</button>
					)
				})}
			</div>

			<div className={statGridClass}>
				<Stat label="Máu tối đa" value={String(Math.round(combatant.maxHp))} />
				<Stat label="Giáp khởi đầu" value={String(Math.round(combatant.shield))} />
				<Stat label="Kiếm Thế" value={`${combatant.maxSe} (+${Math.round(combatant.seRegen)}/s)`} />
				<Stat label="Ô túi" value={`${levelStats.bag.width}×${levelStats.bag.rows}`} />
				{SHOWN_STATS.map((key) => {
					const value = combatant.stats[key]
					if (!value) return null
					return <Stat key={key} label={STAT_LABELS[key]} value={formatStat(key, value)} />
				})}
			</div>

			<button
				type="button"
				className={cn(btnClass, btnBlockClass, btnPrimaryClass)}
				disabled={level >= MAX_PET_LEVEL}
				onClick={upgradePet}
			>
				{level >= MAX_PET_LEVEL ? 'Đã đạt cấp tối đa' : `Nâng cấp · ${upgradeCost} 🐾`}
			</button>
			<p className="m-0 text-[13px] text-muted">
				Mỗi cấp tăng 12% máu, sát thương kỹ năng và hồi Kiếm Thế. Nâng cấp lúc nào cũng được, không mất lượt.
			</p>
		</section>
	)
}
