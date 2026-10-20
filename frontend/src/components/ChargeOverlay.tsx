/**
 * How far the charge line's top edge sits **inside** the wash. The two are positioned separately
 * (one by `height`, one by `bottom`), so a shared edge would still show a sub-pixel dark hairline
 * once the browser rounds the percentages — overlapping by a pixel makes a gap impossible.
 */
const CHARGE_LINE_OVERLAP_PX = 1

/** Charge percentage, clamped so a rounding slip can never push the bar out of the tile. */
function chargePercent(charge: number) {
	return Math.max(0, Math.min(100, charge))
}

function chargeLineHeight(sizeScale: number) {
	return Math.max(2, 3 * sizeScale)
}

/**
 * The weapon-charge read-out: a **rising hairline with a swell under it**, never a filled tile.
 *
 * One bright horizontal bar climbs from the bottom edge to the top (that is the number the player reads)
 * and the region below it lifts with a wash, so the bar reads as *rising* instead of a line that
 * teleports up. The bar's top edge is pinned `CHARGE_LINE_OVERLAP_PX` inside the wash so the two can
 * never separate — ❌ do not float the bar above the fill edge (that leaves a dark hairline). Both parts
 * share the cycle key, so a finished charge is replaced by a fresh bar at the bottom.
 *
 * ⚠️ ONE component for **both** owners: an item tile and the Cutie itself (`AvatarCard`) draw the same
 * thing. Two copies of these classes is how the portrait would end up with a subtly different bar than
 * the weapons beside it.
 */
export function ChargeOverlay({
	percent,
	cycle = 0,
	sizeScale = 1,
}: {
	/** 0–100. */
	percent: number
	/** Charge cycle index — see `weaponChargeState`; it keys the element so the bar restarts. */
	cycle?: number
	/** Scale the line's thickness with the cell it is drawn in. */
	sizeScale?: number
}) {
	const value = chargePercent(percent)
	return (
		<>
			<span
				key={`charge-fill-${cycle}`}
				aria-hidden="true"
				data-weapon-charge-fill
				className="charge-fill pointer-events-none absolute inset-x-0 bottom-0 z-[4] transition-[height] duration-75 ease-linear"
				style={{ height: `${value}%` }}
			/>
			<span
				key={`charge-${cycle}`}
				aria-hidden="true"
				data-weapon-charge-overlay
				data-weapon-charge-cycle={cycle}
				className="pointer-events-none absolute inset-x-0 z-[5] bg-se shadow-[0_0_10px_var(--color-se),0_3px_9px_rgb(170_220_255/55%),0_10px_22px_rgb(140_195_245/35%),0_18px_34px_rgb(120_180_235/20%)] transition-[bottom] duration-75 ease-linear"
				style={{
					bottom: `calc(${value}% - ${chargeLineHeight(sizeScale) - CHARGE_LINE_OVERLAP_PX}px)`,
					height: `${chargeLineHeight(sizeScale)}px`,
				}}
			/>
		</>
	)
}
