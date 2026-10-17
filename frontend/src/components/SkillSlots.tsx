import type { ReactNode } from 'react'
import { cn } from './ui'

/** One skill slot — a pet skill, or an item with an active effect. */
export interface SkillSlot {
	/** Key — matches `uid` in `SideState.cooldowns`, used to look up charge progress. */
	uid: string
	/** Icon to display; callers pass an `ItemIcon`/`SkillIcon`. */
	icon: ReactNode
	label: string
	/** 0–100, 100 = ready to use. */
	charge: number
}

/**
 * The skill icons of one fighter (pet skill + items with an active effect), each with its charge.
 *
 * ⚠️ Never inside the avatar card: the picture owns that frame, so these are drawn in the **top bar**
 * next to that side's shield/status chips (`HpPanel`).
 *
 * `compact` is the size used in the top bar, where the row already carries small chips; the roomier
 * size is for anywhere with more space. Both are **literal** classes — a `size-${n}` built at runtime
 * would produce no style at all.
 */
export function SkillSlots({
	skills,
	className,
	compact = false,
}: {
	skills: SkillSlot[]
	className?: string
	compact?: boolean
}) {
	if (skills.length === 0) return null
	return (
		<div data-skill-slots className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>
			{skills.map((skill) => (
				<span
					key={skill.uid}
					title={skill.label}
					className={cn(
						'relative grid place-items-center overflow-hidden rounded-full border bg-ink-700',
						compact ? 'size-7' : 'size-9',
						skill.charge >= 100 ? 'border-gold-soft shadow-[0_0_10px_rgb(217_162_39/35%)]' : 'border-line',
					)}
				>
					{skill.icon}
					<span className="absolute bottom-0 left-0 h-1 bg-gold" style={{ width: `${skill.charge}%` }} />
				</span>
			))}
		</div>
	)
}
