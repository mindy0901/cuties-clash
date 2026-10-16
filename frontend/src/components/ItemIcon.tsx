import { itemArtSrc, petArtSrc, skillArtSrc } from '../game/art'
import { getTemplate } from '../game/items'
import { getPet } from '../game/pets'
import type { Star } from '../game/types'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/**
 * Icon của một món đồ: art riêng theo món **và theo sao**, không có thì lùi về emoji.
 *
 * Vì sao theo sao: mỗi mức sao dùng một bậc vật liệu khác nhau, nên món 4★ trông
 * khác hẳn món 1★ — người chơi nhìn ra ngay mình đang mạnh tới đâu.
 */
export function ItemIcon({
	templateId,
	star,
	emojiClass = 'text-[22px]',
	className,
}: {
	templateId: string
	star: Star
	emojiClass?: string
	className?: string
}) {
	const template = getTemplate(templateId)
	return (
		<ArtIcon
			src={itemArtSrc(templateId, star)}
			emoji={template.icon}
			emojiClass={emojiClass}
			className={cn('pointer-events-none', className)}
			alt={template.name}
		/>
	)
}

/** Icon thú cưng. */
export function PetIcon({
	petId,
	emojiClass = 'text-[22px]',
	className,
}: {
	petId: string
	emojiClass?: string
	className?: string
}) {
	const pet = getPet(petId)
	return <ArtIcon src={petArtSrc(petId)} emoji={pet.icon} emojiClass={emojiClass} className={className} alt={pet.name} />
}

/** Icon kỹ năng của thú cưng. */
export function SkillIcon({
	petId,
	emoji = '✨',
	emojiClass = 'text-[22px]',
	className,
}: {
	petId: string
	emoji?: string
	emojiClass?: string
	className?: string
}) {
	return (
		<ArtIcon src={skillArtSrc(petId)} emoji={emoji} emojiClass={emojiClass} className={className} alt="Kỹ năng" />
	)
}
