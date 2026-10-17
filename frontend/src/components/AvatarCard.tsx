import type { ReactNode } from 'react'
import { avatarArtSrc, petArtSrc } from '../game/art'
import { getPet } from '../game/pets'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/** One skill slot at the bottom of the avatar frame (a pet skill, or an item with an active effect). */
export interface AvatarSkill {
	/** Key — matches `uid` in `SideState.cooldowns`, used to look up charge progress. */
	uid: string
	/** Icon to display; callers pass an `ItemIcon`/`SkillIcon`. */
	icon: ReactNode
	label: string
	/** 0–100, 100 = ready to use. */
	charge: number
}

export interface AvatarCardProps {
	side: 'player' | 'enemy'
	name: string
	/** Small label next to the name (pet level, stage name…). */
	label?: string
	/** With `petId` → uses the pet's **avatar art** (see `avatarArtSrc`). */
	petId?: string
	/** Without `petId` (stage opponents) → uses an emoji. */
	emoji?: string
	skills?: AvatarSkill[]
	/** Flashes when the fighter just took a hit. */
	hit?: boolean
	/** Damage just taken — the number floating up inside the frame. */
	floater?: { key: number; value: number } | null
}

/**
 * The **avatar** frame for one fighter, placed on both sides of the arena (see `BattleScreen`).
 *
 * This is the **holder ready for avatar art**: right now it shows the pet art, falling back to
 * an emoji when no art exists. Once dedicated avatars exist, **this component needs no change** —
 * just drop a file at `/public/icons/pets/<id>-avatar.png` and enable `avatar: true` in
 * `game/pets.ts`; `avatarArtSrc` will take priority automatically (see `docs/ASSETS.md`).
 */
export function AvatarCard({
	side,
	name,
	label,
	petId,
	emoji,
	skills = [],
	hit,
	floater,
}: AvatarCardProps) {
	const pet = petId ? getPet(petId) : null

	return (
		<aside
			data-avatar-card={side}
			className={cn(
				'flex w-[176px] shrink-0 flex-col gap-2 rounded-panel border-2 bg-linear-to-b p-2',
				side === 'player' ? 'border-[#8a6316] from-[#241d12] to-ink-800' : 'border-[#7d2318] from-[#241412] to-ink-800',
			)}
		>
			<div className="rounded-md border border-gold/35 bg-black/45 px-2 py-1 text-center text-[12.5px] font-semibold">
				{name}
				{label ? <span className="ml-1 text-[11px] font-normal text-muted">{label}</span> : null}
			</div>

			{/*
			 * Avatar frame — where art will go later.
			 *
			 * `key` changes when a hit lands so the `shake` animation restarts (same approach as the
			 * older panels).
			 */}
			<div
				data-avatar-holder
				className={cn(
					'relative grid min-h-[132px] flex-1 place-items-center overflow-hidden rounded-xl border border-dashed border-gold/30 bg-black/45 p-1',
					hit && 'animate-shake',
				)}
				key={hit ? `hit-${floater?.key}` : 'idle'}
			>
				<ArtIcon
					src={petId ? (avatarArtSrc(petId) ?? petArtSrc(petId)) : null}
					emoji={emoji ?? pet?.icon ?? '🀄'}
					emojiClass="text-[58px]"
					className="max-h-[140px]"
					alt={name}
				/>
				{floater ? (
					<span
						className="pointer-events-none absolute top-1 right-1.5 animate-float-up text-lg font-extrabold text-danger-soft [text-shadow:0_2px_6px_rgb(0_0_0/80%)]"
						key={floater.key}
					>
						−{floater.value}
					</span>
				) : null}
			</div>

			{skills.length > 0 ? (
				<div className="flex flex-wrap justify-center gap-1.5">
					{skills.map((skill) => (
						<span
							key={skill.uid}
							title={skill.label}
							className={cn(
								'relative grid size-9 place-items-center overflow-hidden rounded-full border bg-ink-700',
								skill.charge >= 100 ? 'border-gold-soft shadow-[0_0_10px_rgb(217_162_39/35%)]' : 'border-line',
							)}
						>
							{skill.icon}
							<span className="absolute bottom-0 left-0 h-1 bg-gold" style={{ width: `${skill.charge}%` }} />
						</span>
					))}
				</div>
			) : null}
		</aside>
	)
}
