import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { usePullRemoteSave, usePushRun, useSessionState } from '../api/queries'
import { useGameStore } from '../store/gameStore'
import { hasLocalRun } from '../store/persistedSave'

/** Chờ bao lâu sau thay đổi cuối rồi mới đẩy lên máy chủ, tránh gọi API liên tục. */
const PUSH_DEBOUNCE_MS = 1500

/**
 * Cờ chống vòng lặp cho chế độ tự đăng nhập. Đặt trong `sessionStorage` (không
 * phải localStorage) để mở tab mới vẫn được đưa tới trang đăng nhập, nhưng một
 * tab đã thử rồi thì không thử lại — tránh vòng lặp vô hạn khi đăng nhập lỗi.
 */
const AUTO_LOGIN_GUARD = 'martial-cutie-auto-login-attempted'

/**
 * Cầu nối giữa game và backend:
 * 1. nạp bản máy chủ khi đăng nhập trên máy chưa có tiến trình,
 * 2. đọc kết quả đăng nhập từ query string,
 * 3. đẩy tiến trình lên máy chủ khi đã đăng nhập (localStorage vẫn là nguồn chính),
 * 4. tự chuyển tới Google nếu backend bật AUTO_LOGIN và khách chưa đăng nhập.
 */
export function AuthSync() {
	const { user, loading, autoLogin, availableProviders } = useSessionState()
	const pullRemoteSave = usePullRemoteSave()
	const { mutate: push } = usePushRun()
	const run = useGameStore((state) => state.run)
	const pushToast = useGameStore((state) => state.pushToast)

	// `push` giữ trong ref thay vì đưa vào dependency của effect bên dưới: nếu không, mỗi
	// lần mutation đổi trạng thái lại reset bộ đếm debounce và lần đẩy có thể không chạy.
	const pushRef = useRef(push)
	useEffect(() => {
		pushRef.current = push
	}, [push])

	// Chơi trên máy mới: máy chưa có tiến trình nào thì lấy bản trên máy chủ.
	// Chỉ chạy một lần cho mỗi phiên đăng nhập, và ❌ không chạy khi máy đã có tiến trình.
	const pulledRef = useRef(false)
	useEffect(() => {
		if (loading || !user || pulledRef.current) return
		pulledRef.current = true
		if (hasLocalRun()) return
		void pullRemoteSave()
	}, [loading, user, pullRemoteSave])

	// Đọc kết quả đăng nhập do backend chuyển hướng về, rồi xoá query cho sạch URL.
	// Phải chạy trước effect tự đăng nhập bên dưới để không chuyển hướng lần nữa.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const outcome = params.get('login')
		if (!outcome) return
		if (outcome === 'ok') {
			pushToast('Đăng nhập thành công — tiến trình sẽ được đồng bộ.', 'good')
		} else {
			pushToast(params.get('message') ?? 'Đăng nhập thất bại.', 'bad')
		}
		params.delete('login')
		params.delete('message')
		const query = params.toString()
		window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
	}, [pushToast])

	useEffect(() => {
		if (loading || user || !autoLogin) return
		const provider = availableProviders[0]
		if (!provider) return
		if (window.sessionStorage.getItem(AUTO_LOGIN_GUARD)) return
		window.sessionStorage.setItem(AUTO_LOGIN_GUARD, '1')
		window.location.assign(api.loginUrl(provider))
	}, [loading, user, autoLogin, availableProviders])

	/**
	 * ⚠️ Guard `pushedRef`: so nội dung tiến trình đã đẩy với nội dung hiện tại.
	 *
	 * Không có guard này thì mỗi lần đẩy thành công lại làm store đổi → effect chạy lại →
	 * **vòng lặp PUT vô tận**. Đã gặp đúng vòng lặp đó một lần, log xen kẽ 200/400.
	 */
	const pushedRef = useRef<string | null>(null)
	useEffect(() => {
		if (!user) return
		const snapshot = JSON.stringify(run)
		if (pushedRef.current === snapshot) return
		const timer = window.setTimeout(() => {
			pushedRef.current = snapshot
			pushRef.current(run)
		}, PUSH_DEBOUNCE_MS)
		return () => window.clearTimeout(timer)
	}, [user, run])

	return null
}
