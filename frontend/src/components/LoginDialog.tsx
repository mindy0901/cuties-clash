import { useEffect } from 'react'
import { api } from '../api/client'
import { useSessionState } from '../api/queries'
import { ProviderIcon } from './ProviderIcon'
import { PROVIDER_LABELS, btnClass, btnSmClass, cn, dialogClass, overlayClass } from './ui'
/** Hộp thoại đăng nhập: chuyển hướng sang Google. */
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
						<h2 className="text-xl">Đăng nhập</h2>
						<p className="m-0 text-[13px] text-muted">
							Đăng nhập để lưu tiến trình theo tài khoản và chơi tiếp trên máy khác. Không đăng nhập vẫn chơi
							bình thường — tiến trình nằm trong trình duyệt này.
						</p>
					</div>
					<button type="button" className={`${btnClass} ${btnSmClass}`} onClick={onClose}>
						Đóng
					</button>
				</div>

				<div className="flex flex-col gap-2">
					{loading ? <p className="m-0 text-[13px] text-muted">Đang kiểm tra máy chủ…</p> : null}

					{/* ⚠️ Máy chủ không gọi được KHÁC với "chưa cấu hình key". Bảo người dùng điền
					    GOOGLE_CLIENT_ID trong trường hợp này là chỉ sai chỗ cần sửa. */}
					{!loading && unavailable ? (
						<div className="rounded-[10px] border border-line bg-black/25 p-3">
							<p className="m-0 text-[13px] text-muted">
								Không kết nối được máy chủ đăng nhập. Hãy kiểm tra backend đã chạy chưa rồi thử lại —
								không đăng nhập vẫn chơi được bình thường.
							</p>
							<button type="button" className={cn(btnClass, btnSmClass, 'mt-2')} onClick={retry}>
								Thử lại
							</button>
						</div>
					) : null}

					{!loading && !unavailable && availableProviders.length === 0 ? (
						<div className="rounded-[10px] border border-line bg-black/25 p-3">
							<p className="m-0 text-[13px] text-muted">
								Máy chủ chưa được cấu hình đăng nhập. Hãy điền <code>GOOGLE_CLIENT_ID</code> và{' '}
								<code>GOOGLE_CLIENT_SECRET</code> vào file <code>.env</code> của backend rồi khởi động
								lại. Xem <code>docs/OAUTH-SETUP.md</code> để biết cách lấy khoá.
							</p>
						</div>
					) : null}

					{availableProviders.map((provider) => (
						<a
							key={provider}
							href={api.loginUrl(provider)}
							className={`${btnClass} justify-start bg-ink-600 px-4 py-3 text-[15px] hover:border-gold`}
						>
							<ProviderIcon />
							<span>Tiếp tục với {PROVIDER_LABELS[provider] ?? provider}</span>
						</a>
					))}
				</div>

				<p className="m-0 text-[12.5px] text-muted">
					Chúng tôi chỉ nhận tên, email và ảnh đại diện để hiển thị trong game. Không đăng bài thay bạn.
				</p>
			</div>
		</div>
	)
}
