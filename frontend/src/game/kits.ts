import type { Direction } from './bag'
import type {
	AuraSpec,
	ChargeKit,
	ItemKit,
	ItemKitId,
	OnHitKit,
	OnHitKitId,
	ChargeKitId,
	KitAppliesTo,
	OptionKitId,
	StatMods,
	StatKey,
	Star,
} from './types'

/**
 * **Kit catalogue** — the reusable combat mechanics an item can carry.
 *
 * A kit is plain data on the item (`ItemTemplate.kits`) and is interpreted in `build.ts`, so the
 * admin page can add or remove one without touching the engine. Every parameter holds **one value per
 * star rank** (1★ → 5★), exactly like the other per-star fields.
 *
 * ❌ Do not give an item a mechanic through a one-off template field again: add a kit instead, so the
 * admin page can offer it to every item.
 */

export interface KitParamDef {
	key: string
	label: string
	min: number
	max: number
	integer?: boolean
	/** Seed value when the kit is added from the admin page. */
	default: number
	/**
	 * Optional seed per star rank (1★ → 5★), overriding `default` for that rank. Use it when the
	 * designer's table is not flat (a 1/1/1/2/2 s freeze, a 10→50 % slow…).
	 */
	defaults?: readonly [number, number, number, number, number]
	/**
	 * Fixed list of values: the box becomes a **select** instead of a number input, and the stored
	 * number is the chosen `value`, so the payload stays a plain table of numbers.
	 */
	choices?: { value: number; label: string }[]
	/**
	 * One control for the whole kit instead of one per star rank — for a setting that describes how
	 * the effect works rather than how strong it is (`scaling`). The value is copied to all five
	 * entries so `params` keeps its shape.
	 */
	single?: boolean
	/**
	 * A control that is not a plain number box: `directions` draws the up / down / left / right
	 * toggles and stores them as one **bitmask** (`DIRECTION_BITS` in `game/bag.ts`), so the payload
	 * stays a table of numbers.
	 */
	control?: 'directions'
	/**
	 * Only draw this parameter while another parameter holds one of these values — a `directions`
	 * bitmask means nothing when the kit targets its own item, and a duration means nothing when the
	 * boost never expires.
	 */
	showWhen?: { key: string; values: readonly number[] }
	/**
	 * The stored number is `shown × displayScale`. Durations are stored in **milliseconds** (the
	 * simulation's own unit) but typed and read in **seconds**, so their boxes carry `1000`.
	 */
	displayScale?: number
}

/** One direction, shown on the toggle that sets its bit in the `directions` parameter. */
export const DIRECTION_LABELS: Record<Direction, string> = {
	up: 'Lên',
	down: 'Xuống',
	left: 'Trái',
	right: 'Phải',
}

export interface KitDef {
	id: ItemKitId
	/**
	 * `attack` = a swing of its own (an item may carry several); `onHit` / `charge` = lives **inside**
	 * one attack kit; `option` = sits beside the attack kits.
	 *
	 * ⚠️ `kind` describes **how the engine runs** the kit (and where the admin may attach it), never
	 * what the kit is *for* — that is `category`.
	 */
	kind: 'attack' | 'onHit' | 'charge' | 'option'
	/**
	 * Which catalogue the kit is filed under (`/admin` → Kits), in designer words: a damage mechanic,
	 * a debuff, a buff, a survival tool, or a stat/resource change.
	 *
	 * ⚠️ A plain string, because the catalogues are **data** (`kit_categories`): an admin can rename
	 * them and add more. The code value is the fallback used while no catalogue has been loaded.
	 * Purely a reading aid; nothing in `build.ts` / `battle.ts` branches on it.
	 */
	category: string
	/**
	 * Who may carry it: `both` = an item **and** a Cutie, `item` = an item only.
	 *
	 * Must stay in sync with `asKits(..., allowOptions)` in `backend/src/content.ts`, which rejects an
	 * `option` kit on a Cutie — an item-only kit is exactly that set.
	 */
	appliesTo: KitAppliesTo
	/**
	 * The **code mechanic** this kit runs on. Absent for a code kit (it is its own mechanic) and set for
	 * a kit created on the admin page (`burn-on-hit-2` → `burn-on-hit`): the engine only ever branches on
	 * the mechanic, never on the id.
	 */
	mechanic?: ItemKitId
	/** Order inside its catalogue. Absent = after every kit that has one (code order kept). */
	position?: number
	label: string
	params: KitParamDef[]
}

/** Seed of one parameter at one star rank: the per-star table first, then the flat default. */
export function kitSeed(param: KitParamDef, index: number): number {
	return param.defaults?.[index] ?? param.default
}

