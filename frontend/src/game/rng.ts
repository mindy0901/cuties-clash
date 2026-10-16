/** Deterministic PRNG (mulberry32) so every battle can be replayed from a seed. */
export interface Rng {
	next: () => number
	int: (maxExclusive: number) => number
	pick: <T>(list: readonly T[]) => T
	chance: (probability: number) => boolean
}

export function createRng(seed: number): Rng {
	let state = seed >>> 0
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	return {
		next,
		int: (maxExclusive) => Math.floor(next() * maxExclusive),
		pick: (list) => list[Math.floor(next() * list.length)],
		chance: (probability) => next() < probability,
	}
}

/** Small non-cryptographic hash used to derive uid / seed strings. */
export function hashString(input: string): number {
	let h = 2166136261
	for (let i = 0; i < input.length; i += 1) {
		h ^= input.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

export function makeUid(seed: number, label: string): string {
	const value = hashString(`${label}:${seed}:${Math.floor(seed * 2654435761)}`)
	return value.toString(36).padStart(7, '0')
}
