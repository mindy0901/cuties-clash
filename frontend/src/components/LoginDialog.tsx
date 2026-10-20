import { useEffect } from 'react'
import { api } from '../api/client'
import { useSessionState } from '../api/queries'
import { ProviderIcon } from './ProviderIcon'
import { PROVIDER_LABELS, cn, dialogClass, overlayClass } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'
/** Login dialog: redirects to Google. */
export function LoginDialog({ onClose }: { onClose: () => void }) {
	const { availableProviders, loading, unavailable, retry } = useSessionState()

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onClose])

	return (
		<div className={overlayClass} onClick={onClose}>
			<div className={dialogClass} onClick={(event) => event.stopPropagation()}>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-xl">{translate('Đăng nhập')}</h2>
						<p className="m-0 text-[13px] text-muted">
							{translate(
								'Đăng nhập để lưu tiến trình theo tài khoản và chơi tiếp trên máy khác. Không đăng nhập vẫn chơi bình thường — tiến trình nằm trong trình duyệt này.',
							)}
						</p>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						{translate('Đóng')}
					</Button>
				</div>

				<div className="flex flex-col gap-2">
					{loading ? <p className="m-0 text-[13px] text-muted">{translate('Đang kiểm tra máy chủ…')}</p> : null}

					{/* ⚠️ "The server cannot be reached" is DIFFERENT from "no key configured". Telling
					    the user to fill in GOOGLE_CLIENT_ID in this case points at the wrong place. */}
					{!loading && unavailable ? (
						<div className="rounded-[10px] border border-line bg-black/25 p-3">
							<p className="m-0 text-[13px] text-muted">
								{translate(
									'Không kết nối được máy chủ đăng nhập. Hãy kiểm tra backend đã chạy chưa rồi thử lại — không đăng nhập vẫn chơi được bình thường.',
								)}
							</p>
							<Button type="button" size="sm" className={cn('mt-2')} onClick={retry}>
								{translate('Thử lại')}
							</Button>
						</div>
					) : null}

					{!loading && !unavailable && availableProviders.length === 0 ? (
						<div className="rounded-[10px] border border-line bg-black/25 p-3">
							<p className="m-0 text-[13px] text-muted">
								{translate(
									'Máy chủ chưa được cấu hình đăng nhập. Hãy điền GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET vào file .env của backend rồi khởi động lại. Xem docs/OAUTH-SETUP.md để biết cách lấy khoá.',
								)}
							</p>
						</div>
					) : null}

					{availableProviders.map((provider) => (
						<a
							key={provider}
							href={api.loginUrl(provider)}
							className="h-auto justify-start px-4 py-3 text-[15px]"
						>
							<ProviderIcon />
							<span>{translate('Tiếp tục với')} {PROVIDER_LABELS[provider] ?? provider}</span>
						</a>
					))}
				</div>

				<p className="m-0 text-[12.5px] text-muted">
					{translate(
						'Chúng tôi chỉ nhận tên, email và ảnh đại diện để hiển thị trong game. Không đăng bài thay bạn.',
					)}
				</p>
			</div>
		</div>
	)
}
