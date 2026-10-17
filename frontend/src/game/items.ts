import type { ItemTemplate, ItemClass, Quality, Star } from './types'
import { itemOverride, mergeItem } from './content'

/** Star-indexed values: `pick(star, [1★, 2★, 3★, 4★, 5★])`. */
export function pick(star: Star, values: readonly [number, number, number, number, number]): number {
	return values[star - 1]
}

/** Chill strength of Phiến Băng: 21% at 1★ and +3 points per star rank. */
function slowValue(star: Star): number {
	return 21 + (star - 1) * 3
}

const STAR_LABEL: Record<Star, string> = { 1: '1★', 2: '2★', 3: '3★', 4: '4★', 5: '5★' }

export function starLabel(star: Star): string {
	return STAR_LABEL[star]
}

export const CLASS_LABELS: Record<ItemClass, string> = {
	weapon: 'Vũ khí',
	armor: 'Hộ giáp',
	souljade: 'Hồn Ngọc',
	curio: 'Pháp Bảo',
	potion: 'Đan Dược',
}

/** Merging two of the same item at 5★ is not possible. */
export const MAX_STAR: Star = 5

/** Every star rank, in order — the single list the per-star UI and tests iterate. */
export const STARS: readonly Star[] = [1, 2, 3, 4, 5]

/** Vietnamese label of a quality band, shown in the admin editor. */
export const QUALITY_LABELS: Record<Quality, string> = {
	1: 'Bạc',
	2: 'Xanh lá',
	3: 'Lam',
	4: 'Tím',
	5: 'Vàng cam',
}

export const QUALITY_VALUES: readonly Quality[] = [1, 2, 3, 4, 5]

/** Two copies merge into one star rank; price follows the star rank. */
export function starPrice(baseCost: number, star: Star): number {
	return baseCost * star
}

/**
 * Standard attack rate, in **attacks per second** (1 → one swing, 1.6 s apart).
 *
 * Every item uses it unless the template declares its own `speed`, so the admin page always has a
 * value to work with and an item that gains damage later still swings at a sane rate.
 */
export const DEFAULT_SPEED = 0.625

/** Swing interval in ms for an attack rate: `speed` is attacks per second, so 0.625 → 1600 ms. */
export function swingMs(speed: number): number {
	return Math.round(1000 / speed)
}

