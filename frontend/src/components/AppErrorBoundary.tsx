import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
	children: ReactNode
}

interface State {
	error: Error | null
}

/**
 * Lá chắn cuối cùng: nếu bất kỳ lỗi runtime nào xảy ra lúc render, hiện màn hình
 * khôi phục thay vì để trang trắng.
 *
 * Trang trắng là tình huống **không thể thoát** với người chơi: không có nút nào để
 * bấm, nên họ chỉ có thể xoá dữ liệu trình duyệt bằng tay. Màn hình này cho họ một
 * nút xoá bản lưu và tải lại.
 */
export class AppErrorBoundary extends Component<Props, State> {
	state: State = { error: null }

	static getDerivedStateFromError(error: Error): State {
		return { error }
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		// Giữ lại trong console để còn gỡ lỗi.
		console.error('[Martial Cutie] lỗi render:', error, info.componentStack)
	}

	private reset = () => {
		try {
			window.localStorage.removeItem('martial-cutie-save')
		} catch {
			// Bỏ qua: localStorage có thể bị chặn.
		}
		window.location.assign('/')
	}

	render() {
		const { error } = this.state
		if (!error) return this.props.children

		return (
			<div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col items-start justify-center gap-4 px-6 py-10">
				<h1 className="text-xl font-bold text-danger-soft">Đã xảy ra lỗi khi hiển thị game</h1>
				<p className="m-0 text-[13px] text-muted">
					Bản lưu trong trình duyệt có thể bị hỏng. Bấm nút bên dưới để xoá bản lưu và chơi lại từ đầu —
					tiến trình đang đồng bộ trên máy chủ (nếu bạn đã đăng nhập) sẽ không bị ảnh hưởng.
				</p>
				<button
					type="button"
					className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-ink-700 px-4 py-2 font-semibold hover:border-gold"
					onClick={this.reset}
				>
					Xoá bản lưu và chơi lại
				</button>
				<details className="w-full">
					<summary className="cursor-pointer text-[12.5px] text-muted">Chi tiết kỹ thuật</summary>
					<pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-black/40 p-3 text-[11.5px] whitespace-pre-wrap text-muted">
						{error.message}
						{'\n'}
						{error.stack}
					</pre>
				</details>
			</div>
		)
	}
}
