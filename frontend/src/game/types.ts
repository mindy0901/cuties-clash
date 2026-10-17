/**
 * Domain types for the Martial Cutie (武林萌主) style auto-battler clone.
 * Mechanics are re-implemented from the public event rules; all art/text is original.
 */

export type Star = 1 | 2 | 3 | 4 | 5

/**
 * Rarity band that colours the item tile: 1 = silver … 5 = gold-orange.
 *
 * ⚠️ Different from `Star`: the star rank is **earned during a run** (merging two copies),
 * while `quality` is a **fixed property of the template** taken from `tier`/`cls`. It never
 * changes and only drives colours + labels.
 */
export type Quality = 1 | 2 | 3 | 4 | 5

export type ItemClass = 'weapon' | 'armor' | 'souljade' | 'curio' | 'potion'

/** Item footprint inside the bag, measured in bag cells. */
export interface GridSpace {
	w: number
	h: number
}

/** Bag dimensions of one pet level: `width` columns × `rows` rows of cells. */
export interface BagShape {
	width: number
	rows: number
}

/** Persistent numeric modifiers granted by items / pet level. */
export type StatKey =
	| 'atk'
	| 'atkPct'
	| 'critRate'
	| 'lifesteal'
	| 'dr'
	| 'maxHp'
	| 'seRegen'
	| 'haste'
	| 'counterChance'
	| 'counterPower'
	| 'shield'

export type StatMods = Partial<Record<StatKey, number>>

export type StatSheet = Record<StatKey, number>

/** Timed combat states (dots, hots and control effects). */
export type StatusKey = 'slow' | 'freeze' | 'poison' | 'burn' | 'regen' | 'haste' | 'brittle'

export interface ActiveStatus {
	key: StatusKey
	/** Damage/heal per second for dots/hots, percentage for slow/haste/brittle. */
	value: number
	remaining: number
	stacks: number
}

export type AuraTarget = 'adjacent' | 'adjacentWeapon' | 'adjacentNonWeapon' | 'all'

export type EffectTarget = 'self' | 'enemy'

export type ActiveEffect =
	/** `atkScale` adds a fraction of the owner's weapon attack on top of `amount`. */
	| { kind: 'damage'; amount: number; atkScale?: number }
	| { kind: 'heal'; amount: number }
	| { kind: 'shield'; amount: number }
	| { kind: 'swordEnergy'; amount: number }
	| {
			kind: 'status'
			status: StatusKey
			duration: number
			value: number
			stacks: number
			target: EffectTarget
	  }
	| { kind: 'cleanse'; statuses: StatusKey[]; scope: AuraTarget }

export interface ItemTemplate {
	id: string
	name: string
	cls: ItemClass
	/**
	 * Fallback icon (emoji). Always present so the game never shows an empty cell when art is
	 * missing. Real art (when available) lives in `public/icons/items`.
	 */
	icon: string
	/**
	 * Declares that art exists at `public/icons/items/<id>.png`.
	 *
	 * ⚠️ ONE art per item, **not** one per star rank: upgrading an item changes only the **number**
	 * of stars drawn on the tile and their **colour** (`ITEM_STAR_TEXT`), never the picture. See
	 * `docs/ASSETS.md` and `itemArtSrc()`.
	 */
	art?: boolean
	/** Shop pool tier: 1 = available from the start, 3 = late maps. */
	tier: 1 | 2 | 3
	/**
	 * Rarity band that colours the tile (1 = silver … 5 = gold-orange). Fixed per template,
	 * derived from `tier`/`cls`; ❌ does not depend on the item's star rank.
	 */
	quality: Quality
	/** Base price in Paw Tally at 1★. Higher stars cost `cost * star`. */
	cost: number
	/** Cells the item covers; the player may rotate it by 90° while dragging. */
	space: GridSpace
	/**
	 * Attack rate in **attacks per second** — `DEFAULT_SPEED` (0.625) when the template omits it.
	 * `swingMs()` turns it into the interval the battle simulation uses.
	 */
	speed?: (star: Star) => number
	/** Weapon damage per swing. */
	damage?: (star: Star) => number
	passive?: (star: Star) => StatMods
	active?: (star: Star) => ActiveEffect[]
	/** Activation interval for `active`, in ms. */
	interval?: (star: Star) => number
	aura?: (star: Star) => { target: AuraTarget; mods: StatMods }
	onHit?: (star: Star) => { chance: number; effects: ActiveEffect[] }
}

