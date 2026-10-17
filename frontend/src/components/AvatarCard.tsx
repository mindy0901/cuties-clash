import type { ReactNode } from 'react'
import { avatarArtSrc, petArtSrc } from '../game/art'
import { getPet } from '../game/pets'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/** Một ô kỹ năng ở đáy khung đại diện (kỹ năng thú cưng, hoặc món có hiệu lực chủ động). */
export interface AvatarSkill {
	/** Khoá — trùng `uid` trong `SideState.cooldowns` để tra tiến độ hồi. */
	uid: string
	/** Icon hiển thị; chỗ gọi truyền sẵn `ItemIcon`/`SkillIcon`. */
	icon: ReactNode
	label: string
	/** 0–100, 100 = dùng được ngay. */
	charge: number
}

export interface AvatarCardProps {
	side: 'player' | 'enemy'
	name: string
	/** Nhãn nhỏ cạnh tên (cấp thú, tên màn…). */
	label?: string
	/** Có `petId` → lấy **ảnh đại diện** của thú (xem `avatarArtSrc`). */
	petId?: string
	/** Không có `petId` (đối thủ theo màn) → dùng emoji. */
	emoji?: string
	skills?: AvatarSkill[]
	/** Nhấp nháy khi vừa ăn đòn. */
	hit?: boolean
	/** Sát thương vừa nhận — số bay lên trong khung. */
	floater?: { key: number; value: number } | null
}

/**
 * Khung **đại diện** một đấu sĩ, đặt hai bên sàn đấu (xem `BattleScreen`).
 *
 * Đây là **holder sẵn sàng cho ảnh đại diện**: hiện khung hiện art thú cưng, chưa có art thì lùi
 * về emoji. Khi có ảnh đại diện riêng thì **không phải sửa component này** — chỉ cần đặt file
 * `/public/icons/pets/<id>-avatar.png` và bật `avatar: true` trong `game/pets.ts`, `avatarArtSrc`
 * sẽ tự được ưu tiên (xem `docs/ASSETS.md`).
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
			 * Khung ảnh đại diện — chỗ đặt art sau này.
			 *
			 * `key` đổi khi trúng đòn để animation `shake` chạy lại từ đầu (cùng cách với các panel cũ).
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
