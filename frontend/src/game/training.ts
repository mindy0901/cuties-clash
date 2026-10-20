import { isWeaponClass, itemCatalogue, itemTemplateById } from './items'
import type { EnemyBlueprint } from './types'

/**
 * **Training room** (phòng tập) — a dummy that cannot die.
 *
 * Why it exists: a normal fight ends, so you never get to see what one build does over a long
 * stretch. The dummy keeps its health bar whatever lands on it, so the damage numbers themselves are
 * the reading — equip something, hit it, watch the numbers.
 *
 * The dummy carries **exactly one weapon** (`TRAINING_WEAPON`), and the "fight back" toggle decides
 * whether that weapon ever swings (`noSwings` on the combatant, see `buildEnemyCombatant`). It has no
 * innate attack: `attackInterval: 0` drops it out of the weapon list entirely.
 */
export const TRAINING_WEAPON = 'wooden-blade'

/**
 * How much simulated time one training session pre-computes.
 *
 * ⚠️ **This is not a time limit** — a practice session has none: the replay runs the whole horizon and
 * then simply holds the last frame, with no outcome screen (`BattleScreen` never commits a timed-out
 * training run). The horizon only bounds the event log the deterministic simulation can hold in memory
 * (≈ 200 events per simulated minute). The death zone is off for the same reason (`noDeathZone`),
 * otherwise the clock would kill the player at three minutes.
 */
export const TRAINING_HORIZON_MS = 20 * 60_000

/** Where the dummy's single weapon sits on its 4-column board. */
const TRAINING_SLOT = 0

/**
 * The weapon the dummy holds **right now**.
 *
 * Normally the plain blade, but `wooden-blade` can be deleted from the admin page — and a deleted
 * template is skipped by `buildCombatant`, which would leave a "fight back" dummy with nothing to
 * swing. So it falls back to the first weapon still in the catalogue.
 */
export function trainingWeaponId(): string | null {
	if (itemTemplateById(TRAINING_WEAPON)) return TRAINING_WEAPON
	// No hardcoded item list any more: use whatever weapon the catalogue still has, and none if the
	// admin has not created one yet — the dummy then simply cannot hit back.
	return itemCatalogue().find((template) => isWeaponClass(template.cls))?.id ?? null
}

/** The dummy's blueprint. Its `maxHp` only scales the bar — `immortal` keeps it full. */
export function makeTrainingBlueprint(): EnemyBlueprint {
	const weapon = trainingWeaponId()
	return {
		name: 'Bù Nhìn Tập Luyện',
		icon: '🎯',
		maxHp: 5000,
		maxSe: 0,
		seRegen: 0,
		// ⚠️ An item has no damage or speed of its own any more: its kit multiplies the **owner's**
		// numbers, so the dummy has to own a swing even though it is only a target. A slow, weak one
		// keeps a practice fight readable.
		attackInterval: 1500,
		attackDamage: 12,
		// No weapon in the catalogue yet → the dummy stands there with nothing to swing.
		items: weapon ? [{ templateId: weapon, star: 1, slot: TRAINING_SLOT }] : [],
	}
}
