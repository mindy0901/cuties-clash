import type { PetDef } from './types'

export const GRID_WIDTH = 6

/** Pets mirror the three cuties of the event; unlock order follows map clears. */
export const PETS: PetDef[] = [
	{
		id: 'fire-pup',
		name: 'Cẩu Hỏa Sài',
		icon: '🐶',
		blurb: 'Chú chó lửa nhỏ nhưng dai sức — cân bằng giữa công và thủ.',
		unlockStage: 0,
		maxHp: 620,
		maxSe: 100,
		seRegen: 8,
		counterChance: 0.15,
		skill: {
			name: 'Hỏa Khuyển Trảo',
			interval: 1600,
			damage: 14,
			desc: 'Cào lửa cơ bản, mỗi cấp thú +12% sát thương.',
		},
		bags: [
			{ width: GRID_WIDTH, rows: 2 },
			{ width: GRID_WIDTH, rows: 3 },
			{ width: GRID_WIDTH, rows: 3 },
			{ width: GRID_WIDTH, rows: 4 },
			{ width: GRID_WIDTH, rows: 4 },
		],
	},
	{
		id: 'white-rabbit',
		name: 'Bạch Thố',
		icon: '🐰',
		blurb: 'Thỏ trắng nhanh nhẹn — tốc độ đánh cao, máu mỏng hơn.',
		unlockStage: 20,
		maxHp: 560,
		maxSe: 120,
		seRegen: 11,
		counterChance: 0.2,
		skill: {
			name: 'Nguyệt Thố Liên Cước',
			interval: 1150,
			damage: 10,
			desc: 'Đá liên hoàn rất nhanh, mỗi cấp thú +12% sát thương.',
		},
		bags: [
			{ width: GRID_WIDTH, rows: 2 },
			{ width: GRID_WIDTH, rows: 3 },
			{ width: GRID_WIDTH, rows: 4 },
			{ width: GRID_WIDTH, rows: 4 },
			{ width: GRID_WIDTH, rows: 5 },
		],
	},
	{
		id: 'spirit-cat',
		name: 'Linh Miêu',
		icon: '🐱',
		blurb: 'Mèo linh hồn — máu dày, hồi Kiếm Thế mạnh, Chấn Đao uy lực.',
		unlockStage: 40,
		maxHp: 760,
		maxSe: 130,
		seRegen: 9,
		counterChance: 0.25,
		skill: {
			name: 'U Linh Trảo',
			interval: 1450,
			damage: 18,
			desc: 'Trảo hồn đau đớn, mỗi cấp thú +12% sát thương.',
		},
		bags: [
			{ width: GRID_WIDTH, rows: 2 },
			{ width: GRID_WIDTH, rows: 3 },
			{ width: GRID_WIDTH, rows: 3 },
			{ width: GRID_WIDTH, rows: 4 },
			{ width: GRID_WIDTH, rows: 5 },
		],
	},
]

export const PET_BY_ID: Record<string, PetDef> = Object.fromEntries(PETS.map((pet) => [pet.id, pet]))

export const MAX_PET_LEVEL = 5

export function getPet(petId: string): PetDef {
	const pet = PET_BY_ID[petId]
	if (!pet) throw new Error(`Unknown pet: ${petId}`)
	return pet
}

export function petLevelStats(pet: PetDef, level: number) {
	const step = Math.min(Math.max(level, 1), MAX_PET_LEVEL) - 1
	const bag = pet.bags[Math.min(step, pet.bags.length - 1)]
	return {
		maxHp: Math.round(pet.maxHp * (1 + 0.12 * step)),
		maxSe: pet.maxSe,
		seRegen: pet.seRegen + step,
		skillDamage: Math.round(pet.skill.damage * (1 + 0.12 * step)),
		bag,
		bagSize: bag.width * bag.rows,
	}
}

/** Paw Tally needed to reach the next pet level. */
export function petUpgradeCost(level: number): number {
	return 12 + (level - 1) * 10
}
