/**
 * Icons for the whole UI — every one of them comes from `lucide-react`.
 *
 * ⚠️ WHY A SINGLE MODULE: an icon is picked in one place, so the same action always looks the same
 * (one "xoá" icon everywhere) and swapping a glyph never means hunting through screens.
 *
 * ⚠️ Sizing: `svg.lucide` is set to `1em` in `styles/app.css`, so an icon inherits the font size of
 * the text beside it — same as the emoji it replaced. Pass a `size-*` class only where an icon has
 * to be larger or smaller than its text.
 *
 * ⚠️ What is **not** here: item / pet / status icons are **game content** — `items.ts`, `pets.ts`
 * and `labels.ts` keep an emoji fallback for when no picture is uploaded (see `docs/ASSETS.md`).
 * Those are never replaced with an outline icon: a pet is a picture, not a UI control.
 */

import { PawPrint } from 'lucide-react'

export {
	ArrowDown,
	Check,
	CircleDot,
	ClipboardList,
	Dices,
	Handshake,
	ImagePlus,
	Library,
	LogIn,
	Map,
	Pause,
	Play,
	Plus,
	Recycle,
	RotateCcw,
	Save,
	Settings,
	Shield,
	Skull,
	SkipForward,
	ShoppingCart,
	Swords,
	Trash2,
	Trophy,
	X,
} from 'lucide-react'

/**
 * The **Paw Tally** unit, drawn wherever a price or a reward is shown (`12 🐾` → `12` + this).
 *
 * ⚠️ `aria-hidden` with no label: the number beside it already says everything, and a screen reader
 * announcing "paw print" between a price and a word would only get in the way.
 */
export function Paw({ className }: { className?: string }) {
	return <PawPrint aria-hidden className={className} />
}

/**
 * A Paw Tally amount: `12` + the paw glyph (+ an optional muted `note`).
 *
 * ⚠️ Every price and reward goes through this one component, so the unit can never be spelled two
 * different ways on two screens.
 */
export function Cost({ amount, note }: { amount: number; note?: string }) {
	return (
		<>
			{amount} <Paw /> {note ? <span className="text-muted">{note}</span> : null}
		</>
	)
}
