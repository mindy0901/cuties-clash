import { avatarArtSrc, petArtSrc } from '../game/art'
import { getPet } from '../game/pets'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

export interface AvatarCardProps {
	side: 'player' | 'enemy'
	name: string
	/** Small label next to the name (pet level, stage name…). */
	label?: string
	/** With `petId` → uses the pet's **avatar art** (see `avatarArtSrc`). */
	petId?: string
	/** Without `petId` (stage opponents) → uses an emoji. */
	emoji?: string
	/**
	 * Draw this picture instead of the pet's own art.
	 *
	 * ⚠️ Only the admin page uses it, to preview a crop that is not uploaded yet in the very frame the
	 * battle draws. ❌ Not a second way to pick art.
	 */
	artSrc?: string | null
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
	artSrc,
	hit,
	floater,
}: AvatarCardProps) {
	const pet = petId ? getPet(petId) : null
	// `artSrc` is the preview override; otherwise the pet's avatar art, falling back to its own.
	const picture = artSrc === undefined ? (petId ? (avatarArtSrc(petId) ?? petArtSrc(petId)) : null) : artSrc

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
			 * Avatar frame.
			 *
			 * `flex-1` + `min-h` so the picture **fills the whole card**: the card stretches to the height
			 * of the item grids beside it, and a square frame in the middle left the bottom half empty
			 * (`min-h` is what keeps the frame from collapsing when the card is not stretched, e.g. in the
			 * admin preview).
			 *
			 * `key` changes when a hit lands so the `shake` animation restarts (same approach as the
			 * older panels).
			 */}
			<div
				data-avatar-holder
				className={cn(
					'relative grid min-h-[132px] flex-1 place-items-center overflow-hidden rounded-xl border border-dashed border-gold/30 bg-black/45',
					hit && 'animate-shake',
				)}
				key={hit ? `hit-${floater?.key}` : 'idle'}
			>
				<ArtIcon
					src={picture}
					emoji={emoji ?? pet?.icon ?? '🀄'}
					emojiClass="text-[58px]"
					alt={name}
					fit="cover"
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
		</aside>
	)
}