export interface ItemInstance {
	uid: string
	templateId: string
	star: Star
	/** Anchor cell (top-left corner of the footprint) inside the bag grid, -1 in the waiting tray. */
	slot: number
	/** True when the player rotated the item 90° — swaps `space.w` and `space.h`. */
	rotated?: boolean
	/** Paw Tally actually spent, used for the 50% sell price. */
	paid: number
}

export interface PetDef {
	id: string
	name: string
	/** Fallback icon (emoji), used while art is missing. */
	icon: string
	blurb: string
	/** Whether pet art exists at `public/icons/pets/<id>.png`. */
	art?: boolean
	/** Whether skill art exists at `public/icons/skills/<id>-skill.png`. */
	skillArt?: boolean
	/**
	 * Whether a dedicated **avatar** art exists at `public/icons/pets/<id>-avatar.png`.
	 *
	 * The fighter frame (`AvatarCard`) prefers this image and falls back to `art` and then the emoji
	 * — so adding an avatar only means dropping a file and setting the flag, ❌ no UI change needed.
	 */
	avatar?: boolean
	/** Stage index that must be cleared to unlock the pet (0 = starter). */
	unlockStage: number
	maxHp: number
	maxSe: number
	seRegen: number
	/** Innate skill, treated as a weapon. */
	skill: {
		name: string
		interval: number
		damage: number
		desc: string
	}
	counterChance: number
	bags: BagShape[]
}

export interface ItemBlueprint {
	templateId: string
	star: Star
	/** Anchor cell of the footprint inside the owner's bag grid. */
	slot: number
	/** True when the loadout is rotated 90° (swaps `space.w` and `space.h`). */
	rotated?: boolean
}

export interface EnemyBlueprint {
	name: string
	icon: string
	maxHp: number
	maxSe: number
	seRegen: number
	attackInterval: number
	attackDamage: number
	counterChance: number
	mods?: StatMods
	items: ItemBlueprint[]
}

export interface StageDef {
	/** 1..60 */
	index: number
	mapIndex: number
	name: string
	reward: number
	enemy: EnemyBlueprint
}

export interface MapDef {
	name: string
	subtitle: string
	from: number
	to: number
}

export interface SideState {
	hp: number
	maxHp: number
	se: number
	maxSe: number
	shield: number
	statuses: { key: StatusKey; remaining: number; stacks: number }[]
	cooldowns: { uid: string; remaining: number; total: number }[]
}

export type BattleEventKind =
	| 'start'
	| 'attack'
	| 'charged'
	| 'counter'
	| 'active'
	| 'dot'
	| 'heal'
	| 'shield'
	| 'status'
	| 'death'
	| 'end'

export interface BattleEvent {
	t: number
	kind: BattleEventKind
	side: 'player' | 'enemy'
	text: string
	amount?: number
	icon?: string
	player: SideState
	enemy: SideState
}

export interface BattleResult {
	winner: 'player' | 'enemy' | 'draw'
	events: BattleEvent[]
	playerPower: number
	enemyPower: number
	duration: number
}

export interface ShopOffer {
	templateId: string
	star: Star
	cost: number
	sold: boolean
}

export interface RunState {
	petId: string
	/** Pet id -> level. */
	pets: Record<string, number>
	unlockedPets: string[]
	currency: number
	/** Stage currently being prepared (1..60). */
	stage: number
	clearedStage: number
	/**
	 * Gear the pet is **wearing**: only items listed here join the fight (passives, auras,
	 * weapons). Laid out on a 4-column grid whose row count grows with the pet level.
	 */
	equipped: ItemInstance[]
	/**
	 * **Storage**: everything not currently worn, with **unlimited** capacity. Items here have no
	 * effect and do not occupy equip-grid cells. The storage is a **free grid** (8 columns):
	 * `slot`/`rotated` are the position and orientation the player chose, kept until the player
	 * changes them.
	 */
	inventory: ItemInstance[]
	seed: number
	shop: ShopOffer[]
	rerolls: number
	/** Battles won / lost in this run, shown in the preparation room. */
	wins: number
	losses: number
}