const CHANCE: KitParamDef = {
	key: 'chance',
	label: 'Tỉ lệ kích hoạt (%)',
	min: 0,
	max: 100,
	default: 30,
}

const STATUS_DURATION: KitParamDef = {
	key: 'duration',
	label: 'Thời gian (giây)',
	min: 100,
	max: 60_000,
	integer: true,
	default: 3000,
	displayScale: 1000,
}

/** The freeze table from the rules: 1/1/1/2/2 seconds by star rank. */
const FREEZE_DURATION: KitParamDef = {
	key: 'duration',
	label: 'Thời gian đóng băng (giây)',
	min: 100,
	max: 10_000,
	integer: true,
	default: 1000,
	defaults: [1000, 1000, 1000, 2000, 2000],
	displayScale: 1000,
}

/** How long a cooldown-reduction buff stays on a weapon, in milliseconds (typed in seconds). */
const BOOST_DURATION: KitParamDef = {
	key: 'duration',
	label: 'Thời gian buff (giây)',
	min: 100,
	max: 30_000,
	integer: true,
	default: 4000,
	displayScale: 1000,
}

/**
 * The 50→100 % cooldown-reduction table shared by the two "support" gems.
 *
 * ⚠️ It is **temporary** on purpose: it only runs for `BOOST_DURATION` after the gem's trigger fires,
 * so the label says so.
 */
const BOOST_VALUE: KitParamDef = {
	key: 'boost',
	label: 'Giảm hồi chiêu tạm thời (Temporary cooldown reduction, %)',
	min: 0,
	max: 500,
	default: 50,
	defaults: [50, 60, 70, 80, 100],
}

/** Damage gained per stack of a "rage" kit, capped at `maxStacks`. */
const RAGE_VALUE: KitParamDef = {
	key: 'value',
	label: 'Sát thương cộng thêm mỗi tầng (%)',
	min: 0,
	max: 100,
	default: 2,
	defaults: [2, 3, 4, 5, 6],
}

const RAGE_MAX: KitParamDef = {
	key: 'maxStacks',
	label: 'Số tầng tối đa',
	min: 1,
	max: 50,
	integer: true,
	default: 10,
	single: true,
}

/**
 * **Which weapon a support gem buffs.** Chosen once for the whole kit:
 * - `Theo hướng` — only the neighbours on the ticked sides (up / down / left / right, any mix);
 * - `Ngẫu nhiên` — one random weapon of the owner (melee / ranged / artifact).
 */
const BUFF_TARGET: KitParamDef = {
	key: 'target',
	label: 'Chọn mục tiêu buff',
	min: 0,
	max: 1,
	integer: true,
	default: 0,
	single: true,
	choices: [
		{ value: 0, label: 'Theo hướng liền kề' },
		{ value: 1, label: 'Ngẫu nhiên' },
	],
}

/** Bitmask of the directions to buff (`15` = all four). Only used by `target = 0`. */
const BUFF_DIRECTIONS: KitParamDef = {
	key: 'directions',
	label: 'Hướng buff',
	min: 0,
	max: 15,
	integer: true,
	default: 15,
	single: true,
	control: 'directions',
	showWhen: { key: 'target', values: [0] },
}

/** The numeric value of `BUFF_TARGET` that means "the sides ticked in `directions`". */
export const BUFF_TARGET_DIRECTIONS = 0
/** The numeric value of `BUFF_TARGET` that means "one random weapon". */
export const BUFF_TARGET_RANDOM = 1

/** What a `damage-boost` kit lifts: the item's own swings, or the weapons on the ticked sides. */
const BOOST_TARGET: KitParamDef = {
	key: 'target',
	label: 'Tăng cho',
	min: 0,
	max: 1,
	integer: true,
	default: 0,
	single: true,
	choices: [
		{ value: 0, label: 'Đòn của chính món này' },
		{ value: 1, label: 'Vũ khí theo hướng liền kề' },
	],
}

/** The numeric value of `BOOST_TARGET` that means "this item's own swings". */
export const BOOST_TARGET_SELF = 0
/** The numeric value of `BOOST_TARGET` that means "the weapons on the ticked sides". */
export const BOOST_TARGET_SIDES = 1

/** Which side of a `damage-boost` kit the arrows pick. Only read when `target = 1`. */
const BOOST_DIRECTIONS: KitParamDef = {
	...BUFF_DIRECTIONS,
	label: 'Hướng tăng sát thương',
	showWhen: { key: 'target', values: [BOOST_TARGET_SIDES] },
}

