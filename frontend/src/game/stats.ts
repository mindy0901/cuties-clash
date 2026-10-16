import type { StatKey, StatMods, StatSheet } from './types'

export const STAT_KEYS: StatKey[] = [
	'atk',
	'atkPct',
	'critRate',
	'lifesteal',
	'dr',
	'maxHp',
	'seRegen',
	'haste',
	'counterChance',
	'counterPower',
	'shield',
]

/** Vietnamese labels used by item tooltips and the pet stat panel. */
export const STAT_LABELS: Record<StatKey, string> = {
	atk: 'Sát thương cộng thêm',
	atkPct: 'Sát thương',
	critRate: 'Tỉ lệ chí mạng',
	lifesteal: 'Hút máu',
	dr: 'Giảm sát thương',
	maxHp: 'Máu tối đa',
	seRegen: 'Hồi Kiếm Thế',
	haste: 'Tốc độ đánh',
	counterChance: 'Tỉ lệ Chấn Đao',
	counterPower: 'Sát thương phản kích',
	shield: 'Giáp khởi đầu',
}

/** Stats rendered as percentages instead of flat numbers. */
const PERCENT: StatKey[] = ['atkPct', 'critRate', 'lifesteal', 'dr', 'haste', 'counterChance', 'counterPower']

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

export function formatStat(key: StatKey, value: number): string {
	return isPercentStat(key) ? `+${Math.round(value)}%` : `+${Math.round(value)}`
}

/** Battle power heuristic: HP + offensive pressure + defence, used for PvP matchmaking. */
export function powerScore(hp: number, dps: number, dr: number, shield: number): number {
	return Math.round(hp * 0.35 + dps * 2.2 + dr * 12 + shield * 0.4)
}
