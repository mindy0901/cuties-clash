import { fireEvent, screen } from '@testing-library/react'

/**
 * Starts a stage fight the way a player does: **Phiêu Lưu** in the footer opens the Adventure map, and
 * the `Đấu Cutie` button in that dialog fights the stage selected on the map.
 *
 * ⚠️ The fight button used to sit in the shared footer, so older tests clicked it straight from the
 * preparation room. It lives in `StageMapDialog` now — go through this helper instead of duplicating
 * the two clicks.
 */
export function fightCurrentStage() {
	fireEvent.click(screen.getByText('Phiêu Lưu'))
	fireEvent.click(screen.getByText(/Đấu Cutie/))
}
