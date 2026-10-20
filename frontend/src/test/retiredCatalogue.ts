import { pick } from '../game/items'
import type { AuraTarget, ItemKit, ItemTemplate, Star, StatMods } from '../game/types'

/** `stats` option kit — same helper `game/items.ts` used for its templates. */
function statsKit(mods: (star: Star) => StatMods): ItemKit {
	return { id: 'stats', params: {}, stats: ([1, 2, 3, 4, 5] as Star[]).map((star) => mods(star)) }
}

/** `aura` option kit — one adjacency rule per star rank. */
function auraKit(target: AuraTarget, mods: (star: Star) => StatMods): ItemKit {
	return { id: 'aura', params: {}, aura: ([1, 2, 3, 4, 5] as Star[]).map((star) => ({ target, mods: mods(star) })) }
}

/**
 * The templates **retired from the shipped catalogue**, kept as test data only.
 *
 * Why they live here: the test suite uses real items as fixtures — a 2×3 axe for grid collisions, a
 * gem with a support kit for the buff rules, an armour piece with a parry kit. Those items were
 * removed from `game/items.ts` when the catalogue moved to admin-owned content, so the fixtures are
 * registered through the **content overlay** instead (`useRetiredItems()`), exactly like an item the
 * admin created. Nothing here ships: the game only ever sees what `items.ts` and the database hold.
 *
 * ❌ Never import this from app code — only from `*.test.ts(x)`.
 */
