import type { ItemTemplate, ItemClass, Star } from './types'
import { itemOverride, mergeItem } from './content'

/** Star-indexed values: `pick(star, [1★, 2★, 3★, 4★])`. */
export function pick(star: Star, values: readonly [number, number, number, number]): number {
	return values[star - 1]
}

const STAR_LABEL: Record<Star, string> = { 1: '1★', 2: '2★', 3: '3★', 4: '4★' }

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

/** Merging two of the same item at 4★ is not possible. */
export const MAX_STAR: Star = 4

/** Two copies merge into one star rank; price follows the star rank. */
export function starPrice(baseCost: number, star: Star): number {
	return baseCost * star
}

/** Items with their per-star numbers. Values mirror the public event tuning. */
export const ITEM_TEMPLATES: ItemTemplate[] = [
	// ── Vũ khí ────────────────────────────────────────────────────────────────
	{
		id: 'wooden-blade',
		name: 'Đao Gỗ',
		cls: 'weapon',
		icon: '🗡️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 3 },
		attackInterval: (star) => Math.round(1500 - 90 * (star - 1)),
		damage: (star) => pick(star, [12, 20, 32, 50]),
		desc: (star) => `Chém ${pick(star, [12, 20, 32, 50])} sát thương mỗi ${(1500 - 90 * (star - 1)) / 1000}s.`,
	},
	{
		id: 'fire-spear',
		name: 'Thương Lửa',
		cls: 'weapon',
		icon: '🔥',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 4,
		space: { w: 1, h: 4 },
		attackInterval: (star) => Math.round(1400 - 90 * (star - 1)),
		damage: (star) => pick(star, [10, 17, 28, 45]),
		desc: (star) => `Đâm ${pick(star, [10, 17, 28, 45])} sát thương, 25% gây Cháy ${pick(star, [14, 22, 34, 52])}/s trong 3s.`,
		onHit: (star) => ({
			chance: 0.25,
			effects: [
				{ kind: 'status', status: 'burn', duration: 3000, value: pick(star, [14, 22, 34, 52]), stacks: 1, target: 'enemy' },
			],
		}),
	},
	{
		id: 'frost-fan',
		name: 'Phiến Băng',
		cls: 'weapon',
		icon: '❄️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 2, h: 1 },
		attackInterval: (star) => Math.round(1300 - 70 * (star - 1)),
		damage: (star) => pick(star, [14, 23, 38, 60]),
		desc: (star) => `Quạt ${pick(star, [14, 23, 38, 60])} sát thương, 30% làm Chậm 30% trong 3s.`,
		onHit: (star) => ({
			chance: 0.3,
			effects: [{ kind: 'status', status: 'slow', duration: 3000, value: 30 - (4 - star) * 3, stacks: 1, target: 'enemy' }],
		}),
	},
	{
		id: 'poison-dagger',
		name: 'Chủy Độc',
		cls: 'weapon',
		icon: '☠️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		attackInterval: (star) => Math.round(950 - 50 * (star - 1)),
		damage: (star) => pick(star, [8, 13, 21, 34]),
		desc: (star) => `Đâm nhanh, 45% gây Độc ${pick(star, [12, 19, 30, 48])}/s trong 4s.`,
		onHit: (star) => ({
			chance: 0.45,
			effects: [
				{ kind: 'status', status: 'poison', duration: 4000, value: pick(star, [12, 19, 30, 48]), stacks: 1, target: 'enemy' },
			],
		}),
	},
	{
		id: 'great-axe',
		name: 'Phủ Nặng',
		cls: 'weapon',
		icon: '🪓',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		attackInterval: (star) => Math.round(2300 - 140 * (star - 1)),
		damage: (star) => pick(star, [34, 56, 92, 150]),
		desc: (star) => `Bổ chậm nhưng nặng ${pick(star, [34, 56, 92, 150])} sát thương.`,
	},
	{
		id: 'twin-claws',
		name: 'Song Trảo',
		cls: 'weapon',
		icon: '🐾',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 9,
		space: { w: 2, h: 1 },
		attackInterval: (star) => Math.round(750 - 40 * (star - 1)),
		damage: (star) => pick(star, [9, 15, 24, 39]),
		desc: (star) => `Cào liên tục ${pick(star, [9, 15, 24, 39])} sát thương, cộng +${pick(star, [4, 7, 11, 17])}% tốc đánh.`,
		passive: (star) => ({ haste: pick(star, [4, 7, 11, 17]) }),
	},

	// ── Hộ giáp ───────────────────────────────────────────────────────────────
	{
		id: 'hide-vest',
		name: 'Giáp Da',
		cls: 'armor',
		icon: '🦺',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 2, h: 2 },
		desc: (star) => `Giáp khởi đầu ${pick(star, [180, 240, 300, 450])}.`,
		passive: (star) => ({ shield: pick(star, [180, 240, 300, 450]) }),
	},
	{
		id: 'chain-mail',
		name: 'Giáp Xích',
		cls: 'armor',
		icon: '⛓️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 2, h: 2 },
		desc: (star) => `Giáp ${pick(star, [240, 340, 460, 700])}, giảm ${pick(star, [3, 5, 7, 10])}% sát thương.`,
		passive: (star) => ({ shield: pick(star, [240, 340, 460, 700]), dr: pick(star, [3, 5, 7, 10]) }),
	},
	{
		id: 'warden-plate',
		name: 'Giáp Vệ Binh',
		cls: 'armor',
		icon: '🛡️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		desc: (star) => `Giáp ${pick(star, [320, 470, 660, 980])}, giảm ${pick(star, [6, 9, 12, 16])}% sát thương.`,
		passive: (star) => ({ shield: pick(star, [320, 470, 660, 980]), dr: pick(star, [6, 9, 12, 16]) }),
	},

	// ── Hồn Ngọc ──────────────────────────────────────────────────────────────
	{
		id: 'jade-fury',
		name: 'Hồn Ngọc Phẫn Nộ',
		cls: 'souljade',
		icon: '💠',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		desc: (star) => `+${pick(star, [6, 10, 16, 26])} sát thương cho mọi đòn đánh.`,
		passive: (star) => ({ atk: pick(star, [6, 10, 16, 26]) }),
	},
	{
		id: 'jade-haste',
		name: 'Hồn Ngọc Thôi Sách',
		cls: 'souljade',
		icon: '🌪️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		desc: (star) => `+${pick(star, [8, 12, 17, 24])}% tốc độ đánh.`,
		passive: (star) => ({ haste: pick(star, [8, 12, 17, 24]) }),
	},
	{
		id: 'jade-crit',
		name: 'Hồn Ngọc Chí Mạng',
		cls: 'souljade',
		icon: '🎯',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) => `+${pick(star, [8, 12, 18, 25])}% tỉ lệ chí mạng (×1.8 sát thương).`,
		passive: (star) => ({ critRate: pick(star, [8, 12, 18, 25]) }),
	},
	{
		id: 'jade-vampire',
		name: 'Hồn Ngọc Huyết Ẩm',
		cls: 'souljade',
		icon: '🩸',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		desc: (star) => `Hút ${pick(star, [6, 9, 13, 18])}% sát thương gây ra thành máu.`,
		passive: (star) => ({ lifesteal: pick(star, [6, 9, 13, 18]) }),
	},
	{
		id: 'jade-guard',
		name: 'Hồn Ngọc Hộ Thể',
		cls: 'souljade',
		icon: '🧿',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		desc: (star) => `Giảm ${pick(star, [5, 8, 11, 15])}% sát thương nhận vào.`,
		passive: (star) => ({ dr: pick(star, [5, 8, 11, 15]) }),
	},
	{
		id: 'jade-sword',
		name: 'Hồn Ngọc Kiếm Thế',
		cls: 'souljade',
		icon: '⚔️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) =>
			`+${pick(star, [3, 5, 8, 12])} Kiếm Thế/s và +${pick(star, [5, 8, 12, 18])}% tỉ lệ Chấn Đao.`,
		passive: (star) => ({ seRegen: pick(star, [3, 5, 8, 12]), counterChance: pick(star, [5, 8, 12, 18]) }),
	},

	// ── Pháp Bảo (kích hoạt theo nhịp) ────────────────────────────────────────
	{
		id: 'war-drum',
		name: 'Trống Trận',
		cls: 'curio',
		icon: '🥁',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 2, h: 2 },
		desc: (star) => `Hào khí: vũ khí LIỀN KỀ +${pick(star, [10, 15, 22, 32])}% sát thương.`,
		aura: (star) => ({ target: 'adjacentWeapon', mods: { atkPct: pick(star, [10, 15, 22, 32]) } }),
	},
	{
		id: 'ghost-lantern',
		name: 'Đèn Quỷ',
		cls: 'curio',
		icon: '🏮',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 4,
		space: { w: 1, h: 2 },
		desc: (star) => `Mỗi ${(9000 - 700 * (star - 1)) / 1000}s tạo khiên ${pick(star, [60, 100, 160, 260])}.`,
		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [{ kind: 'shield', amount: pick(star, [60, 100, 160, 260]) }],
	},
	{
		id: 'forge-fang',
		name: 'Nanh Lò Rèn',
		cls: 'curio',
		icon: '🐺',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 2 },
		desc: (star) => `Mỗi ${(9500 - 900 * (star - 1)) / 1000}s cắn ${pick(star, [22, 36, 58, 94])} sát thương.`,
		interval: (star) => 9500 - 900 * (star - 1),
		active: (star) => [{ kind: 'damage', amount: pick(star, [22, 36, 58, 94]) }],
	},
	{
		id: 'venom-vial',
		name: 'Lọ Độc',
		cls: 'curio',
		icon: '⚗️',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(7500 - 600 * (star - 1)) / 1000}s tẩm Độc ${pick(star, [35, 55, 85, 135])}/s trong 4s.`,
		interval: (star) => 7500 - 600 * (star - 1),
		active: (star) => [
			{ kind: 'status', status: 'poison', duration: 4000, value: pick(star, [35, 55, 85, 135]), stacks: 1, target: 'enemy' },
		],
	},
	{
		id: 'storm-bell',
		name: 'Chuông Bão',
		cls: 'curio',
		icon: '🔔',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(8500 - 700 * (star - 1)) / 1000}s nổi cuồng phong: +${pick(star, [20, 26, 33, 42])}% tốc đánh 4s.`,
		interval: (star) => 8500 - 700 * (star - 1),
		active: (star) => [
			{ kind: 'status', status: 'haste', duration: 4000, value: pick(star, [20, 26, 33, 42]), stacks: 1, target: 'self' },
		],
	},
	{
		id: 'divine-forger',
		name: 'Thần Đúc Sư',
		cls: 'curio',
		icon: '🔨',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 8,
		space: { w: 2, h: 2 },
		desc: (star) =>
			`Mỗi ${(9500 - 800 * (star - 1)) / 1000}s: bản thân + vật phẩm LIỀN KỀ được Giải Chậm/Đóng Băng, hồi ${pick(star, [15, 25, 40, 65])} máu.`,
		interval: (star) => 9500 - 800 * (star - 1),
		passive: (star) => ({ dr: pick(star, [2, 3, 4, 6]) }),
		active: (star) => [
			{ kind: 'cleanse', statuses: ['slow', 'freeze'], scope: 'adjacent' },
			{ kind: 'heal', amount: pick(star, [15, 25, 40, 65]) },
		],
	},
	{
		id: 'frost-seal',
		name: 'Hàn Ngọc Phù',
		cls: 'curio',
		icon: '🧊',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(11000 - 800 * (star - 1)) / 1000}s Đóng Băng địch ${(1 + 0.15 * (star - 1)).toFixed(2)}s và gây ${pick(star, [15, 25, 40, 65])} sát thương.`,
		interval: (star) => 11000 - 800 * (star - 1),
		active: (star) => [
			{ kind: 'damage', amount: pick(star, [15, 25, 40, 65]) },
			{ kind: 'status', status: 'freeze', duration: Math.round((1 + 0.15 * (star - 1)) * 1000), value: 0, stacks: 1, target: 'enemy' },
		],
	},
	{
		id: 'mirror-shard',
		name: 'Mảnh Gương',
		cls: 'curio',
		icon: '🪞',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 1, h: 2 },
		desc: (star) => `Mỗi ${(9000 - 700 * (star - 1)) / 1000}s phản chiếu 1 đòn (${pick(star, [100, 130, 170, 220])}% sát thương vũ khí) và làm Giòn địch 5s.`,		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [
			{ kind: 'damage', amount: 0, atkScale: pick(star, [1, 1.3, 1.7, 2.2]) },
			{ kind: 'status', status: 'brittle', duration: 5000, value: pick(star, [8, 12, 16, 22]), stacks: 1, target: 'enemy' },
		],
	},
	{
		id: 'silk-banner',
		name: 'Cờ Lụa',
		cls: 'curio',
		icon: '🎏',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 2, h: 1 },
		desc: (star) => `Vật phẩm LIỀN KỀ (không phải vũ khí) +${pick(star, [25, 45, 75, 120])} máu tối đa.`,
		aura: (star) => ({ target: 'adjacentNonWeapon', mods: { maxHp: pick(star, [25, 45, 75, 120]) } }),
	},

	// ── Đan dược ──────────────────────────────────────────────────────────────
	{
		id: 'heal-dew',
		name: 'Lộ Sương Trị Thương',
		cls: 'potion',
		icon: '🧪',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(6500 - 500 * (star - 1)) / 1000}s hồi ${pick(star, [40, 70, 115, 185])} máu.`,
		interval: (star) => 6500 - 500 * (star - 1),
		active: (star) => [{ kind: 'heal', amount: pick(star, [40, 70, 115, 185]) }],
	},
	{
		id: 'tiger-tonic',
		name: 'Hổ Cốt Tửu',
		cls: 'potion',
		icon: '🍶',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(10000 - 700 * (star - 1)) / 1000}s nạp ${pick(star, [25, 40, 60, 90])} Kiếm Thế.`,
		interval: (star) => 10000 - 700 * (star - 1),
		active: (star) => [{ kind: 'swordEnergy', amount: pick(star, [25, 40, 60, 90]) }],
	},
	{
		id: 'iron-brew',
		name: 'Thuốc Sắt',
		cls: 'potion',
		icon: '🫙',
		// Có art 128×128 cho cả 4 sao trong public/icons/items/<id>-<sao>.png
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 6,
		space: { w: 1, h: 2 },
		desc: (star) => `Mỗi ${(9000 - 700 * (star - 1)) / 1000}s tạo khiên ${pick(star, [80, 130, 210, 330])} và hồi máu ${pick(star, [10, 18, 30, 50])}/s trong 4s.`,
		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [
			{ kind: 'shield', amount: pick(star, [80, 130, 210, 330]) },
			{ kind: 'status', status: 'regen', duration: 4000, value: pick(star, [10, 18, 30, 50]), stacks: 1, target: 'self' },
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
