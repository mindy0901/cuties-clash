import { useState } from 'react'
import { cn } from './ui'

interface ArtIconProps {
	/** Đường dẫn art trong `public/`. `null` = chưa có art, hiện emoji. */
	src: string | null
	/** Hiện khi chưa có art, hoặc khi ảnh tải lỗi. */
	emoji: string
	/** Lớp cho emoji (điều khiển cỡ chữ). */
	emojiClass?: string
	className?: string
	alt?: string
}

/**
 * Hiện art nếu có, không thì lùi về emoji.
 *
 * Ảnh lỗi cũng lùi về emoji (`onError`) — để thiếu file art không bao giờ tạo ra ô
 * trống hay biểu tượng vỡ trong lưới.
 */
export function ArtIcon({ src, emoji, emojiClass, className, alt = '' }: ArtIconProps) {
	const [failed, setFailed] = useState(false)

	if (!src || failed) {
		return <span className={cn('leading-none', emojiClass, className)}>{emoji}</span>
	}

	return (
		<img
			src={src}
			alt={alt}
			draggable={false}
			className={cn('size-full object-contain [image-rendering:pixelated]', className)}
			onError={() => setFailed(true)}
		/>
	)
}
