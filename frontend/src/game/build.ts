import { getTemplate, swingMs } from './items'
import { adjacentUids, cellsOf, occupancy, templateFootprint } from './bag'
import { GRID_WIDTH, MAX_BAG_ROWS, getPet, petLevelStats } from './pets'
import { addMods, emptyStats, powerScore } from './stats'
import type { ActiveEffect, ActiveStatus, ItemInstance, StatMods, StatSheet, Star } from './types'

export interface CombatItem {
	uid: string
	templateId: string
	name: string
	icon: string
	star: Star
	slot: number
	cls: string
	damage: number
	/** Milliseconds between triggers (weapon swings or active pulses). */
	interval: number
	effects: ActiveEffect[]
	onHit?: { chance: number; effects: ActiveEffect[] }
	linked: boolean
}

export interface Combatant {
	side: 'player' | 'enemy'
	name: string
	icon: string
	hp: number
	maxHp: number
	baseMaxHp: number
	shield: number
	se: number
	maxSe: number
	stats: StatSheet
	statuses: ActiveStatus[]
	immunities: { key: string; remaining: number }[]
	weapons: CombatItem[]
	actives: { item: CombatItem; interval: number; timer: number }[]
	skills: { name: string; icon: string }[]
	gridWidth: number
	gridSize: number
	counterChance: number
	counterPower: number
	seRegen: number
	critRate: number
	lifesteal: number
	damageReduction: number
	haste: number
	/** Reference attack used by `atkScale` effects and counter damage. */
	referenceAtk: number
}

interface BuildInput {
	side: 'player' | 'enemy'
	name: string
	icon: string
	baseMaxHp: number
	baseMaxSe: number
	baseSeRegen: number
	baseCounterChance: number
	baseWeaponName: string
	baseWeaponIcon: string
	baseWeaponInterval: number
	baseWeaponDamage: number
	baseMods?: StatMods
	items: { templateId: string; star: Star; slot: number; rotated?: boolean }[]
	gridWidth: number
	gridSize: number
}

/** Stable uid shared by the bag UI and the battle gear rows. */
export function combatItemUid(templateId: string, slot: number): string {
	return `${templateId}-${slot}`
}

/** Resolves passives + aura adjacency, then assembles the combatant. */
export function buildCombatant(input: BuildInput): Combatant {
	const stats = emptyStats()
	addMods(stats, {
		maxHp: input.baseMaxHp,
		seRegen: input.baseSeRegen,
		counterChance: input.baseCounterChance,
	})
	addMods(stats, input.baseMods)

	const placed = input.items.filter((entry) => entry.slot >= 0 && entry.slot < input.gridSize)
	// Cell → item map so adjacency is evaluated per cell rather than from a single anchor cell.
	// The uid is built just like `combatItemUid` so the original entry can be looked up back.
	const uidOf = (entry: { templateId: string; slot: number }) => combatItemUid(entry.templateId, entry.slot)
	const cellOwner = occupancy(
		placed.map((entry) => ({ ...entry, uid: uidOf(entry) })),
		input.gridWidth,
		(entry) => templateFootprint(entry.templateId, entry.rotated),
	)
	const byUid = new Map(placed.map((entry) => [uidOf(entry), entry]))

	const items: CombatItem[] = placed.map((entry) => {
		const template = getTemplate(entry.templateId)
		return {
			uid: combatItemUid(entry.templateId, entry.slot),
			templateId: entry.templateId,
			name: template.name,
			icon: template.icon,
			star: entry.star,
			slot: entry.slot,
			cls: template.cls,
			damage: template.damage ? template.damage(entry.star) : 0,
			interval: template.speed ? swingMs(template.speed(entry.star)) : template.interval ? template.interval(entry.star) : 0,
			effects: template.active ? template.active(entry.star) : [],
			onHit: template.onHit ? template.onHit(entry.star) : undefined,
			linked: false,
		}
	})

	for (const item of items) {
		const template = getTemplate(item.templateId)
		const entry = byUid.get(item.uid)
		const cells = entry ? cellsOf(entry.slot, templateFootprint(entry.templateId, entry.rotated), input.gridWidth) : []
		const neighbourUids = adjacentUids(cellOwner, cells, input.gridWidth, input.gridSize, item.uid)
		const adjacent = [...neighbourUids]
			.map((uid) => byUid.get(uid))
			.filter((found): found is NonNullable<typeof found> => Boolean(found))

		// The `adjacent` aura counts any neighbouring item; the other auras filter by class.
		item.linked = adjacent.length > 0
		addMods(stats, template.passive ? template.passive(item.star) : undefined)
		if (template.aura) {
			const aura = template.aura(item.star)
			const satisfied =
				aura.target === 'all' ||
				(aura.target === 'adjacent' && adjacent.length > 0) ||
				(aura.target === 'adjacentWeapon' && adjacent.some((found) => getTemplate(found.templateId).cls === 'weapon')) ||
				(aura.target === 'adjacentNonWeapon' &&
					adjacent.some((found) => getTemplate(found.templateId).cls !== 'weapon'))
			if (satisfied) addMods(stats, aura.mods)
		}
	}

	const atkPct = stats.atkPct / 100
	const weaponBase = input.baseWeaponDamage + stats.atk
	const baseWeapon: CombatItem = {
		uid: 'skill',
		templateId: 'skill',
		name: input.baseWeaponName,
		icon: input.baseWeaponIcon,
		star: 1,
		slot: -1,
		cls: 'weapon',
		damage: Math.round(weaponBase * (1 + atkPct)),
		interval: input.baseWeaponInterval,
		effects: [],
		linked: false,
	}

	const weapons = [baseWeapon, ...items.filter((item) => item.damage > 0)]

	const maxHp = Math.round(stats.maxHp)
	const haste = Math.max(-60, stats.haste)

	return {
		side: input.side,
		name: input.name,
		icon: input.icon,
		hp: maxHp,
		maxHp,
		baseMaxHp: maxHp,
		shield: Math.round(stats.shield),
		se: Math.min(input.baseMaxSe, 35),
		maxSe: input.baseMaxSe,
		stats,
		statuses: [],
		immunities: [],
		weapons,
		actives: items
			.filter((item) => item.effects.length > 0 && item.interval > 0)
			.map((item) => ({ item, interval: item.interval, timer: item.interval })),
		skills: items.filter((item) => item.effects.length > 0).map((item) => ({ name: item.name, icon: item.icon })),
		gridWidth: input.gridWidth,
		gridSize: input.gridSize,
		counterChance: stats.counterChance / 100,
		counterPower: 1 + stats.counterPower / 100,
		seRegen: stats.seRegen,
		critRate: stats.critRate / 100,
		lifesteal: stats.lifesteal / 100,
		damageReduction: Math.min(0.75, stats.dr / 100),
		haste,
		referenceAtk: baseWeapon.damage,
	}
}

