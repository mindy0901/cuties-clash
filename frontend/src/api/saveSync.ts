/**
 * Đồng bộ bản lưu với máy chủ — logic thuần, **tách khỏi React** để test trực tiếp.
 *
 * ⚠️ Ba lỗi đã từng xảy ra ở đây, cả ba đều gây 400 liên tục (xem AGENTS.md §4.4). Đọc kỹ
 * trước khi sửa:
 *
 * 1. Gặp `revision_conflict` mà **nạp bản máy chủ đè lên** thì mất thay đổi vừa làm và lại
 *    xung đột ở lần sau. Phải: lấy revision mới → PUT lại **dữ liệu của mình** → thử lại
 *    **đúng một lần**.
 * 2. Nạp bản máy chủ mà ghi revision **sau** khi ghi localStorage thì lần đẩy ngay sau đó
 *    dùng revision cũ → xung đột. Phải ghi revision **trước**.
 * 3. Đẩy lên trong mỗi lần render → vòng lặp PUT vô tận. Guard `pushedRef` nằm ở `AuthSync`.
 */
import { ApiError, api } from './client'

/** Nơi giữ revision đã biết của bản lưu. */
export interface RevisionHolder {
	get(): number
	set(revision: number): void
}

/**
 * Đẩy tiến trình lên máy chủ.
 *
 * Trả về revision mới. Ném lỗi nếu thất bại (kể cả khi lần thử lại sau xung đột cũng lỗi) —
 * ❌ không thử vô tận.
 */
export async function pushRun(run: unknown, revision: RevisionHolder): Promise<number> {
	try {
		const saved = await api.putSave(run as Record<string, unknown>, revision.get())
		revision.set(saved.revision)
		return saved.revision
	} catch (error) {
		if (!(error instanceof ApiError) || error.code !== 'revision_conflict') throw error

		// Máy khác vừa ghi. Lấy revision mới rồi thử lại **một lần** với tiến trình của mình.
		const remote = await api.getSave()
		const saved = await api.putSave(run as Record<string, unknown>, remote.revision)
		revision.set(saved.revision)
		return saved.revision
	}
}

export interface PullTargets {
	revision: RevisionHolder
	/** Ghi tiến trình của máy chủ vào localStorage. */
	writeRun(run: unknown): void
	/** Nạp lại store từ localStorage. */
	rehydrate(): Promise<void>
}

/**
 * Nạp bản lưu từ máy chủ. Trả `false` khi máy chủ chưa có bản lưu nào.
 *
 * ⚠️ Thứ tự `revision.set()` → `writeRun()` → `rehydrate()` là **cố định**: ghi localStorage
 * sẽ kích hoạt effect đẩy lên, và lúc đó phải dùng đúng revision vừa lấy.
 */
export async function pullRun(targets: PullTargets): Promise<boolean> {
	const remote = await api.getSave()
	targets.revision.set(remote.revision)
	if (!remote.run) return false
	targets.writeRun(remote.run)
	await targets.rehydrate()
	return true
}
