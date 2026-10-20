/**
 * Icons for the whole UI — every one of them comes from `lucide-react`.
 *
 * 🔴 **Lucide is the only icon library in this app.** It is the library shadcn/ui ships with and
 * lists first on <https://www.shadcn.io/icons/libraries>, so a component copied from shadcn and a
 * control written by hand look like they came from the same place. ❌ Do not add a second icon
 * package (Heroicons, Phosphor, Tabler, Radix Icons…), ❌ do not hand-write `<svg>` for a control,
 * and ❌ do not type a Unicode glyph (`»`, `✓`, `↑`, `✕`) where an icon belongs — a glyph changes
 * shape with the system font and cannot be sized or themed like an icon.
 *
 * ⚠️ WHY A SINGLE MODULE: it is the **only** file that imports from `lucide-react` outside
 * `components/shadcn/*`, so an icon is picked in one place, the same action always looks the same
 * (one "xoá" icon everywhere), and swapping a glyph never means hunting through screens.
 *
 * ⚠️ Sizing: `svg.lucide` is set to `1em` in `styles/app.css`, so an icon inherits the font size of
 * the text beside it. Pass a `size-*` class only where an icon has to be larger or smaller than
 * its text.
 *
 * ⚠️ What is **not** here: item / cutie / status icons are **game content** — `items.ts`, `cuties.ts`
 * and `labels.ts` keep an emoji fallback for when no picture is uploaded (see `docs/ASSETS.md`).
 * Those are never replaced with an outline icon: a cutie is a picture, not a UI control.
 */

import { Coins, Star } from 'lucide-react'
import { cn } from '../lib/utils'

export {
	ArrowDown,
	ArrowLeftRight,
	ArrowUp,
	ArrowUpDown,
	BookOpen,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	CircleDot,
	ClipboardList,
	Clock,
	Dices,
	Grid2x2,
	Handshake,
	ImagePlus,
	Info,
	Library,
	Lock,
	LogIn,
	Map,
	Pause,
	Coins,
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
	Star,
	Swords,
	Target,
	Trash2,
	Trophy,
	X,
} from 'lucide-react'

/**
 * The **gold** unit, drawn wherever a price or a reward is shown.
 *
 * ⚠️ `aria-hidden` with no label: the number beside it already says everything, and a screen reader
 * announcing "coins" between a price and a word would only get in the way.
 */
export function Gold({ className }: { className?: string }) {
	return <Coins aria-hidden className={className} />
}

/**
 * A gold amount: `12` + the coin glyph (+ an optional muted `note`).
 *
 * ⚠️ Every price and reward goes through this one component, so the unit can never be spelled two
 * different ways on two screens.
 */
export function Cost({ amount, note }: { amount: number; note?: string }) {
	return (
		<>
			{amount} <Gold /> {note ? <span className="text-muted">{note}</span> : null}
		</>
	)
}

/**
 * A star rank drawn as **`count` filled lucide stars** — the same glyph `ItemTile` uses on a tile.
 *
 * ⚠️ The `★` **character** is only ever a label ("Base price (1★)"); a rank that is *drawn* goes
 * through here, so a 3★ item looks identical on a board, in a shop card and in the odds list.
 */
export function StarRow({ count, className }: { count: number; className?: string }) {
	return (
		<span role="img" aria-label={`${count}★`} className={cn('flex shrink-0 items-center gap-px', className)}>
			{Array.from({ length: count }, (_unused, index) => (
				<Star key={index} aria-hidden className="size-3 fill-current" />
			))}
		</span>
	)
}


