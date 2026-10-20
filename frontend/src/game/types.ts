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

/**
 * Item **type** — seven groups, three of them weapons:
 * - `melee` / `ranged` — the two damage weapons (they swing, and count as "weapon" for auras);
 * - `artifact` — pháp khí, a **weapon** whose job is debuffs (freeze, slow, poison, drain) instead
 *   of raw damage: it swings like any other weapon, but its kit rarely carries much `attack`;
 * - `jade` — ngọc, the 1×1 gems (support kits, flat `passive` stats);
 * - `accessory` — phụ kiện, the 2×2 pieces: same idea as a jade, but a big piece that changes the
 *   board layout around it;
 * - `armor` — giáp, defensive `passive`;
 * - `potion` — đan dược, one-off triggers (heal, energy).
 *
 * ⚠️ Splitting weapons into three types is a **label for design**: `isWeaponClass()` is what the aura
 * targeting asks, so an artifact still buffs "weapon LIỀN KỀ" exactly like a melee one.
 */
export type ItemClass = 'melee' | 'ranged' | 'artifact' | 'jade' | 'accessory' | 'armor' | 'potion'

/**
 * Footprint a class **always** uses, when its shape is part of the design rather than a choice.
 *
 * `jade` is one cell (a gem sits in a single cell) and `accessory` a 2×2 block (a big piece that
 * shapes the board around it). Every other class keeps whatever `space` its template declares.
 *
 * ⚠️ Lives here, next to `ItemClass`, so `items.ts` and `content.ts` (which imports `items.ts`) can
 * both use it without a circular import.
 */
/** Item footprint inside the bag, measured in bag cells. */
export interface GridSpace {
	w: number
	h: number
}

/** Bag dimensions of one cutie level: `width` columns × `rows` rows of cells. */
export interface BagShape {
	width: number
	rows: number
}

/** Persistent numeric modifiers granted by items / cutie level. */
export type StatKey =
	| 'atk'
	| 'atkPct'
	| 'critRate'
	| 'critDamage'
	| 'lifesteal'
	| 'dr'
	| 'maxHp'
	| 'seRegen'
	| 'cdr'
	| 'shield'

export type StatMods = Partial<Record<StatKey, number>>

export type StatSheet = Record<StatKey, number>

/** Timed combat states (dots, hots and control effects). */
export type StatusKey = 'slow' | 'freeze' | 'poison' | 'burn' | 'regen' | 'cdr' | 'brittle'

export interface ActiveStatus {
	key: StatusKey
	/** Damage/heal per second for dots/hots, percentage for slow/cdr/brittle. */
	value: number
	remaining: number
	stacks: number
	/**
	 * A dot whose number is a **percentage of the target's live HP** (`enemyHpCurrent`) instead of a
	 * fixed amount. Such a status keeps the raw percentage in `value` and is recomputed on every tick,
	 * so poison actually drains a share of what is left.
	 */
	scale?: ScaleMode
}

export type AuraTarget = 'adjacent' | 'adjacentWeapon' | 'adjacentNonWeapon' | 'all'

export type EffectTarget = 'self' | 'enemy'

/**
 * How a support gem picks the weapons / focus items it buffs: the sides ticked around the gem, one
 * random one, or the weapon that caused the trigger.
 */
export type BuffTargetMode = 'directions' | 'random'

/** One effect a weapon can trigger on hit. */
export type CombatEffect =
	/** `atkScale` adds a fraction of the owner's weapon attack on top of `amount`. */
	| { kind: 'damage'; amount: number; atkScale?: number }
	| { kind: 'heal'; amount: number }
		| { kind: 'shield'; amount: number; scale?: ScaleMode }
	| { kind: 'swordEnergy'; amount: number }
	/** Heals the attacker for `percent`% of the damage the hit dealt. */
	| { kind: 'lifesteal'; percent: number }
	| {
			kind: 'status'
			status: StatusKey
			duration: number
			value: number
				/** `value` is a number of points unless this says what it is a percentage of. */
				scale?: ScaleMode
				stacks: number
				target: EffectTarget
		  }
		| { kind: 'cleanse'; statuses: StatusKey[]; scope: AuraTarget }
		/** Freezes **one** enemy weapon at random; a frozen weapon keeps its charge and does nothing. */
		| { kind: 'freezeWeapon'; duration: number }
		/** Slows **one** enemy weapon at random: its charge runs `value`% slower. */
		| { kind: 'slowWeapon'; duration: number; value: number }

		/**
		 * What a kit's number is measured against, chosen once per kit in the admin page:
		 * a fixed number of points, or a **percentage** of a live stat read when the effect fires.
		 *
		 * `hp` / `hpCurrent` are the owner's bar (max / at the moment it fires) — the only two that make
		 * sense for a shield or a self-heal. `atk` is the owner's hit, `enemyHp` the target's max HP and
		 * `enemyHpCurrent` the target's **current** HP (a poison that drains a share of what is left).
		 */
		export type ScaleMode = 'atk' | 'hp' | 'hpCurrent' | 'enemyHp' | 'enemyHpCurrent'

