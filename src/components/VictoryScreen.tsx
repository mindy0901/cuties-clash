import { PETS, getPet, petLevelStats } from '../game/pets'
import { useGameStore } from '../store/gameStore'

/** Shown after clearing stage 60. */
export function VictoryScreen() {
	const run = useGameStore((state) => state.run)
	const newRun = useGameStore((state) => state.newRun)
	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1

	return (
		<div className="overlay">
			<div className="dialog">
				<div className="result-banner">
					<span>🏆</span>
					<h2 className="result-win">Phá đảo 60 màn!</h2>
				</div>
				<p className="hint" style={{ fontSize: 14 }}>
					{pet.name} cấp {level} đã chinh phục Tụ Khốt Châu, Hỏa La Quốc và Stormchant.
				</p>
				<div className="stat-grid">
					<div className="stat">
						<span className="label">Paw Tally còn lại</span>
						<span className="value">{run.currency} 🐾</span>
					</div>
					<div className="stat">
						<span className="label">Đồ trong túi</span>
						<span className="value">{run.items.filter((item) => item.slot >= 0).length} món</span>
					</div>
					<div className="stat">
						<span className="label">Ô túi</span>
						<span className="value">
							{petLevelStats(pet, level).bag.width}×{petLevelStats(pet, level).bag.rows}
						</span>
					</div>
					<div className="stat">
						<span className="label">Thú đã mở khoá</span>
						<span className="value">
							{PETS.filter((entry) => run.unlockedPets.includes(entry.id)).map((entry) => entry.icon).join(' ')}
						</span>
					</div>
				</div>
				<div className="row" style={{ justifyContent: 'flex-end' }}>
					<button type="button" className="btn btn-primary" onClick={newRun}>
						Chơi lại từ đầu
					</button>
				</div>
			</div>
		</div>
	)
}
