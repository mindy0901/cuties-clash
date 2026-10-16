import { playerCombatantFor } from '../store/gameStore'
import { useGameStore } from '../store/gameStore'
import { MAX_PET_LEVEL, PETS, getPet, petLevelStats, petUpgradeCost } from '../game/pets'
import { STAT_LABELS, formatStat } from '../game/stats'
import type { StatKey } from '../game/types'

const SHOWN_STATS: StatKey[] = ['atk', 'atkPct', 'critRate', 'haste', 'lifesteal', 'dr', 'counterChance']

/** Pet panel: pick a cutie, upgrade it, inspect derived combat stats. */
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
		<section className="panel">
			<div className="panel-head">
				<h2 className="panel-title">Thú cưng</h2>
				<span className="tag nowrap">
					Cấp {level}/{MAX_PET_LEVEL}
				</span>
			</div>

			<div className="pet-row">
				<div className="pet-avatar">{pet.icon}</div>
				<div>
					<div className="duelist-name">
						{pet.name} · {pet.skill.name}
					</div>
					<div className="duelist-sub">{pet.blurb}</div>
				</div>
			</div>

			<div className="pet-picker">
				{PETS.map((entry) => {
					const unlocked = run.unlockedPets.includes(entry.id)
					return (
						<button
							type="button"
							key={entry.id}
							className={`pet-option${entry.id === run.petId ? ' active' : ''}`}
							disabled={!unlocked}
							onClick={() => selectPet(entry.id)}
							title={unlocked ? entry.blurb : `Mở khoá khi qua màn ${entry.unlockStage}`}
						>
							<span style={{ fontSize: 20 }}>{entry.icon}</span>
							<span>{entry.name}</span>
							{!unlocked ? <span className="tag">Màn {entry.unlockStage}</span> : null}
						</button>
					)
				})}
			</div>

			<div className="stat-grid">
				<div className="stat">
					<span className="label">Máu tối đa</span>
					<span className="value">{Math.round(combatant.maxHp)}</span>
				</div>
				<div className="stat">
					<span className="label">Giáp khởi đầu</span>
					<span className="value">{Math.round(combatant.shield)}</span>
				</div>
				<div className="stat">
					<span className="label">Kiếm Thế</span>
					<span className="value">
						{combatant.maxSe} (+{Math.round(combatant.seRegen)}/s)
					</span>
				</div>
				<div className="stat">
					<span className="label">Ô túi</span>
					<span className="value">
						{levelStats.bag.width}×{levelStats.bag.rows}
					</span>
				</div>
				{SHOWN_STATS.map((key) => {
					const value = combatant.stats[key]
					if (!value) return null
					return (
						<div className="stat" key={key}>
							<span className="label">{STAT_LABELS[key]}</span>
							<span className="value">{formatStat(key, value)}</span>
						</div>
					)
				})}
			</div>

			<button
				type="button"
				className="btn btn-block btn-primary"
				disabled={level >= MAX_PET_LEVEL}
				onClick={upgradePet}
			>
				{level >= MAX_PET_LEVEL ? 'Đã đạt cấp tối đa' : `Nâng cấp · ${upgradeCost} 🐾`}
			</button>
			<p className="hint">
				Mỗi cấp tăng 12% máu, sát thương kỹ năng và hồi Kiếm Thế. Nâng cấp lúc nào cũng được, không mất lượt.
			</p>
		</section>
	)
}