export function buildPlayerCombatant(petId: string, level: number, items: ItemInstance[]): Combatant {
	const pet = getPet(petId)
	const levelStats = petLevelStats(pet, level)
	const gridSize = levelStats.bagSize
	return buildCombatant({
		side: 'player',
		name: pet.name,
		icon: pet.icon,
		baseMaxHp: levelStats.maxHp,
		baseMaxSe: levelStats.maxSe,
		baseSeRegen: levelStats.seRegen,
		baseCounterChance: pet.counterChance,
		baseWeaponName: pet.skill.name,
		baseWeaponIcon: '✨',
		baseWeaponInterval: pet.skill.interval,
		baseWeaponDamage: levelStats.skillDamage,
		items: items.map((item) => ({
			templateId: item.templateId,
			star: item.star,
			slot: item.slot,
			rotated: item.rotated,
		})),
		gridWidth: levelStats.bag.width,
		gridSize,
	})
}

export function buildEnemyCombatant(blueprint: import('./types').EnemyBlueprint): Combatant {
	return buildCombatant({
		side: 'enemy',
		name: blueprint.name,
		icon: blueprint.icon,
		baseMaxHp: blueprint.maxHp,
		baseMaxSe: blueprint.maxSe,
		baseSeRegen: blueprint.seRegen,
		baseCounterChance: blueprint.counterChance,
		baseWeaponName: 'Đòn cơ bản',
		baseWeaponIcon: '👊',
		baseWeaponInterval: blueprint.attackInterval,
		baseWeaponDamage: blueprint.attackDamage,
		baseMods: blueprint.mods,
		items: blueprint.items,
		gridWidth: GRID_WIDTH,
		gridSize: GRID_WIDTH * MAX_BAG_ROWS,
	})
}

/** Rough offensive pressure used for the PvP matchmaking board. */
export function estimatePower(combatant: Combatant): number {
	const hasteFactor = 1 + Math.max(-0.6, combatant.haste) / 100
	const dps = combatant.weapons.reduce((total, weapon) => total + (weapon.damage / weapon.interval) * 1000, 0) * hasteFactor
	return powerScore(combatant.maxHp, dps, combatant.damageReduction * 100, combatant.shield)
}