/**
 * What starts a `damage-boost`: nothing (it stays on), or one of the events the owner already has.
 * Stored as the number the select writes, so the payload stays a table of numbers.
 */
const BOOST_TRIGGER: KitParamDef = {
	key: 'trigger',
	label: 'Kích hoạt khi',
	min: 0,
	max: 3,
	integer: true,
	default: 0,
	single: true,
	choices: [
		{ value: 0, label: 'Liên tục' },
		{ value: 1, label: 'Khi trúng đòn' },
		{ value: 2, label: 'Khi hồi máu' },
		{ value: 3, label: 'Khi bị đóng băng' },
	],
}

export const BOOST_TRIGGER_ALWAYS = 0
export const BOOST_TRIGGER_HIT = 1
export const BOOST_TRIGGER_HEAL = 2
export const BOOST_TRIGGER_FROZEN = 3

export const KIT_DEFS: KitDef[] = [
	{
		id: 'basic-attack',
		kind: 'attack',
		category: 'attack',
		appliesTo: 'both',
		label: 'Đòn đánh cơ bản',
		// Damage first, cooldown right under it: the two numbers a weapon is judged by, in that order.
		params: [
			{
				// A multiplier of the **cutie's** attack: `1` hits for exactly that number.
				key: 'multiplier',
				label: 'Hệ số sát thương (Damage multiplier)',
				min: 0.1,
				max: 20,
				default: 1,
			},
			{
				// 🔴 **The only rhythm number in the game**: seconds between two swings of this attack.
				// It belongs to the item (per star rank), not to the Cutie — there is no attack speed any
				// more, so `1.6` simply means "a hit every 1.6 s".
				key: 'cooldown',
				label: 'Hồi chiêu (giây, Cooldown Time)',
				min: 0.1,
				max: 60,
				default: 1.6,
			},
		],
	},
	{
		// A **sub-kit of `basic-attack`**, not a swing of its own: with enough Sword Energy the next
		// basic attack becomes this hit. It has no cooldown of its own — the basic attack keeps its own.
		id: 'charge-attack',
		kind: 'charge',
		category: 'attack',
		appliesTo: 'both',
		label: 'Trọng kích nạp',
		params: [
			{
				// The charged hit **replaces** the basic attack's damage instead of adding to it, so the
				// multiplier is the first thing to read — the Energy it costs comes after it.
				key: 'multiplier',
				// Same wording as the basic attack's own multiplier (`Hệ số sát thương`): one term for one number,
				// on every item and every kit.
				label: 'Hệ số sát thương',
				min: 0.1,
				max: 20,
				default: 2.2,
			},
			{
				// How much Energy the bar has to hold: **absolute points** (see `energyPoints`), the next
				// basic attack is only upgraded once the owner holds this much, and spends it.
				key: 'seNeed',
				label: 'Kiếm Thế cần',
				min: 0,
				max: 1000,
				integer: true,
				default: 100,
			},
		],
	},
	{
		id: 'burn-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Cháy khi trúng đòn',
		params: [
			CHANCE,
			STATUS_DURATION,
			{ key: 'value', label: 'Sát thương mỗi giây (% ATK Cutie)', min: 0, max: 10_000, default: 20 },
		],
	},
	{
		id: 'poison-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Độc khi trúng đòn',
		params: [
			CHANCE,
			{ ...STATUS_DURATION, default: 4000 },
			{ key: 'value', label: 'Sát thương mỗi giây (% ATK Cutie)', min: 0, max: 10_000, default: 20 },
		],
	},
	{
		id: 'slow-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Làm chậm khi trúng đòn',
		params: [
			CHANCE,
			STATUS_DURATION,
			{ key: 'value', label: 'Giảm tốc (%)', min: 0, max: 80, default: 20 },
		],
	},
	{
		// Freezes **one** enemy weapon at random, not the whole side: a frozen weapon keeps whatever
		// charge it had and resumes from there. Never re-freezes a target that is already frozen
		// unless every weapon is frozen.
		id: 'freeze-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Đóng băng khi trúng đòn',
		params: [CHANCE, FREEZE_DURATION],
	},
	{
		// Ice: the target's own armour cracks. `brittle` is a status the engine already runs (it raises
		// the damage the owner of the status takes), so this kit only has to hand it out.
		id: 'brittle-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Giòn khi trúng đòn',
		params: [
			CHANCE,
			STATUS_DURATION,
			{ key: 'value', label: 'Tăng sát thương nhận (%)', min: 0, max: 100, default: 15 },
		],
	},
	{
		// Fire: an open wound. The burn already halves what the target can heal back; this cuts it again
		// and stacks on top of it.
		id: 'wound-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Vết thương khi trúng đòn',
		params: [
			CHANCE,
			STATUS_DURATION,
			{ key: 'value', label: 'Giảm hồi máu nhận (%)', min: 0, max: 90, default: 35 },
		],
	},
	{
		// Water: the soaked target swings softer for a while.
		id: 'weaken-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Yếu ớt khi trúng đòn',
		params: [
			CHANCE,
			STATUS_DURATION,
			{ key: 'value', label: 'Giảm sát thương gây ra (%)', min: 0, max: 80, default: 20 },
		],
	},
	{
		// Thunder: a stun, i.e. **every** enemy weapon stops charging — stronger than a freeze, so it is
		// shorter and rarer. See `stun` in `game/types.ts`.
		id: 'shock-on-hit',
		kind: 'onHit',
		category: 'control',
		appliesTo: 'both',
		label: 'Tê liệt khi trúng đòn',
		params: [CHANCE, { ...FREEZE_DURATION, default: 800, label: 'Thời gian tê liệt (giây)' }],
	},
	{
		id: 'sword-energy-on-hit',
		kind: 'onHit',
		category: 'stats',
		appliesTo: 'both',
		label: 'Tích Kiếm Thế khi trúng đòn',
		params: [
			CHANCE,
			{
				key: 'amount',
				label: 'Kiếm Thế nhận',
				min: 0,
				max: 1000,
				integer: true,
				default: 6,
				defaults: [6, 8, 10, 13, 17],
			},
		],
	},
	{
		id: 'lifesteal-on-hit',
		kind: 'onHit',
		category: 'defense',
		appliesTo: 'both',
		label: 'Hút máu khi trúng đòn',
		params: [
			CHANCE,
			{ key: 'percent', label: 'Hồi máu (% sát thương)', min: 1, max: 100, integer: true, default: 15 },
		],
	},
	{
		id: 'shield-on-hit',
		kind: 'onHit',
		category: 'defense',
		appliesTo: 'both',
		label: 'Tạo khiên khi trúng đòn',
		params: [
			CHANCE,
			{ key: 'amount', label: 'Khiên (% máu tối đa)', min: 0, max: 500, default: 8 },
		],
	},
	{
		// Water: armour that only exists once something lands. The engine reaction runs from
		// `triggerAttacked`, so it needs no per-tick bookkeeping.
		id: 'shield-when-hit',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Giáp ảo khi bị đánh',
		params: [
			CHANCE,
			{ key: 'amount', label: 'Khiên (% máu tối đa)', min: 0, max: 500, default: 6 },
		],
	},
	{
		// Wood: the only kit that removes bad statuses. The engine effect (`cleanse`) already existed.
		id: 'cleanse',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Tẩy uế',
		params: [CHANCE],
	},
	{
		// Thunder: a critical hit pays Sword Energy back, so a crit build keeps its heavy hits coming.
		id: 'overcharge',
		kind: 'option',
		category: 'stats',
		appliesTo: 'item',
		label: 'Quá tải khi chí mạng',
		params: [{ key: 'amount', label: 'Kiếm Thế nhận', min: 0, max: 1000, integer: true, default: 25 }],
	},
	{
		id: 'stats',
		kind: 'option',
		category: 'stats',
		appliesTo: 'item',
		label: 'Chỉ số cộng thêm',
		params: [],
	},
	{
		// One kit for every item: on a weapon it lifts that weapon's own swings, on a gem it lifts the
		// weapons on the sides the designer ticks. `trigger` decides whether it is always on or only
		// runs for `duration` after the owner's own condition fires.
		id: 'damage-boost',
		kind: 'option',
		category: 'attack',
		appliesTo: 'item',
		label: 'Tăng sát thương',
		params: [
			{
				key: 'value',
				label: 'Sát thương cộng thêm (%)',
				min: 0,
				max: 500,
				default: 10,
				defaults: [10, 15, 22, 32, 48],
			},
			BOOST_TARGET,
			BOOST_DIRECTIONS,
			BOOST_TRIGGER,
			{ ...BOOST_DURATION, showWhen: { key: 'trigger', values: [1, 2, 3] } },
		],
	},
	{
		// The only way to change Sword Energy: `stats` / `aura` reject `seRegen` on purpose.
		id: 'sword-energy',
		kind: 'option',
		category: 'stats',
		appliesTo: 'item',
		label: 'Kiếm Thế',
		params: [{ key: 'regen', label: 'Hồi Kiếm Thế', min: -100, max: 500, default: 10 }],
	},
	{
		id: 'aura',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Hào khí liền kề',
		params: [],
	},
	{
		// Chấn Đao lives here now: a weapon grants the parry, there is no global counter chance.
		id: 'parry',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Chấn Đao',
		params: [
			{ key: 'chance', label: 'Tỉ lệ Chấn Đao (%)', min: 0, max: 100, default: 15 },
			{ key: 'cost', label: 'Kiếm Thế tiêu hao', min: 0, max: 1000, integer: true, default: 65 },
			{
				key: 'power',
				label: 'Sát thương phản kích (%)',
				min: 0,
				max: 1000,
				integer: true,
				default: 100,
			},
		],
	},

	// ── Freeze support gems ───────────────────────────────────────────────────
	{
		// Which weapons get the boost is part of the kit: the ticked sides around this gem, one random
		// one, or the weapon that caused the freeze.
		id: 'freeze-haste',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Hỗ trợ Băng · Giảm hồi chiêu',
		params: [BUFF_TARGET, BUFF_DIRECTIONS, BOOST_VALUE, BOOST_DURATION],
	},
	{
		id: 'freeze-heal',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Hỗ trợ Băng · Hồi máu',
		params: [
			{ key: 'amount', label: 'Máu hồi (% máu tối đa)', min: 0, max: 500, default: 4, defaults: [4, 6, 9, 14, 21] },
		],
	},
	{
		id: 'freeze-reflect',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Hỗ trợ Băng · Phản đòn',
		params: [CHANCE, FREEZE_DURATION],
	},

	// ── Slow / damage / sustain gems ──────────────────────────────────────────
	{
		id: 'slow-strike',
		kind: 'option',
		category: 'control',
		appliesTo: 'item',
		label: 'Hòn ngọc Làm chậm',
		params: [
			CHANCE,
			{
				key: 'value',
				label: 'Tăng hồi chiêu (%)',
				min: 0,
				max: 90,
				default: 20,
				defaults: [10, 20, 30, 40, 50],
			},
			STATUS_DURATION,
		],
	},
	{
		id: 'rage-on-hit',
		kind: 'option',
		category: 'attack',
		appliesTo: 'item',
		label: 'Hòn ngọc Cuồng nộ · Sát thương',
		params: [RAGE_VALUE, RAGE_MAX],
	},
	{
		id: 'rage-on-heal',
		kind: 'option',
		category: 'attack',
		appliesTo: 'item',
		label: 'Hòn ngọc Cuồng nộ · Hồi máu',
		params: [RAGE_VALUE, RAGE_MAX],
	},
	{
		id: 'armor-on-heal',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Hòn ngọc Giáp khi hồi máu',
		params: [
			{ key: 'amount', label: 'Giáp cộng thêm (% máu tối đa)', min: 0, max: 500, default: 3, defaults: [3, 5, 7, 10, 15] },
		],
	},
	{
		id: 'se-drain',
		kind: 'option',
		category: 'control',
		appliesTo: 'item',
		label: 'Hòn ngọc Hút Kiếm Thế',
		params: [
			CHANCE,
			{ key: 'amount', label: 'Kiếm Thế rút', min: 0, max: 1000, default: 4, defaults: [4, 6, 8, 11, 15] },
		],
	},
	{
		id: 'heal-haste',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Hòn ngọc Giảm hồi chiêu',
		params: [BUFF_TARGET, BUFF_DIRECTIONS, BOOST_VALUE, BOOST_DURATION],
	},

	// ── Defensive kits (intended for armour) ─────────────────────────────────
	{
		id: 'damage-reduction',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Giảm sát thương nhận vào',
		params: [
			{ key: 'value', label: 'Giảm sát thương (%)', min: 0, max: 75, default: 5, defaults: [5, 7, 9, 12, 16] },
		],
	},
	{
		id: 'starting-shield',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Giáp đầu trận',
		params: [
			{
				key: 'amount',
				label: 'Giáp khởi đầu (% máu tối đa)',
				min: 0,
				max: 500,
				default: 8,
				defaults: [8, 12, 18, 25, 35],
			},
		],
	},
	{
		id: 'healing-boost',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Tăng trị liệu nhận vào',
		params: [
			{ key: 'value', label: 'Tăng hồi máu (%)', min: 0, max: 200, default: 15, defaults: [15, 22, 30, 40, 55] },
		],
	},
	{
		id: 'regen',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Hồi máu theo giây',
		params: [
			{
				key: 'value',
				label: 'Hồi máu mỗi giây (% máu tối đa)',
				min: 0,
				max: 20,
				default: 0.6,
				defaults: [0.6, 0.9, 1.3, 1.8, 2.4],
			},
		],
	},
	{
		id: 'block-chance',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Đỡ đòn (tỉ lệ)',
		params: [
			{ key: 'chance', label: 'Tỉ lệ đỡ đòn (%)', min: 0, max: 100, default: 15, defaults: [15, 20, 26, 33, 42] },
		],
	},
	{
		id: 'debuff-heal',
		kind: 'option',
		category: 'support',
		appliesTo: 'item',
		label: 'Hồi máu khi dính hiệu ứng xấu',
		params: [
			{ key: 'amount', label: 'Máu hồi (% máu tối đa)', min: 0, max: 500, default: 3, defaults: [3, 4, 6, 9, 14] },
		],
	},
	{
		// The only kit that blocks a **charged** attack: enough Sword Energy and the hit is negated.
		id: 'block-charged',
		kind: 'option',
		category: 'defense',
		appliesTo: 'item',
		label: 'Đỡ đòn Trọng kích',
		params: [
			{
				key: 'seCost',
				label: 'Kiếm Thế tiêu hao',
				min: 0,
				max: 1000,
				integer: true,
				default: 60,
				defaults: [60, 55, 50, 45, 40],
			},
		],
	},
]