export const RETIRED_ITEM_TEMPLATES: ItemTemplate[] = [
	{
		id: 'chain-mail',
		name: 'Giáp Xích',
		cls: 'armor',
		quality: 3,
		icon: '⛓️',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 2, h: 2 },
		kits: [
			statsKit((star) => ({
				shield: pick(star, [240, 340, 460, 700, 1050]),
				dr: pick(star, [3, 5, 7, 10, 15]),
			})),
		],
	},
	{
		id: 'divine-forger',
		name: 'Thần Đúc Sư',
		cls: 'artifact',
		quality: 5,
		icon: '🔨',
		art: true,
		tier: 3,
		cost: 8,
		space: { w: 2, h: 2 },
		kits: [statsKit((star) => ({ dr: pick(star, [2, 3, 4, 6, 9]) }))],
	},
	{
		id: 'forge-fang',
		name: 'Nanh Lò Rèn',
		cls: 'artifact',
		quality: 3,
		icon: '🐺',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 2 },
	},
	{
		id: 'frost-fan',
		name: 'Phiến Băng',
		cls: 'ranged',
		quality: 3,
		icon: '❄️',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 2, h: 1 },
		kits: [
			{
				id: 'basic-attack',
				params: {
					multiplier: [1, 1, 1, 1, 1],
					cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
				},
				onHit: [
					{
						id: 'slow-on-hit',
						params: {
							chance: [30, 30, 30, 30, 30],
							duration: [3000, 3000, 3000, 3000, 3000],
							value: [21, 24, 27, 30, 33],
						},
					},
				],
			},
		],
	},
	{
		id: 'frost-seal',
		name: 'Hàn Ngọc Phù',
		cls: 'artifact',
		quality: 4,
		icon: '🧊',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
	},
	{
		id: 'ghost-lantern',
		name: 'Đèn Quỷ',
		cls: 'artifact',
		quality: 2,
		icon: '🏮',
		art: true,
		tier: 1,
		cost: 4,
		space: { w: 1, h: 2 },
	},
	{
		id: 'great-axe',
		name: 'Phủ Nặng',
		cls: 'melee',
		quality: 5,
		icon: '🪓',
		art: true,
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		kits: [
			{
				id: 'basic-attack',
				params: {
					multiplier: [1, 1, 1, 1, 1],
					cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
				},
			},
		],
	},
	{
		id: 'heal-dew',
		name: 'Lộ Sương Trị Thương',
		cls: 'potion',
		quality: 1,
		icon: '🧪',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
	},
	{
		id: 'hide-vest',
		name: 'Giáp Da',
		cls: 'armor',
		quality: 1,
		icon: '🦺',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 2, h: 2 },
		kits: [statsKit((star) => ({ shield: pick(star, [8, 11, 15, 22, 33]) }))],
	},
	{
		id: 'iron-brew',
		name: 'Thuốc Sắt',
		cls: 'potion',
		quality: 4,
		icon: '🫙',
		art: true,
		tier: 3,
		cost: 6,
		space: { w: 1, h: 2 },
	},
	{
		id: 'jade-crit',
		name: 'Hồn Ngọc Chí Mạng',
		cls: 'jade',
		quality: 3,
		icon: '🎯',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		kits: [statsKit((star) => ({ critRate: pick(star, [8, 12, 18, 25, 35]) }))],
	},
	{
		id: 'jade-fury',
		name: 'Hồn Ngọc Phẫn Nộ',
		cls: 'jade',
		quality: 2,
		icon: '💠',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		kits: [statsKit((star) => ({ atk: pick(star, [6, 10, 16, 26, 42]) }))],
	},
	{
		id: 'jade-guard',
		name: 'Hồn Ngọc Hộ Thể',
		cls: 'jade',
		quality: 4,
		icon: '🧿',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		kits: [statsKit((star) => ({ dr: pick(star, [5, 8, 11, 15, 21]) }))],
	},
	{
		id: 'jade-haste',
		name: 'Hồn Ngọc Thôi Sách',
		cls: 'jade',
		quality: 1,
		icon: '🌪️',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		kits: [statsKit((star) => ({ cdr: pick(star, [8, 12, 17, 24, 34]) }))],
	},
	{
		id: 'jade-sword',
		name: 'Hồn Ngọc Kiếm Thế',
		cls: 'jade',
		quality: 3,
		icon: '⚔️',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		kits: [
			statsKit((star) => ({
				seRegen: pick(star, [3, 5, 8, 12, 19]),
			})),
			// Chấn Đao comes from this item: a parry now needs the kit, not a global chance.
			{
				id: 'parry',
				params: {
					chance: [5, 8, 12, 18, 27],
					cost: [65, 65, 65, 65, 65],
					power: [100, 110, 120, 135, 155],
				},
			},
		],
	},
	{
		id: 'jade-vampire',
		name: 'Hồn Ngọc Huyết Ẩm',
		cls: 'jade',
		quality: 3,
		icon: '🩸',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		kits: [statsKit((star) => ({ lifesteal: pick(star, [6, 9, 13, 18, 25]) }))],
	},
	{
		id: 'mirror-shard',
		name: 'Mảnh Gương',
		cls: 'artifact',
		quality: 4,
		icon: '🪞',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 1, h: 2 },
	},
	{
		id: 'poison-dagger',
		name: 'Chủy Độc',
		cls: 'ranged',
		quality: 3,
		icon: '☠️',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		kits: [
			{
				id: 'basic-attack',
				params: {
					multiplier: [1, 1, 1, 1, 1],
					cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
				},
				onHit: [
					{
						id: 'poison-on-hit',
						params: {
							scaling: [0, 0, 0, 0, 0],
							chance: [45, 45, 45, 45, 45],
							duration: [4000, 4000, 4000, 4000, 4000],
							value: [12, 19, 30, 48, 75],
						},
					},
				],
			},
		],
	},
	{
		id: 'silk-banner',
		name: 'Cờ Lụa',
		cls: 'artifact',
		quality: 4,
		icon: '🎏',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 2, h: 1 },
		kits: [auraKit('adjacentNonWeapon', (star) => ({ maxHp: pick(star, [25, 45, 75, 120, 195]) }))],
	},
	{
		id: 'storm-bell',
		name: 'Chuông Bão',
		cls: 'artifact',
		quality: 3,
		icon: '🔔',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
	},
	{
		id: 'tiger-tonic',
		name: 'Hổ Cốt Tửu',
		cls: 'potion',
		quality: 3,
		icon: '🍶',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
	},
	{
		id: 'twin-claws',
		name: 'Song Trảo',
		cls: 'melee',
		quality: 5,
		icon: '🐾',
		art: true,
		tier: 3,
		cost: 9,
		space: { w: 2, h: 1 },
		kits: [
			{
				id: 'basic-attack',
				params: {
					multiplier: [1, 1, 1, 1, 1],
					cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
				},
			},
			statsKit((star) => ({ cdr: pick(star, [4, 7, 11, 17, 27]) })),
		],
	},
	{
		id: 'venom-vial',
		name: 'Lọ Độc',
		cls: 'artifact',
		quality: 3,
		icon: '⚗️',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
	},
	{
		id: 'war-drum',
		name: 'Trống Trận',
		cls: 'artifact',
		quality: 3,
		icon: '🥁',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 2, h: 2 },
		kits: [auraKit('adjacentWeapon', (star) => ({ atkPct: pick(star, [10, 15, 22, 32, 48]) }))],
	},
	{
		id: 'warden-plate',
		name: 'Giáp Vệ Binh',
		cls: 'armor',
		quality: 5,
		icon: '🛡️',
		art: true,
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		kits: [
			statsKit((star) => ({
				shield: pick(star, [320, 470, 660, 980, 1450]),
				dr: pick(star, [6, 9, 12, 16, 22]),
			})),
		],
	},
	{
		id: 'fire-spear',
		name: 'Thương Lửa',
		cls: 'melee',
		quality: 2,
		icon: '🔥',
		art: true,
		tier: 1,
		cost: 4,
		space: { w: 1, h: 4 },
		kits: [
			{
				id: 'basic-attack',
				params: {
					multiplier: [1, 1, 1, 1, 1],
					cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
				},
				onHit: [
					{
						id: 'burn-on-hit',
						params: {
							scaling: [0, 0, 0, 0, 0],
							chance: [25, 25, 25, 25, 25],
							duration: [3000, 3000, 3000, 3000, 3000],
							value: [14, 22, 34, 52, 80],
						},
					},
				],
			},
		],
	},
	{
		id: 'wooden-blade',
		name: 'Đao Gỗ',
		cls: 'melee',
		quality: 1,
		icon: '🗡️',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 3 },
		kits: [
			{
				id: 'basic-attack',
				params: {
					multiplier: [1, 1, 1, 1, 1],
					cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
				},
			},
		],
	},
]