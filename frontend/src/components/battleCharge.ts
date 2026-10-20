/** One weapon's charge state: how full the bar is, and **which cycle** it belongs to. */
export interface WeaponCharge {
	/** 0–100. */
	percent: number
	/**
	 * Index of the current charge cycle — bump it as the `key` of the bar element and each cycle becomes a
	 * **new** bar that starts at the bottom. Reusing one element makes it slide back down after a hit,
	 * which reads like a rewind instead of a fresh charge.
	 */
	cycle: number
}

/** Charge a weapon between its actual attack events so playback matches the battle simulation. */
export function weaponChargeAt(
	attackTimes: readonly number[],
	elapsed: number,
	interval: number,
	attackPulseDuration: number,
): number {
	let previousAttack = 0
	let nextAttack: number | undefined

	for (const attackTime of attackTimes) {
		if (attackTime <= elapsed) previousAttack = attackTime
		else {
			nextAttack = attackTime
			break
		}
	}

	if (previousAttack > 0 && elapsed - previousAttack <= attackPulseDuration) return 100
	const cycleStart = previousAttack > 0 ? previousAttack + attackPulseDuration * 2 : 0
	const cycleEnd = nextAttack ?? previousAttack + interval
	if (elapsed <= cycleStart || cycleEnd <= cycleStart) return 0
	return Math.max(0, Math.min(100, Math.round(((elapsed - cycleStart) / (cycleEnd - cycleStart)) * 100)))
}

/**
 * One stretch of time a weapon spent **frozen** — its charge is paused for that span, so the bar
 * neither advances nor rewinds while the ice is on it.
 */
export interface FreezeWindow {
	/** Simulated time the freeze started. */
	start: number
	/** How long it lasts, in the same simulated ms. */
	duration: number
}

/**
 * Total frozen time a weapon has accumulated **before** `t`.
 *
 * ⚠️ Why this exists: the charge bar is derived from the weapon's real attack times, so a frozen
 * weapon (which by definition does not attack) kept a slowly filling bar across the whole freeze — the
 * player saw the line run while the tile said ❄. Shifting the clock by the frozen time pauses the bar
 * where it stood and resumes it afterwards, without touching the simulation.
 */
export function frozenShift(windows: readonly FreezeWindow[], t: number): number {
	let shift = 0
	for (const window of windows) {
		if (t <= window.start) break
		shift += Math.min(t - window.start, window.duration)
	}
	return shift
}

/** A weapon's attack times with frozen spans removed, so the bar pauses while it is frozen. */
export function pausedAttackTimes(
	attackTimes: readonly number[],
	windows: readonly FreezeWindow[],
): number[] {
	return windows.length === 0
		? [...attackTimes]
		: attackTimes.map((time) => time - frozenShift(windows, time))
}

/**
 * The full read-out of a weapon: the percentage **and** the cycle it belongs to.
 *
 * The cycle advances the instant the bar **leaves 100 %** (one pulse after the swing) — that is the
 * frame where the percentage drops to zero, so the bar is replaced instead of being transitioned
 * downwards. ⚠️ Waiting until the next cycle's start (`attack + pulse × 2`) left the element with the old
 * key while its percentage was already 0, which animated the full line sliding back down.
 */
export function weaponChargeState(
	attackTimes: readonly number[],
	elapsed: number,
	interval: number,
	attackPulseDuration: number,
): WeaponCharge {
	let cycle = 0
	for (const attackTime of attackTimes) {
		if (attackTime + attackPulseDuration < elapsed) cycle += 1
		else break
	}
	return { percent: weaponChargeAt(attackTimes, elapsed, interval, attackPulseDuration), cycle }
}
