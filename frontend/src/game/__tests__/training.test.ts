import { describe, expect, it } from 'vitest'
import { buildEnemyCombatant, buildPlayerCombatant } from '../build'
import { simulateBattle } from '../battle'
import { createItemInstance } from '../bag'
import { makeTrainingBlueprint, TRAINING_HORIZON_MS, TRAINING_WEAPON } from '../training'
import { beforeEach } from 'vitest'
import { installRetiredItems } from '../../test/retiredItems'

/** The dummy as the store builds it: immortal, and swinging only when the toggle says so. */
function dummy(attacks: boolean) {
	return buildEnemyCombatant(makeTrainingBlueprint(), { immortal: true, noSwings: !attacks })
}

const player = () => buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 3, 'blade', 0)])

describe('training room', () => {
	beforeEach(() => installRetiredItems())

	it('gives the dummy exactly one weapon and the weak swing its item multiplies', () => {
		const blueprint = makeTrainingBlueprint()
		expect(blueprint.items).toHaveLength(1)
		expect(blueprint.items[0]?.templateId).toBe(TRAINING_WEAPON)
		// An item has no damage of its own: the dummy owns a slow, weak swing that its weapon scales.
		expect(blueprint.attackDamage).toBeGreaterThan(0)
		expect(blueprint.attackInterval).toBeGreaterThan(0)
	})

	it('holds its weapon but never swings when the toggle is off', () => {
		const passive = dummy(false)
		expect(passive.immortal).toBe(true)
		expect(passive.weapons, 'no weapon timer at all').toHaveLength(0)

		const active = dummy(true)
		// The dummy's own swing plus the one weapon it holds.
		const swung = active.weapons.filter((weapon) => weapon.templateId === TRAINING_WEAPON)
		expect(swung).toHaveLength(1)
	})

	it('never loses health, so the bar stays full for the whole session', () => {
		const target = dummy(false)
		const result = simulateBattle(player(), target, 5, {
			maxTime: TRAINING_HORIZON_MS,
			noDeathZone: true,
		})

		expect(result.timedOut).toBe(true)
		expect(result.winner).toBe('draw')
		expect(result.duration).toBe(TRAINING_HORIZON_MS)
		// Every hit still reports its own number…
		const hits = result.events.filter(
			(event) => (event.kind === 'attack' || event.kind === 'charged') && event.side === 'player',
		)
		expect(hits.length).toBeGreaterThan(5)
		expect(hits.every((event) => (event.amount ?? 0) > 0)).toBe(true)
		// …but the dummy's bar never moves, and the death zone cannot end the session.
		expect(hits.every((event) => event.enemy.hp === target.maxHp)).toBe(true)
		expect(result.events.some((event) => event.text.includes('Vùng tử địa'))).toBe(false)
		// The log itself ran out — a practice room has no "session over".
		expect(result.events.at(-1)?.text).toBe('Hết bản ghi mô phỏng')
	})

	it('never lets the clock kill the player, so practice has no time limit', () => {
		const passive = dummy(false)
		// No `noDeathZone` would hand the dummy the win at three minutes — the player is standing still
		// in front of a fighter that never swings, so only the death zone could end this.
		const withZone = simulateBattle(player(), passive, 5, { maxTime: TRAINING_HORIZON_MS })
		expect(withZone.winner).toBe('enemy')

		const withoutZone = simulateBattle(player(), passive, 5, {
			maxTime: TRAINING_HORIZON_MS,
			noDeathZone: true,
		})
		expect(withoutZone.winner).toBe('draw')
		expect(withoutZone.duration).toBe(TRAINING_HORIZON_MS)
		// Twenty simulated minutes of swings, and the log is far longer than one old session.
		expect(withoutZone.events.length).toBeGreaterThan(1000)
	})

	it('still lets a lethal dummy kill a mortal player (the simulation rule, not what practice builds)', () => {
		installRetiredItems()
		const fighting = buildEnemyCombatant(
			{ ...makeTrainingBlueprint(), items: [{ templateId: 'great-axe', star: 4, slot: 0 }] },
			{ immortal: true },
		)
		const fragile = buildPlayerCombatant('fire-pup', 1, [])
		const result = simulateBattle(fragile, fighting, 3, {
			maxTime: TRAINING_HORIZON_MS,
			noDeathZone: true,
		})

		expect(result.winner).toBe('enemy')
		expect(result.timedOut).toBeUndefined()
		expect(result.duration).toBeLessThan(TRAINING_HORIZON_MS)
	})

	it('keeps a normal fight on the death-zone rules', () => {
		const a = buildPlayerCombatant('fire-pup', 1, [])
		const b = buildEnemyCombatant(makeTrainingBlueprint())
		// No options → the old behaviour: the enemy dies normally.
		const result = simulateBattle(a, b, 9)
		expect(result.timedOut).toBeUndefined()
		expect(result.events.at(-1)?.kind).toBe('end')
	})
})