/**
 * Reading order of the code catalogue: biggest, most-used mechanics first, the numbers-only kits last.
 * `KIT_CATEGORY_LABELS` is the English heading the admin views draw with **no server**: the real
 * catalogues are rows in `kit_categories` and can be renamed or extended from `/admin`.
 */
export const KIT_CATEGORIES = ['attack', 'control', 'support', 'defense', 'stats'] as const

export const KIT_CATEGORY_LABELS: Record<string, string> = {
	attack: 'Attack',
	control: 'Control',
	support: 'Support',
	defense: 'Defense',
	stats: 'Stats & resources',
}

/**
 * Resolvable kits: the code catalogue, replaced by the **live** catalogue once the admin's overlay
 * (renamed / moved / created kits) has been applied — see `kitCatalogue()` in `game/content.ts`.
 *
 * ⚠️ Mutable on purpose: `kitDef` is called all over the engine (`build.ts`, `kitValue`, the item
 * editor), and a kit created on the admin page (`burn-on-hit-2`) must resolve **without** every one of
 * those call sites importing the overlay module (which would be a cycle).
 */
let KIT_BY_ID = new Map<string, KitDef>(KIT_DEFS.map((kit) => [kit.id, kit]))

/** Point the catalogue at the list the game actually plays with. Called by `game/content.ts`. */
export function registerKitCatalogue(defs: readonly KitDef[]): void {
	KIT_BY_ID = new Map(defs.map((def) => [def.id, def]))
}

