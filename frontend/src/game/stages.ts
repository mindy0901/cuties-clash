import { createRng } from './rng'
import { ITEM_TEMPLATES } from './items'
import type { EnemyBlueprint, ItemBlueprint, MapDef, Star, StageDef } from './types'

export const MAPS: MapDef[] = [
	{ name: 'Tụ Khốt Châu', subtitle: 'Bãi cỏ bình yên — nơi mọi thú cưng tập luyện', from: 1, to: 20 },
	{ name: 'Hỏa La Quốc', subtitle: 'Đất nước rực lửa của các đấu sĩ', from: 21, to: 40 },
	{ name: 'Stormchant', subtitle: 'Thung lũng bão tố, chỉ dành cho kẻ mạnh nhất', from: 41, to: 60 },
]

export const FINAL_STAGE = 60

const STAGE_NAMES: string[][] = [
	[
		'Chuột Đồng Cỏ', 'Gà Rừng Hiếu Chiến', 'Sói Xám', 'Heo Rừng', 'Cáo Lửa', 'Dê Núi', 'Vượn Treo', 'Hổ Con Non',
		'Gấu Mật', 'Vệ Binh Cỏ',
		'Bọ Cánh Cam Khổng Lồ', 'Ong Chúa', 'Trăn Xanh', 'Báo Đốm', 'Tê Giác Đá', 'Bò Rừng Húc', 'Cá Sấu Đầm Lầy',
		'Đại Bàng Đêm', 'Thần Tướng Gỗ', 'Hắc Long Tử',
	],
	[
		'Tiểu Yêu Tro', 'Thằn Lằn Than', 'Sư Tử Lửa', 'Phượng Hoàng Con', 'Hồ Yêu Đỏ', 'Chiến Binh Lava', 'Nham Thạch Thú',
		'Quỷ Diêm Vương', 'Cự Chuông Đồng', 'Song Kiếm Hỏa',
		'Kỳ Lân Lửa', 'Tượng Đá Cháy', 'Rắn Hỏa Xà', 'Ma Cà Rồng', 'Ngạc Ngư Nham', 'Bọ Cạp Than', 'Hỏa Điểu Chúa',
		'Ác Quỷ Nham', 'Thần Lửa Xi Vưu', 'Diệm Quân',
	],
	[
		'Gấu Ngưng Băng', 'Thú Phong', 'Phi Yến', 'Hắc Báo Bão', 'Lôi Điểu', 'Sói Bạc', 'Đá Rơi', 'Yêu Long Phong',
		'Băng Vệ Binh', 'Chấn Lôi Tướng',
		'Bạch Kình', 'Tuyết Nữ', 'Sương Mạc Sĩ', 'Phong Ma', 'Thiên Địa Chấn', 'Huyền Vũ', 'Chu Tước',
		'Hắc Kỳ Lân', 'Bão Vương', 'Vô Diện Kiếm Chủ',
	],
]

const STAGE_ICONS: string[][] = [
	['🐭', '🐔', '🐺', '🐗', '🦊', '🐐', '🐒', '🐯', '🐻', '🐝', '🪲', '🐝', '🐍', '🐆', '🦏', '🐂', '🐊', '🦅', '🌳', '🐲'],
	['🔥', '🦎', '🦁', '🐤', '🦊', '⚔️', '🗿', '👺', '🔔', '🤺', '🦄', '🗿', '🐍', '🧛', '🐊', '🦂', '🐦‍🔥', '😈', '🌋', '☄️'],
	['🐻‍❄️', '🌬️', '🕊️', '🐈‍⬛', '⚡', '🐺', '🪨', '🐉', '🧊', '⚡', '🐋', '👧', '🧣', '👻', '🌩️', '🐢', '🔥', '🦌', '🌪️', '🗡️'],
]

const ENEMY_POOLS: string[][] = [
	['wooden-blade', 'hide-vest', 'jade-fury', 'heal-dew', 'jade-haste'],
	['fire-spear', 'frost-fan', 'jade-crit', 'ghost-lantern', 'war-drum', 'chain-mail', 'poison-dagger', 'jade-sword'],
	['great-axe', 'twin-claws', 'warden-plate', 'jade-guard', 'forge-fang', 'storm-bell', 'mirror-shard', 'frost-seal', 'divine-forger', 'venom-vial', 'jade-vampire'],
]