/** Items with their per-star numbers. Values mirror the public event tuning. */
export const ITEM_TEMPLATES: ItemTemplate[] = [
	// ── Weapons ─ ───────────────────────────────────────────────────────────────
	{
		id: 'wooden-blade',
		name: 'Đao Gỗ',
		cls: 'weapon',
		quality: 1,
		icon: '🗡️',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 3 },
		speed: (star) => pick(star, [0.6667, 0.7092, 0.7576, 0.813, 0.8772]),
		damage: (star) => pick(star, [12, 20, 32, 50, 78]),
	},
	{
		id: 'fire-spear',
		name: 'Thương Lửa',
		cls: 'weapon',
		quality: 2,
		icon: '🔥',
		art: true,
		tier: 1,
		cost: 4,
		space: { w: 1, h: 4 },
		speed: (star) => pick(star, [0.7143, 0.7634, 0.8197, 0.885, 0.9615]),
		damage: (star) => pick(star, [10, 17, 28, 45, 72]),
		onHit: (star) => ({
			chance: 0.25,
			effects: [
				{
					kind: 'status',
					status: 'burn',
					duration: 3000,
					value: pick(star, [14, 22, 34, 52, 80]),
					stacks: 1,
					target: 'enemy',
				},
			],
		}),
	},
	{
		id: 'frost-fan',
		name: 'Phiến Băng',
		cls: 'weapon',
		quality: 3,
		icon: '❄️',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 2, h: 1 },
		speed: (star) => pick(star, [0.7692, 0.813, 0.8621, 0.9174, 0.9804]),
		damage: (star) => pick(star, [14, 23, 38, 60, 95]),
		onHit: (star) => ({
			chance: 0.3,
			effects: [{ kind: 'status', status: 'slow', duration: 3000, value: slowValue(star), stacks: 1, target: 'enemy' }],
		}),
	},
	{
		id: 'poison-dagger',
		name: 'Chủy Độc',
		cls: 'weapon',
		quality: 3,
		icon: '☠️',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		speed: (star) => pick(star, [1.0526, 1.1111, 1.1765, 1.25, 1.3333]),
		damage: (star) => pick(star, [8, 13, 21, 34, 55]),
		onHit: (star) => ({
			chance: 0.45,
			effects: [
				{
					kind: 'status',
					status: 'poison',
					duration: 4000,
					value: pick(star, [12, 19, 30, 48, 75]),
					stacks: 1,
					target: 'enemy',
				},
			],
		}),
	},
	{
		id: 'great-axe',
		name: 'Phủ Nặng',
		cls: 'weapon',
		quality: 5,
		icon: '🪓',
		art: true,
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		speed: (star) => pick(star, [0.4348, 0.463, 0.495, 0.5319, 0.5747]),
		damage: (star) => pick(star, [34, 56, 92, 150, 245]),
	},
	{
		id: 'twin-claws',
		name: 'Song Trảo',
		cls: 'weapon',
		quality: 5,
		icon: '🐾',
		art: true,
		tier: 3,
		cost: 9,
		space: { w: 2, h: 1 },
		speed: (star) => pick(star, [1.3333, 1.4085, 1.4925, 1.5873, 1.6949]),
		damage: (star) => pick(star, [9, 15, 24, 39, 63]),
		passive: (star) => ({ haste: pick(star, [4, 7, 11, 17, 27]) }),
	},

	// ── Armor ─ ─────────────────────────────────────────────────────────────────
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
		passive: (star) => ({ shield: pick(star, [180, 240, 300, 450, 675]) }),
	},
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
		passive: (star) => ({ shield: pick(star, [240, 340, 460, 700, 1050]), dr: pick(star, [3, 5, 7, 10, 15]) }),
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
		passive: (star) => ({ shield: pick(star, [320, 470, 660, 980, 1450]), dr: pick(star, [6, 9, 12, 16, 22]) }),
	},

	// ── Soul Jades ─ ────────────────────────────────────────────────────────────
	{
		id: 'jade-fury',
		name: 'Hồn Ngọc Phẫn Nộ',
		cls: 'souljade',
		quality: 2,
		icon: '💠',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		passive: (star) => ({ atk: pick(star, [6, 10, 16, 26, 42]) }),
	},
	{
		id: 'jade-haste',
		name: 'Hồn Ngọc Thôi Sách',
		cls: 'souljade',
		quality: 1,
		icon: '🌪️',
		art: true,
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		passive: (star) => ({ haste: pick(star, [8, 12, 17, 24, 34]) }),
	},
	{
		id: 'jade-crit',
		name: 'Hồn Ngọc Chí Mạng',
		cls: 'souljade',
		quality: 3,
		icon: '🎯',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		passive: (star) => ({ critRate: pick(star, [8, 12, 18, 25, 35]) }),
	},
	{
		id: 'jade-vampire',
		name: 'Hồn Ngọc Huyết Ẩm',
		cls: 'souljade',
		quality: 3,
		icon: '🩸',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		passive: (star) => ({ lifesteal: pick(star, [6, 9, 13, 18, 25]) }),
	},
	{
		id: 'jade-guard',
		name: 'Hồn Ngọc Hộ Thể',
		cls: 'souljade',
		quality: 4,
		icon: '🧿',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		passive: (star) => ({ dr: pick(star, [5, 8, 11, 15, 21]) }),
	},
	{
		id: 'jade-sword',
		name: 'Hồn Ngọc Kiếm Thế',
		cls: 'souljade',
		quality: 3,
		icon: '⚔️',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		passive: (star) => ({
			seRegen: pick(star, [3, 5, 8, 12, 19]),
			counterChance: pick(star, [5, 8, 12, 18, 27]),
		}),
	},

	// ── Curios (pulse-activated) ─ ──────────────────────────────────────────────
	{
		id: 'war-drum',
		name: 'Trống Trận',
		cls: 'curio',
		quality: 3,
		icon: '🥁',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 2, h: 2 },
		aura: (star) => ({ target: 'adjacentWeapon', mods: { atkPct: pick(star, [10, 15, 22, 32, 48]) } }),
	},
	{
		id: 'ghost-lantern',
		name: 'Đèn Quỷ',
		cls: 'curio',
		quality: 2,
		icon: '🏮',
		art: true,
		tier: 1,
		cost: 4,
		space: { w: 1, h: 2 },
		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [{ kind: 'shield', amount: pick(star, [60, 100, 160, 260, 420]) }],
	},
	{
		id: 'forge-fang',
		name: 'Nanh Lò Rèn',
		cls: 'curio',
		quality: 3,
		icon: '🐺',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 2 },
		interval: (star) => 9500 - 900 * (star - 1),
		active: (star) => [{ kind: 'damage', amount: pick(star, [22, 36, 58, 94, 150]) }],
	},
	{
		id: 'venom-vial',
		name: 'Lọ Độc',
		cls: 'curio',
		quality: 3,
		icon: '⚗️',
		art: true,
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		interval: (star) => 7500 - 600 * (star - 1),
		active: (star) => [
			{
				kind: 'status',
				status: 'poison',
				duration: 4000,
				value: pick(star, [35, 55, 85, 135, 215]),
				stacks: 1,
				target: 'enemy',
			},
		],
	},
	{
		id: 'storm-bell',
		name: 'Chuông Bão',
		cls: 'curio',
		quality: 3,
		icon: '🔔',
		art: true,
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		interval: (star) => 8500 - 700 * (star - 1),
		active: (star) => [
			{
				kind: 'status',
				status: 'haste',
				duration: 4000,
				value: pick(star, [20, 26, 33, 42, 54]),
				stacks: 1,
				target: 'self',
			},
		],
	},
	{
		id: 'divine-forger',
		name: 'Thần Đúc Sư',
		cls: 'curio',
		quality: 5,
		icon: '🔨',
		art: true,
		tier: 3,
		cost: 8,
		space: { w: 2, h: 2 },
		interval: (star) => 9500 - 800 * (star - 1),
		passive: (star) => ({ dr: pick(star, [2, 3, 4, 6, 9]) }),
		active: (star) => [
			{ kind: 'cleanse', statuses: ['slow', 'freeze'], scope: 'adjacent' },
			{ kind: 'heal', amount: pick(star, [15, 25, 40, 65, 105]) },
		],
	},
	{
		id: 'frost-seal',
		name: 'Hàn Ngọc Phù',
		cls: 'curio',
		quality: 4,
		icon: '🧊',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		interval: (star) => 11000 - 800 * (star - 1),
		active: (star) => [
			{ kind: 'damage', amount: pick(star, [15, 25, 40, 65, 105]) },
			{
				kind: 'status',
				status: 'freeze',
				duration: Math.round((1 + 0.15 * (star - 1)) * 1000),
				value: 0,
				stacks: 1,
				target: 'enemy',
			},
		],
	},
	{
		id: 'mirror-shard',
		name: 'Mảnh Gương',
		cls: 'curio',
		quality: 4,
		icon: '🪞',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 1, h: 2 },
		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [
			{ kind: 'damage', amount: 0, atkScale: pick(star, [1, 1.3, 1.7, 2.2, 2.9]) },
			{ kind: 'status', status: 'brittle', duration: 5000, value: pick(star, [8, 12, 16, 22, 31]), stacks: 1, target: 'enemy' },
		],
	},
	{
		id: 'silk-banner',
		name: 'Cờ Lụa',
		cls: 'curio',
		quality: 4,
		icon: '🎏',
		art: true,
		tier: 3,
		cost: 7,
		space: { w: 2, h: 1 },
		aura: (star) => ({ target: 'adjacentNonWeapon', mods: { maxHp: pick(star, [25, 45, 75, 120, 195]) } }),
	},

	// ── Potions ─ ───────────────────────────────────────────────────────────────
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
		interval: (star) => 6500 - 500 * (star - 1),
		active: (star) => [{ kind: 'heal', amount: pick(star, [40, 70, 115, 185, 300]) }],
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
		interval: (star) => 10000 - 700 * (star - 1),
		active: (star) => [{ kind: 'swordEnergy', amount: pick(star, [25, 40, 60, 90, 135]) }],
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
		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [
			{ kind: 'shield', amount: pick(star, [80, 130, 210, 330, 510]) },
			{
				kind: 'status',
				status: 'regen',
				duration: 4000,
				value: pick(star, [10, 18, 30, 50, 80]),
				stacks: 1,
				target: 'self',
			},
		],
	},
]

export const ITEM_BY_ID: Record<string, ItemTemplate> = Object.fromEntries(
	ITEM_TEMPLATES.map((template) => [template.id, template]),
)

/** Template **with the admin overlay applied** (if any). */
export function getTemplate(templateId: string): ItemTemplate {
	const template = ITEM_BY_ID[templateId]
	if (!template) throw new Error(`Unknown item template: ${templateId}`)
	return mergeItem(template, itemOverride(templateId))
}

/**
 * Items whose `tier` is at most `tier`, **with the admin overlay applied**.
 *
 * ⚠️ Roll pools (shop, enemy gear, PvP rival gear) must go through this instead of filtering
 * `ITEM_TEMPLATES` directly: changing `tier` on the admin page has to **actually take effect**,
 * otherwise the editor sees battles keep using the old items and has no idea why.
 */
export function itemTemplatesUpToTier(tier: number): ItemTemplate[] {
	return ITEM_TEMPLATES.map((template) => getTemplate(template.id)).filter(
		(template) => template.tier <= tier,
	)
}