/**
 * A kit nobody defined — an id that reached the game from an old save, or one whose mechanic no longer
 * exists. It has no parameters and the engine gives it no behaviour, which is the point: an unknown
 * kit must **render** (a missing `kitDef` used to throw during render, i.e. a blank page).
 */
const INERT_KIT: KitDef = {
	id: 'unknown-kit' as ItemKitId,
	kind: 'option',
	category: 'stats',
	appliesTo: 'item',
	label: 'Unknown kit',
	params: [],
}

/** Kits that swing an item; an item may carry more than one. */
export const ATTACK_KITS = KIT_DEFS.filter((kit) => kit.kind === 'attack')
/** Kits that live **inside** an attack kit. */
export const ON_HIT_KITS = KIT_DEFS.filter((kit) => kit.kind === 'onHit')
/** The charged variant of a basic attack (at most one per attack kit). */
export const CHARGE_KITS = KIT_DEFS.filter((kit) => kit.kind === 'charge')
/** Optional kits that sit beside the attack kits on the item. */
export const OPTION_KITS = KIT_DEFS.filter((kit) => kit.kind === 'option')

/**
 * Option kits that may sit on one item **more than once**, because each copy carries **one** stat.
 *
 * A stat kit is "a jade that gives Attack": the stat is the kit, so a second stat means a second kit
 * (❌ never two rows inside one kit). Every other kit stays attached at most once.
 */
