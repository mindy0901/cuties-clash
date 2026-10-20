import type { StatKey, StatMods, StatSheet } from './types'

export const STAT_KEYS: StatKey[] = [
	'atk',
	'atkPct',
	'critRate',
	'critDamage',
	'lifesteal',
	'dr',
	'maxHp',
	'seRegen',
	'cdr',
	'shield',
]

/** Vietnamese labels used by item tooltips and the cutie stat panel. */
export const STAT_LABELS: Record<StatKey, string> = {
	atk: 'Tấn công',
	atkPct: 'Sát thương',
	critRate: 'Tỉ lệ chí mạng',
	critDamage: 'Sát thương chí mạng',
	lifesteal: 'Hút máu',
	dr: 'Giảm sát thương',
	maxHp: 'Máu tối đa',
	seRegen: 'Hồi Kiếm Thế',
	cdr: 'Giảm hồi chiêu',
	shield: 'Giáp khởi đầu',
}

/** Stats rendered as percentages instead of flat numbers. */
const PERCENT: StatKey[] = [
	'atkPct',
	'critRate',
	'critDamage',
	'lifesteal',
	'dr',
	'cdr',
]

export function emptyStats(): StatSheet {
	const sheet = {} as StatSheet
	for (const key of STAT_KEYS) sheet[key] = 0
	return sheet
}

export function addMods(sheet: StatSheet, mods: StatMods | undefined, multiplier = 1): StatSheet {
	if (!mods) return sheet
	for (const key of STAT_KEYS) {
		const value = mods[key]
		if (value !== undefined) sheet[key] += value * multiplier
	}
	return sheet
}

export function isPercentStat(key: StatKey): boolean {
	return PERCENT.includes(key)
}

/**
 * A stat amount as short text, keeping up to **two decimals** (`0.2`, `12.5`, `30`).
 *
 * ⚠️ Never `Math.round()` a stat before printing it: an admin can set `0.2` % damage reduction, and a
 * rounded read-out showed `+0%` — the item looked like it did nothing at all.
 */
export function statNumber(value: number): string {
	return String(Number(value.toFixed(2)))
}

export function formatStat(key: StatKey, value: number): string {
	return isPercentStat(key) ? `+${statNumber(value)}%` : `+${statNumber(value)}`
}

/** Battle power heuristic: HP + offensive pressure + defence, used for PvP matchmaking. */
export function powerScore(hp: number, dps: number, dr: number, shield: number): number {
	return Math.round(hp * 0.35 + dps * 2.2 + dr * 12 + shield * 0.4)
}