/** One roll an attack makes after it lands. */
export interface OnHitTrigger {
	/** Chance to fire, 0–1. */
	chance: number
	effects: CombatEffect[]
}

/** Kits that make an item swing. An attack kit may carry **one** `charge-attack` sub-kit. */
export type AttackKitId = 'basic-attack'

/**
 * The **charged variant of a basic attack** — a sub-kit of `basic-attack`, never a swing of its own.
 *
 * Once the owner holds `seNeed` Sword Energy, the **next basic attack becomes a charged attack**
 * instead: it spends that much energy and lands for `attack × multiplier`. The basic attack's own
 * damage is **replaced**, ❌ never added on top of it.
 */
export type ChargeKitId = 'charge-attack'

/** Kits that roll **after a basic attack lands** — they belong inside the attack kit. */
export type OnHitKitId =
	| 'burn-on-hit'
	| 'poison-on-hit'
	| 'slow-on-hit'
	| 'freeze-on-hit'
	| 'lifesteal-on-hit'
	| 'shield-on-hit'
	| 'sword-energy-on-hit'

export type ItemKitId = AttackKitId | ChargeKitId | OnHitKitId | OptionKitId

/**
 * Optional, non-attack kits that sit beside the attack kits on an item.
 *
 * `stats` / `aura` / `parry` are the original three; the rest are reaction and defensive kits that
 * an "hòn ngọc" (jade / artifact) or an armour piece can carry. ❌ None of them swings on its own:
 * each one reacts to something the owner already does, or changes how incoming damage is taken.
 */
export type OptionKitId =
	| 'stats'
	| 'aura'
	| 'parry'
	/** Freeze support: applying a freeze speeds up the weapons adjacent to this gem. */
	| 'freeze-haste'
	/** Freeze support: being frozen heals the owner. */
	| 'freeze-heal'
	/** Freeze support: being attacked freezes one enemy weapon at random. */
	| 'freeze-reflect'
	/** Weapon damage slows one enemy weapon at random. */
	| 'slow-strike'
	/** Every weapon hit adds a damage stack (max 10 by default). */
	| 'rage-on-hit'
	/** Every heal received adds a damage stack (max 10 by default). */
	| 'rage-on-heal'
	/** Every heal received grants armour. */
	| 'armor-on-heal'
	/** A weapon hit drains Sword Energy from the enemy. */
	| 'se-drain'
	/** Receiving a heal speeds up the weapons adjacent to this gem. */
	| 'heal-haste'
	/** Flat damage reduction. */
	| 'damage-reduction'
	/** Extra armour at the start of the battle. */
	| 'starting-shield'
	/** A share of every heal received is added on top. */
	| 'healing-boost'
	/** Heals a percentage of max HP every second. */
	| 'regen'
	/** Chance to take half damage from a direct hit. */
	| 'block-chance'
	/** A bad status landed on the owner heals them. */
	| 'debuff-heal'
	/** Blocks a charged attack outright when the owner holds enough Sword Energy. */
	| 'block-charged'
	/**
	 * Flat damage boost for the swings this kit points at: the item's own swings, or the weapons on
	 * the ticked sides. Applied for good (`trigger: 'Liên tục'`) or for a few seconds after the
	 * owner's chosen condition fires.
	 */
	| 'damage-boost'
	/**
	 * Sword Energy regeneration per second — **the only kit that may touch SE**: a positive number
	 * refills the bar faster, a negative one slows it down.
	 */
	| 'sword-energy'

/** One adjacency aura rank: what it needs next to it and what it grants. */
export interface AuraSpec {
	target: AuraTarget
	mods: StatMods
}

/** One effect attached to a basic attack. */
export interface OnHitKit {
	id: OnHitKitId
	params: Record<string, number[]>
}

/** The charged variant attached to a basic attack (see `ChargeKitId`). */
export interface ChargeKit {
	id: ChargeKitId
	params: Record<string, number[]>
}

/**
 * One kit attached to an item.
 *
 * `params[key]` holds **one value per star rank** (1★ → 5★), so a kit scales exactly like the rest
 * of the template. Kits are plain data: the admin page can add, remove and edit them.
 *
 * ⚠️ On-hit effects and the charged variant live **inside** an attack kit (`onHit` / `charge`),
 * never at the item's top level: neither has a meaning without the swing that triggers it. An item
 * may carry **several attack kits** — each one swings on its own timer — and `stats` / `aura` /
 * `parry` are **option kits** that sit at the item's top level beside them.
 */
/**
 * How a kit is **filed** in the kit catalogue (`KIT_DEFS`, `/admin` → Kits) — a designer's word for
 * what the kit is *for*. `KitDef.kind` remains the engine's word for how it *runs*.
 *
 * ⚠️ Only the ids of the **code** catalogue: the catalogue itself is data (`kit_categories`), so a
 * kit's category is a plain string that an admin can rename or add to.
 */
export type KitCategory = 'attack' | 'control' | 'support' | 'defense' | 'stats'

/** Who may carry a kit: `both` = an item **and** a Cutie, `item` = an item only. */
export type KitAppliesTo = 'both' | 'item'

