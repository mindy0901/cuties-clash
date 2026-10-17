/**
 * Domain types for the Martial Cutie (武林萌主) style auto-battler clone.
 * Mechanics are re-implemented from the public event rules; all art/text is original.
 */

export type Star = 1 | 2 | 3 | 4

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
	 * Icon dự phòng (emoji). Luôn có để game không bao giờ hiện ô trống khi thiếu art.
	 * Art thật (nếu có) nằm trong `public/icons/items` và được tìm theo `id` + `star`.
	 */
	icon: string
	/**
	 * Những mức sao **có art riêng** trong `public/icons/items/<id>-<star>.<ext>`.
	 * Bỏ trống = chỉ dùng `icon` (emoji). Xem `docs/ASSETS.md` và `itemArtSrc()`.
	 */
	stars?: Star[]
	/** Đuôi file art. Mặc định `png`. */
	artExt?: 'png' | 'svg' | 'webp'
	/** Shop pool tier: 1 = available from the start, 3 = late maps. */
	tier: 1 | 2 | 3
	/** Base price in Paw Tally at 1★. Higher stars cost `cost * star`. */
	cost: number
	/** Cells the item covers; the player may rotate it by 90° while dragging. */
	space: GridSpace
	/** Weapons swing on their own cadence. */
	attackInterval?: (star: Star) => number
	/** Weapon damage per swing. */
	damage?: (star: Star) => number
	desc: (star: Star) => string
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
	/** Icon dự phòng (emoji), dùng khi chưa có art. */
	icon: string
	blurb: string
	/** Có art thú cưng trong `public/icons/pets/<id>.<artExt>`. */
	art?: boolean
	artExt?: 'png' | 'svg' | 'webp'
	/** Có art kỹ năng trong `public/icons/skills/<id>-skill.<skillArtExt>`. */
	skillArt?: boolean
	skillArtExt?: 'png' | 'svg' | 'webp'
	/**
	 * Có art **đại diện** riêng trong `public/icons/pets/<id>-avatar.<avatarExt>`.
	 *
	 * Khung đấu sĩ (`AvatarCard`) ưu tiên ảnh này, chưa có thì lùi về `art` rồi emoji — nên thêm
	 * ảnh đại diện chỉ cần đặt file + bật cờ, ❌ không phải sửa giao diện.
	 */
	avatar?: boolean
	avatarExt?: 'png' | 'svg' | 'webp'
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
	 * Đồ thú cưng **đang mang**: chỉ những món ở đây mới tham chiến (passive, hào khí,
	 * vũ khí). Xếp theo lưới 4 cột, số hàng tăng theo cấp thú.
	 */
	equipped: ItemInstance[]
	/**
	 * **Kho đồ**: mọi thứ chưa mang, **không giới hạn** sức chứa. Món ở đây không có hiệu lực
	 * và không chiếm ô của trang bị. Kho là **lưới tự do** (8 cột): `slot`/`rotated` là vị trí và
	 * hướng người chơi đặt, giữ nguyên cho tới khi người chơi thao tác.
	 */
	inventory: ItemInstance[]
	seed: number
	shop: ShopOffer[]
	rerolls: number
	/** Số trận đã thắng / thua trong lượt chơi này, hiển thị ở phòng chuẩn bị. */
	wins: number
	losses: number
}