/** Stage index → item star for enemy loadouts (the player is expected to out-scale 4★ items). */
function enemyStar(index: number): Star {
	if (index >= 46) return 4
	if (index >= 31) return 3
	if (index >= 16) return 2
	return 1
}

function enemyItems(index: number, mapIndex: number): ItemBlueprint[] {
	const pool = ENEMY_POOLS[mapIndex]
	const count = Math.min(6, pool.length, Math.max(0, Math.floor((index + 3) / 7)))
	const star = enemyStar(index)
	const rng = createRng(index * 7919 + 13)
	const items: ItemBlueprint[] = []
	const used = new Set<string>()
	for (let i = 0; i < count; i += 1) {
		let templateId = rng.pick(pool)
		let guard = 0
		while (used.has(templateId) && guard < pool.length) {
			templateId = rng.pick(pool)
			guard += 1
		}
		used.add(templateId)
		items.push({ templateId, star, slot: i })
	}
	return items
}

function buildStage(index: number): StageDef {
	const mapIndex = Math.min(MAPS.length - 1, Math.floor((index - 1) / 20))
	const stageInMap = (index - 1) % 20
	const isBoss = stageInMap % 10 === 9
	const bossMultiplier = isBoss ? 1.35 : 1
	const growth = 1 + (index - 1) * 0.085

	const maxHp = Math.round((400 + (index - 1) * 54) * bossMultiplier)
	const attackDamage = Math.round((8 + (index - 1) * 0.95) * (isBoss ? 1.12 : 1))
	const attackInterval = Math.max(950, Math.round(1700 - (index - 1) * 7))
	const name = STAGE_NAMES[mapIndex][stageInMap]
	const reward = Math.round(6 + index * 1.15) + (isBoss ? 8 : 0)

	return {
		index,
		mapIndex,
		name: isBoss ? `Thủ Lĩnh · ${name}` : name,
		reward,
		enemy: {
			name: isBoss ? `Thủ Lĩnh · ${name}` : name,
			icon: STAGE_ICONS[mapIndex][stageInMap],
			maxHp,
			maxSe: 100 + Math.floor(index / 3),
			seRegen: 7 + Math.floor(index / 6),
			attackInterval,
			attackDamage,
			counterChance: Math.min(0.4, 0.1 + index * 0.0025) * (isBoss ? 1.2 : 1),
			mods: { critRate: Math.min(20, Math.round(growth * 6 - 6)), dr: Math.round(Math.min(18, (index / 60) * 16)) },
			items: enemyItems(index, mapIndex),
		},
	}
}

export const STAGES: StageDef[] = Array.from({ length: FINAL_STAGE }, (_, i) => buildStage(i + 1))

export function getStage(index: number): StageDef {
	const clamped = Math.min(Math.max(index, 1), FINAL_STAGE)
	return STAGES[clamped - 1]
}

export function stageTier(index: number): 1 | 2 | 3 {
	if (index >= 41) return 3
	if (index >= 21) return 2
	return 1
}

export function availableTemplates(index: number) {
	const tier = stageTier(index)
	return ITEM_TEMPLATES.filter((template) => template.tier <= tier)
}

/**
 * Rival build for the PvP sparring board: scaled to the player's power so the
 * match stays interesting, then expressed as a normal enemy blueprint.
 */
export function makeRivalBlueprint(power: number, stageIndex: number, seed: number): EnemyBlueprint {
	const rng = createRng(seed)
	const tier = stageTier(stageIndex)
	const pool = ITEM_TEMPLATES.filter((template) => template.tier <= tier)
	const count = 3 + rng.int(4)
	const items: ItemBlueprint[] = []
	const starCap = (tier === 3 ? 4 : tier === 2 ? 3 : 2) as Star
	for (let i = 0; i < count; i += 1) {
		const star = (1 + rng.int(starCap)) as Star
		items.push({ templateId: rng.pick(pool).id, star, slot: i })
	}
	const scale = Math.max(0.75, Math.min(1.45, power / 1000))
	return {
		name: `Đối Thủ #${100 + rng.int(899)}`,
		icon: '🀄',
		maxHp: Math.round(520 * scale + 120),
		maxSe: 110,
		seRegen: 8,
		attackInterval: 1300,
		attackDamage: Math.round(14 * scale + 6),
		counterChance: 0.18,
		mods: { critRate: Math.round(6 * scale), dr: Math.round(6 * scale) },
		items,
	}
}
