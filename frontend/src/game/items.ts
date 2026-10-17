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

/** Items with their per-star numbers. Values mirror the public event tuning. */
export const ITEM_TEMPLATES: ItemTemplate[] = [
	// ── Weapons ─ ───────────────────────────────────────────────────────────────
	{
		id: 'wooden-blade',
		name: 'Đao Gỗ',
		cls: 'weapon',
		quality: 1,
		icon: '🗡️',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 3 },
		attackInterval: (star) => Math.round(1500 - 90 * (star - 1)),
		damage: (star) => pick(star, [12, 20, 32, 50, 78]),
		desc: (star) => `Chém ${pick(star, [12, 20, 32, 50, 78])} sát thương mỗi ${(1500 - 90 * (star - 1)) / 1000}s.`,
	},
	{
		id: 'fire-spear',
		name: 'Thương Lửa',
		cls: 'weapon',
		quality: 2,
		icon: '🔥',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 4,
		space: { w: 1, h: 4 },
		attackInterval: (star) => Math.round(1400 - 90 * (star - 1)),
		damage: (star) => pick(star, [10, 17, 28, 45, 72]),
		desc: (star) =>
			`Đâm ${pick(star, [10, 17, 28, 45, 72])} sát thương, 25% gây Cháy ${pick(star, [14, 22, 34, 52, 80])}/s trong 3s.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 2, h: 1 },
		attackInterval: (star) => Math.round(1300 - 70 * (star - 1)),
		damage: (star) => pick(star, [14, 23, 38, 60, 95]),
		desc: (star) =>
			`Quạt ${pick(star, [14, 23, 38, 60, 95])} sát thương, 30% làm Chậm ${slowValue(star)}% trong 3s.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		attackInterval: (star) => Math.round(950 - 50 * (star - 1)),
		damage: (star) => pick(star, [8, 13, 21, 34, 55]),
		desc: (star) => `Đâm nhanh, 45% gây Độc ${pick(star, [12, 19, 30, 48, 75])}/s trong 4s.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		attackInterval: (star) => Math.round(2300 - 140 * (star - 1)),
		damage: (star) => pick(star, [34, 56, 92, 150, 245]),
		desc: (star) => `Bổ chậm nhưng nặng ${pick(star, [34, 56, 92, 150, 245])} sát thương.`,
	},
	{
		id: 'twin-claws',
		name: 'Song Trảo',
		cls: 'weapon',
		quality: 5,
		icon: '🐾',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 9,
		space: { w: 2, h: 1 },
		attackInterval: (star) => Math.round(750 - 40 * (star - 1)),
		damage: (star) => pick(star, [9, 15, 24, 39, 63]),
		desc: (star) =>
			`Cào liên tục ${pick(star, [9, 15, 24, 39, 63])} sát thương, cộng +${pick(star, [4, 7, 11, 17, 27])}% tốc đánh.`,
		passive: (star) => ({ haste: pick(star, [4, 7, 11, 17, 27]) }),
	},

	// ── Armor ─ ─────────────────────────────────────────────────────────────────
	{
		id: 'hide-vest',
		name: 'Giáp Da',
		cls: 'armor',
		quality: 1,
		icon: '🦺',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 2, h: 2 },
		desc: (star) => `Giáp khởi đầu ${pick(star, [180, 240, 300, 450, 675])}.`,
		passive: (star) => ({ shield: pick(star, [180, 240, 300, 450, 675]) }),
	},
	{
		id: 'chain-mail',
		name: 'Giáp Xích',
		cls: 'armor',
		quality: 3,
		icon: '⛓️',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 2, h: 2 },
		desc: (star) =>
			`Giáp ${pick(star, [240, 340, 460, 700, 1050])}, giảm ${pick(star, [3, 5, 7, 10, 15])}% sát thương.`,
		passive: (star) => ({ shield: pick(star, [240, 340, 460, 700, 1050]), dr: pick(star, [3, 5, 7, 10, 15]) }),
	},
	{
		id: 'warden-plate',
		name: 'Giáp Vệ Binh',
		cls: 'armor',
		quality: 5,
		icon: '🛡️',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 8,
		space: { w: 2, h: 3 },
		desc: (star) =>
			`Giáp ${pick(star, [320, 470, 660, 980, 1450])}, giảm ${pick(star, [6, 9, 12, 16, 22])}% sát thương.`,
		passive: (star) => ({ shield: pick(star, [320, 470, 660, 980, 1450]), dr: pick(star, [6, 9, 12, 16, 22]) }),
	},

	// ── Soul Jades ─ ────────────────────────────────────────────────────────────
	{
		id: 'jade-fury',
		name: 'Hồn Ngọc Phẫn Nộ',
		cls: 'souljade',
		quality: 2,
		icon: '💠',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		desc: (star) => `+${pick(star, [6, 10, 16, 26, 42])} sát thương cho mọi đòn đánh.`,
		passive: (star) => ({ atk: pick(star, [6, 10, 16, 26, 42]) }),
	},
	{
		id: 'jade-haste',
		name: 'Hồn Ngọc Thôi Sách',
		cls: 'souljade',
		quality: 1,
		icon: '🌪️',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		desc: (star) => `+${pick(star, [8, 12, 17, 24, 34])}% tốc độ đánh.`,
		passive: (star) => ({ haste: pick(star, [8, 12, 17, 24, 34]) }),
	},
	{
		id: 'jade-crit',
		name: 'Hồn Ngọc Chí Mạng',
		cls: 'souljade',
		quality: 3,
		icon: '🎯',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) => `+${pick(star, [8, 12, 18, 25, 35])}% tỉ lệ chí mạng (×1.8 sát thương).`,
		passive: (star) => ({ critRate: pick(star, [8, 12, 18, 25, 35]) }),
	},
	{
		id: 'jade-vampire',
		name: 'Hồn Ngọc Huyết Ẩm',
		cls: 'souljade',
		quality: 3,
		icon: '🩸',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		desc: (star) => `Hút ${pick(star, [6, 9, 13, 18, 25])}% sát thương gây ra thành máu.`,
		passive: (star) => ({ lifesteal: pick(star, [6, 9, 13, 18, 25]) }),
	},
	{
		id: 'jade-guard',
		name: 'Hồn Ngọc Hộ Thể',
		cls: 'souljade',
		quality: 4,
		icon: '🧿',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		desc: (star) => `Giảm ${pick(star, [5, 8, 11, 15, 21])}% sát thương nhận vào.`,
		passive: (star) => ({ dr: pick(star, [5, 8, 11, 15, 21]) }),
	},
	{
		id: 'jade-sword',
		name: 'Hồn Ngọc Kiếm Thế',
		cls: 'souljade',
		quality: 3,
		icon: '⚔️',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) =>
			`+${pick(star, [3, 5, 8, 12, 19])} Kiếm Thế/s và +${pick(star, [5, 8, 12, 18, 27])}% tỉ lệ Chấn Đao.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 2, h: 2 },
		desc: (star) => `Hào khí: vũ khí LIỀN KỀ +${pick(star, [10, 15, 22, 32, 48])}% sát thương.`,
		aura: (star) => ({ target: 'adjacentWeapon', mods: { atkPct: pick(star, [10, 15, 22, 32, 48]) } }),
	},
	{
		id: 'ghost-lantern',
		name: 'Đèn Quỷ',
		cls: 'curio',
		quality: 2,
		icon: '🏮',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 4,
		space: { w: 1, h: 2 },
		desc: (star) => `Mỗi ${(9000 - 700 * (star - 1)) / 1000}s tạo khiên ${pick(star, [60, 100, 160, 260, 420])}.`,
		interval: (star) => 9000 - 700 * (star - 1),
		active: (star) => [{ kind: 'shield', amount: pick(star, [60, 100, 160, 260, 420]) }],
	},
	{
		id: 'forge-fang',
		name: 'Nanh Lò Rèn',
		cls: 'curio',
		quality: 3,
		icon: '🐺',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 2 },
		desc: (star) => `Mỗi ${(9500 - 900 * (star - 1)) / 1000}s cắn ${pick(star, [22, 36, 58, 94, 150])} sát thương.`,
		interval: (star) => 9500 - 900 * (star - 1),
		active: (star) => [{ kind: 'damage', amount: pick(star, [22, 36, 58, 94, 150]) }],
	},
	{
		id: 'venom-vial',
		name: 'Lọ Độc',
		cls: 'curio',
		quality: 3,
		icon: '⚗️',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) =>
			`Mỗi ${(7500 - 600 * (star - 1)) / 1000}s tẩm Độc ${pick(star, [35, 55, 85, 135, 215])}/s trong 4s.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 6,
		space: { w: 1, h: 1 },
		desc: (star) =>
			`Mỗi ${(8500 - 700 * (star - 1)) / 1000}s nổi cuồng phong: +${pick(star, [20, 26, 33, 42, 54])}% tốc đánh 4s.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 8,
		space: { w: 2, h: 2 },
		desc: (star) =>
			`Mỗi ${(9500 - 800 * (star - 1)) / 1000}s: bản thân + vật phẩm LIỀN KỀ được Giải Chậm/Đóng Băng, hồi ${pick(star, [15, 25, 40, 65, 105])} máu.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 1, h: 1 },
		desc: (star) =>
			`Mỗi ${(11000 - 800 * (star - 1)) / 1000}s Đóng Băng địch ${(1 + 0.15 * (star - 1)).toFixed(2)}s và gây ${pick(star, [15, 25, 40, 65, 105])} sát thương.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 1, h: 2 },
		desc: (star) =>
			`Mỗi ${(9000 - 700 * (star - 1)) / 1000}s phản chiếu 1 đòn (${pick(star, [100, 130, 170, 220, 290])}% sát thương vũ khí) và làm Giòn địch 5s.`,
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
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 7,
		space: { w: 2, h: 1 },
		desc: (star) => `Vật phẩm LIỀN KỀ (không phải vũ khí) +${pick(star, [25, 45, 75, 120, 195])} máu tối đa.`,
		aura: (star) => ({ target: 'adjacentNonWeapon', mods: { maxHp: pick(star, [25, 45, 75, 120, 195]) } }),
	},

	// ── Potions ─ ───────────────────────────────────────────────────────────────
	{
		id: 'heal-dew',
		name: 'Lộ Sương Trị Thương',
		cls: 'potion',
		quality: 1,
		icon: '🧪',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 1,
		cost: 3,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(6500 - 500 * (star - 1)) / 1000}s hồi ${pick(star, [40, 70, 115, 185, 300])} máu.`,
		interval: (star) => 6500 - 500 * (star - 1),
		active: (star) => [{ kind: 'heal', amount: pick(star, [40, 70, 115, 185, 300]) }],
	},
	{
		id: 'tiger-tonic',
		name: 'Hổ Cốt Tửu',
		cls: 'potion',
		quality: 3,
		icon: '🍶',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 2,
		cost: 5,
		space: { w: 1, h: 1 },
		desc: (star) => `Mỗi ${(10000 - 700 * (star - 1)) / 1000}s nạp ${pick(star, [25, 40, 60, 90, 135])} Kiếm Thế.`,
		interval: (star) => 10000 - 700 * (star - 1),
		active: (star) => [{ kind: 'swordEnergy', amount: pick(star, [25, 40, 60, 90, 135]) }],
	},
	{
		id: 'iron-brew',
		name: 'Thuốc Sắt',
		cls: 'potion',
		quality: 4,
		icon: '🫙',
		// Art exists for star ranks 1–4 in public/icons/items/<id>-<star>.png; 5★ falls back to the emoji.
		stars: [1, 2, 3, 4],
		tier: 3,
		cost: 6,
		space: { w: 1, h: 2 },
		desc: (star) =>
			`Mỗi ${(9000 - 700 * (star - 1)) / 1000}s tạo khiên ${pick(star, [80, 130, 210, 330, 510])} và hồi máu ${pick(star, [10, 18, 30, 50, 80])}/s trong 4s.`,
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