export interface ItemKit {
	id: ItemKitId
	params: Record<string, number[]>
	/** `basic-attack` only: effects rolled when this attack lands. */
	onHit?: OnHitKit[]
	/**
	 * `basic-attack` only: the charged variant. With enough Sword Energy the next swing of **this**
	 * kit becomes the charged attack — it does not add a second timer.
	 */
	charge?: ChargeKit
	/** `stats` kit: one bonus-stat table per star rank. */
	stats?: StatMods[]
	/** `aura` kit: one adjacency aura per star rank. */
	aura?: AuraSpec[]
}

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
	/** Base price in Vàng at 1★. A higher star costs `starPrice(cost, star)` — one copy per merge step. */
	cost: number
	/** Cells the item covers; the player may rotate it by 90° while dragging. */
	space: GridSpace
	/**
	 * Combat **kits** attached to the item: any number of attack kits (each with its on-hit effects)
	 * plus the optional `stats` / `aura` kits. An item with no attack kit never swings.
	 *
	 * ⚠️ **An item has no damage and no speed of its own.** Every number in a kit is a **multiplier of
	 * the Cutie's own stat**: `basic-attack.multiplier` × the Cutie's attack, `basic-attack.speed` ×
	 * the Cutie's attack speed, and every damage / heal / shield number a percentage of the owner's
	 * attack, max HP or max Sword Energy. Attack only exists on the Cutie.
	 */
	kits?: ItemKit[]
}

export interface ItemInstance {
	uid: string
	templateId: string
	star: Star
	/** Anchor cell (top-left corner of the footprint) inside the bag grid, -1 in the waiting tray. */
	slot: number
	/** True when the player rotated the item 90° — swaps `space.w` and `space.h`. */
	rotated?: boolean
	/** Vàng actually spent, used for the 50% sell price. */
	paid: number
}

export interface CutieDef {
	id: string
	name: string
	/** Fallback icon (emoji), used while art is missing. */
	icon: string
	blurb: string
	/** Whether cutie art exists at `public/icons/cuties/<id>.png`. */
	art?: boolean
	/** Whether the cutie's attack art exists at `public/icons/skills/<id>-skill.png`. */
	skillArt?: boolean
	/**
	 * Whether a dedicated **avatar** art exists at `public/icons/cuties/<id>-avatar.png`.
	 *
	 * The fighter frame (`AvatarCard`) prefers this image and falls back to `art` and then the emoji
	 * — so adding an avatar only means dropping a file and setting the flag, ❌ no UI change needed.
	 */
	avatar?: boolean
	/** Stage index that must be cleared to unlock the cutie (0 = starter). */
	unlockStage: number
	maxHp: number
	maxSe: number
	seRegen: number
	/** Base critical hit chance, as a percentage. */
	critRate: number
	/** Additional critical damage, as a percentage above normal damage. */
	critDamage: number
	/**
	 * **Base attack of the cutie** — the only attack in the game. Item swings multiply it with their
	 * kit's `multiplier`, so a sword at `multiplier: 1` hits for exactly this number. It has no star
	 * ranks (a cutie levels up instead), so it grows with the level.
	 */
	attack: number
	/**
	 * Combat **kits** of the cutie, the same catalogue items use: attack kits give it its swings
	 * (each with its own on-hit effects and its own **Cooldown Time**). A cutie with no attack kit
	 * never swings.
	 *
	 * A kit carries **one value per parameter** here (repeated into all five slots of `params`),
	 * because a level replaces the star rank.
	 */
	kits?: ItemKit[]
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
	cooldowns: {
		uid: string
		remaining: number
		total: number
		/** Milliseconds this weapon is still frozen for (charge is paused, not reset). */
		frozen?: number
		/** Cooldown penalty in percent while the slow lasts, else 0. */
		slow?: number
		/** Cooldown reduction in percent while the buff lasts, else 0. */
		cdr?: number
	}[]
}

export type BattleEventKind =
	| 'start'
	| 'attack'
	| 'charged'
	| 'counter'
	| 'dot'
	| 'heal'
	| 'shield'
	| 'status'
	| 'block'
	| 'death'
	| 'end'

export interface BattleEvent {
	t: number
	kind: BattleEventKind
	side: 'player' | 'enemy'
	critical?: boolean
	text: string
	amount?: number
	icon?: string
	sourceUid?: string
	player: SideState
	enemy: SideState
}

export interface BattleResult {
	winner: 'player' | 'enemy' | 'draw'
	/**
	 * The session ran out of its **time limit** instead of someone dying (training room). Always
	 * paired with `winner: 'draw'`: a training session has no winner, only damage numbers.
	 */
	timedOut?: boolean
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
	cutieId: string
	/** Cutie id -> level. */
	cuties: Record<string, number>
	unlockedCuties: string[]
	gold: number
	/** Stage currently being prepared (1..60). */
	stage: number
	clearedStage: number
	/**
	 * Gear the cutie is **wearing**: only items listed here join the fight (passives, auras,
	 * weapons). Laid out on a 4-column grid whose row count grows with the cutie level.
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