export const REPEATABLE_OPTION_KITS: OptionKitId[] = ['stats', 'aura']

export function isRepeatableKit(id: ItemKitId): boolean {
	const mechanic = mechanicOf(id)
	return (REPEATABLE_OPTION_KITS as readonly string[]).includes(mechanic)
}

export function isKitId(value: unknown): value is ItemKitId {
	return typeof value === 'string' && KIT_BY_ID.has(value as ItemKitId)
}

export function isAttackKitId(value: unknown): value is ItemKitId {
	return isKitId(value) && kitDef(value).kind === 'attack'
}

export function isOnHitKitId(value: unknown): value is OnHitKitId {
	return isKitId(value) && kitDef(value).kind === 'onHit'
}

export function isChargeKitId(value: unknown): value is ChargeKitId {
	return isKitId(value) && kitDef(value).kind === 'charge'
}

export function isOptionKitId(value: unknown): value is OptionKitId {
	return isKitId(value) && kitDef(value).kind === 'option'
}

export function kitDef(id: ItemKitId): KitDef {
	return KIT_BY_ID.get(id) ?? INERT_KIT
}

/**
 * The **engine mechanic** of a kit: `burn-on-hit` for both `burn-on-hit` and a `burn-on-hit-2` created
 * on the admin page.
 *
 * 🔴 `build.ts` must branch on **this**, never on `kit.id`: an admin-made kit is a new id with no
 * behaviour of its own, and comparing the raw id would make it silently do nothing.
 */
