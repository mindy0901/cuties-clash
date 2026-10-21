import { Component, type ErrorInfo, type ReactNode } from 'react'
import { translate } from '../i18n'
import { clearLocalSave } from '../store/persistedSave'

interface Props {
	children: ReactNode
}

interface State {
	error: Error | null
}

/**
 * The last line of defence: if any runtime error happens while rendering, show a recovery screen
 * instead of leaving a blank page.
 *
 * A blank page is a situation the player **cannot escape**: there is no button to press, so the
 * only option is manually clearing browser data. This screen gives them a button that wipes the
 * save and reloads.
 */
export class AppErrorBoundary extends Component<Props, State> {
	state: State = { error: null }

	static getDerivedStateFromError(error: Error): State {
		return { error }
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		// Keep it in the console for debugging.
		console.error('[Martial Cutie] render error:', error, info.componentStack)
	}

	private reset = () => {
		// The owner tag goes with the save: otherwise the next anonymous run would be tagged as the
		// previous account's.
		clearLocalSave()
		window.location.assign('/')
	}

	render() {
		const { error } = this.state
		if (!error) return this.props.children

		return (
			<div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col items-start justify-center gap-4 px-6 py-10">
				<h1 className="text-xl font-bold text-danger-soft">{translate('Đã xảy ra lỗi khi hiển thị game')}</h1>
				<p className="m-0 text-[13px] text-muted">
					{translate(
						'Bản lưu trong trình duyệt có thể bị hỏng. Bấm nút bên dưới để xoá bản lưu và chơi lại từ đầu — tiến trình đang đồng bộ trên máy chủ (nếu bạn đã đăng nhập) sẽ không bị ảnh hưởng.',
					)}
				</p>
				<button
					type="button"
					className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-ink-700 px-4 py-2 font-semibold hover:border-gold"
					onClick={this.reset}
				>
					{translate('Xoá bản lưu và chơi lại')}
				</button>
				<details className="w-full">
					<summary className="text-[12.5px] text-muted">{translate('Chi tiết kỹ thuật')}</summary>
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