export function mechanicOf(id: ItemKitId): ItemKitId {
	return kitDef(id).mechanic ?? id
}

/** A fresh kit with every parameter seeded for all five star ranks. */
export function defaultKit(id: ItemKitId): ItemKit {
	const def = kitDef(id)
	const params: Record<string, number[]> = {}
	for (const param of def.params) {
		params[param.key] = Array.from({ length: 5 }, (_unused, index) => kitSeed(param, index))
	}
	const mechanic = mechanicOf(id)
	if (mechanic === 'stats') {
		return { id, params, stats: Array.from({ length: 5 }, () => ({ atk: 0 })) }
	}
	if (mechanic === 'aura') {
		return {
			id,
			params,
			aura: Array.from({ length: 5 }, () => ({ target: 'adjacent' as const, mods: { atk: 0 } })),
		}
	}
	return { id, params }
}

/** One parameter at a star rank, clamped to the kit's range and falling back to its default. */
export function kitValue(kit: { id: ItemKitId; params: Record<string, number[]> }, key: string, star: Star): number {
	const param = kitDef(kit.id).params.find((entry) => entry.key === key)
	const stored = kit.params[key]?.[star - 1]
	const fallback = param ? kitSeed(param, star - 1) : 0
	const value = typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback
	if (!param) return value
	return Math.min(param.max, Math.max(param.min, value))
}

/**
 * The sides a **support gem** buffs, as one bitmask — `0` when the item has no such kit.
 *
 * When an item carries two buff gems with different sides the masks are **OR-ed**: the overlay on the
 * tile has to show every side a buff can reach. `0` means "no overlay at all".
 */
export function buffDirectionMask(kits: ItemKit[] | undefined, star: Star): number {
	let mask = 0
	for (const kit of kits ?? []) {
		if (!kitDef(kit.id).params.some((param) => param.control === 'directions')) continue
		if (Math.round(kitValue(kit, 'target', star)) !== BUFF_TARGET_DIRECTIONS) continue
		mask |= Math.round(kitValue(kit, 'directions', star))
	}
	return mask
}

/** Normalise one kit's parameters: only the kit's own keys, five numeric values each. */
function normalizeParams(id: ItemKitId, rawParams: unknown): Record<string, number[]> {
	const params: Record<string, number[]> = {}
	const stored = (typeof rawParams === 'object' && rawParams !== null ? rawParams : {}) as Record<
		string,
		unknown
	>
	for (const param of kitDef(id).params) {
		const values = stored[param.key]
		params[param.key] = Array.from({ length: 5 }, (_, index) => {
			const value = Array.isArray(values) ? values[index] : undefined
			return typeof value === 'number' && Number.isFinite(value) ? value : kitSeed(param, index)
		})
	}
	return params
}

/** On-hit kits stored inside an attack kit; unknown and duplicate ids are dropped. */
function normalizeOnHit(value: unknown): OnHitKit[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<OnHitKitId>()
	const effects: OnHitKit[] = []
	for (const raw of value) {
		if (typeof raw !== 'object' || raw === null) continue
		const entry = raw as Record<string, unknown>
		if (!isOnHitKitId(entry.id) || seen.has(entry.id)) continue
		seen.add(entry.id)
		effects.push({ id: entry.id, params: normalizeParams(entry.id, entry.params) })
	}
	return effects
}

/** One charge sub-kit; a broken or empty entry means "no charged attack". */
function normalizeCharge(value: unknown): ChargeKit | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	return { id: 'charge-attack', params: normalizeParams('charge-attack', (value as { params?: unknown }).params) }
}

function normalizeMods(value: unknown): StatMods {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
	const mods: StatMods = {}
	for (const [key, amount] of Object.entries(value)) {
		if (typeof amount === 'number' && Number.isFinite(amount)) mods[key as StatKey] = amount
	}
	return mods
}

/** Five bonus-stat tables (one per star); broken entries read as an empty table. */
function normalizeStatTables(value: unknown): StatMods[] {
	const tables = Array.isArray(value) ? value : []
	return Array.from({ length: 5 }, (_, index) => normalizeMods(tables[index]))
}

const AURA_TARGETS: readonly AuraSpec['target'][] = ['adjacent', 'adjacentWeapon', 'adjacentNonWeapon', 'all']

/** Five adjacency auras (one per star); a broken entry falls back to "any adjacent item". */
function normalizeAuras(value: unknown): AuraSpec[] {
	const entries = Array.isArray(value) ? value : []
	return Array.from({ length: 5 }, (_, index) => {
		const raw = entries[index]
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
			return { target: 'adjacent', mods: {} }
		}
		const entry = raw as Record<string, unknown>
		const target = AURA_TARGETS.includes(entry.target as AuraSpec['target'])
			? (entry.target as AuraSpec['target'])
			: 'adjacent'
		return { target, mods: normalizeMods(entry.mods) }
	})
}

/**
 * Defensive read of a stored `kits` payload (an override can be hand-edited in the database).
 *
 * An item may carry **several attack kits**, and each one becomes its own swing with its own cadence
 * and its own on-hit effects, so nothing is silently dropped and no kit overwrites another. A `stats` /
 * `aura` kit is repeatable too — each copy carries its own stat, so two Attack jades are two kits. Two
 * things live **inside** an attack kit and are folded there when a payload carries them at the top
 * level (the older shape): the on-hit effects, and `charge-attack` — the charged variant of the basic
 * attack, which is ❌ never a second timer. Both are dropped when there is no attack kit to attach
 * them to, since neither could ever trigger. Broken rows never throw — a bad row must not take the
 * whole page down.
 */
export function normalizeKits(value: unknown): ItemKit[] {
	// A non-array is a broken row: throw so `mergeItem` keeps the code value. An empty array is a
	// real edit ("remove every kit") and must stay empty.
	if (!Array.isArray(value)) throw new Error('kits: expected an array')
	const attacks: ItemKit[] = []
	const seenAttacks = new Set<ItemKitId>()
	const options: ItemKit[] = []
	const seenOptions = new Set<OptionKitId>()
	const legacyOnHit: OnHitKit[] = []
	let legacyCharge: ChargeKit | undefined
	for (const raw of value) {
		if (typeof raw !== 'object' || raw === null) continue
		const entry = raw as Record<string, unknown>
		if (isAttackKitId(entry.id) && !seenAttacks.has(entry.id)) {
			seenAttacks.add(entry.id)
			const effects = normalizeOnHit(entry.onHit)
			const charge = normalizeCharge(entry.charge)
			attacks.push({
				id: entry.id,
				params: normalizeParams(entry.id, entry.params),
				...(effects.length > 0 ? { onHit: effects } : {}),
				...(charge ? { charge } : {}),
			})
			continue
		}
		if (isOnHitKitId(entry.id)) {
			legacyOnHit.push({ id: entry.id, params: normalizeParams(entry.id, entry.params) })
			continue
		}
		if (isChargeKitId(entry.id)) {
			// An older payload kept the charged hit as a kit of its own: it becomes the sub-kit of the
			// basic attack below, and its `cooldown` (no longer a thing) is simply ignored.
			legacyCharge ??= { id: 'charge-attack', params: normalizeParams('charge-attack', entry.params) }
			continue
		}
		if (isOptionKitId(entry.id) && (!seenOptions.has(entry.id) || isRepeatableKit(entry.id))) {
			seenOptions.add(entry.id)
			if (entry.id === 'stats') {
				options.push({ id: entry.id, params: {}, stats: normalizeStatTables(entry.stats) })
			} else if (entry.id === 'aura') {
				options.push({ id: entry.id, params: {}, aura: normalizeAuras(entry.aura) })
			} else {
				// `parry` carries nothing but its per-star numbers.
				options.push({ id: entry.id, params: normalizeParams(entry.id, entry.params) })
			}
		}
	}
	const [main] = attacks
	if (main) {
		const seen = new Set(main.onHit?.map((kit) => kit.id) ?? [])
		for (const effect of legacyOnHit) {
			if (seen.has(effect.id)) continue
			seen.add(effect.id)
			main.onHit = [...(main.onHit ?? []), effect]
		}
		if (!main.charge && legacyCharge) main.charge = legacyCharge
	}
	return [...attacks, ...options]
}
