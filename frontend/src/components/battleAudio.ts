let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let audioUnavailable = false

/**
 * Minimum gap between two sounds of the **same kind**, in milliseconds.
 *
 * Why: playback can cross a whole burst of hits in one tick, and **Bỏ qua** crosses the rest of the
 * fight at once. Dozens of overlapping buffer sources do not read as "many hits" — they read as one
 * very loud, clipped roar. Slash and impact are throttled **separately**, because an impact lands a
 * few hundred milliseconds after its slash and a shared watchdog would swallow it.
 */
const MIN_SOUND_GAP_MS = 50
let lastSlashAt = Number.NEGATIVE_INFINITY
let lastImpactAt = Number.NEGATIVE_INFINITY

function nowMs(): number {
	return typeof performance === 'object' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

/** `true` when the last sound of this kind is old enough; the caller records the new time. */
function soundBudget(last: number): boolean {
	return nowMs() - last >= MIN_SOUND_GAP_MS
}

function getAudioContext(): AudioContext | null {
	if (audioUnavailable || typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null
	if (context?.state === 'closed') {
		context = null
		noiseBuffer = null
	}
	if (context) return context

	try {
		context = new window.AudioContext()
		return context
	} catch (error) {
		audioUnavailable = true
		console.error('Battle audio could not be initialized.', error)
		return null
	}
}

function getNoiseBuffer(audio: AudioContext): AudioBuffer {
	if (noiseBuffer) return noiseBuffer
	const duration = 0.3
	const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate)
	const samples = buffer.getChannelData(0)
	for (let index = 0; index < samples.length; index += 1) {
		samples[index] = Math.random() * 2 - 1
	}
	noiseBuffer = buffer
	return buffer
}

function playNoiseSweep(
	audio: AudioContext,
	options: { start: number; end: number; duration: number; volume: number; filter: BiquadFilterType; attack?: number },
) {
	const start = audio.currentTime
	const source = audio.createBufferSource()
	const filter = audio.createBiquadFilter()
	const gain = audio.createGain()
	const attack = options.attack ?? 0.015

	source.buffer = getNoiseBuffer(audio)
	filter.type = options.filter
	filter.frequency.setValueAtTime(options.start, start)
	filter.frequency.exponentialRampToValueAtTime(options.end, start + options.duration)
	filter.Q.value = options.filter === 'bandpass' ? 1.2 : 0.7
	gain.gain.setValueAtTime(0.0001, start)
	gain.gain.exponentialRampToValueAtTime(options.volume, start + attack)
	gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)

	source.connect(filter).connect(gain).connect(audio.destination)
	source.start(start)
	source.stop(start + options.duration)
}

export function unlockBattleAudio() {
	const audio = getAudioContext()
	if (!audio || audio.state !== 'suspended') return
	void audio.resume().catch((error: unknown) => {
		console.error('Battle audio could not be resumed.', error)
	})
}

export function playBattleSlashSound() {
	const audio = getAudioContext()
	if (!audio || audio.state !== 'running') return
	if (!soundBudget(lastSlashAt)) return
	lastSlashAt = nowMs()
	playNoiseSweep(audio, {
		start: 5600,
		end: 900,
		duration: 0.11,
		volume: 0.24,
		filter: 'bandpass',
		attack: 0.002,
	})

	const start = audio.currentTime
	const blade = audio.createOscillator()
	const bladeGain = audio.createGain()
	const resonance = audio.createBiquadFilter()
	blade.type = 'triangle'
	blade.frequency.setValueAtTime(2200, start)
	blade.frequency.exponentialRampToValueAtTime(850, start + 0.075)
	resonance.type = 'highpass'
	resonance.frequency.setValueAtTime(700, start)
	bladeGain.gain.setValueAtTime(0.0001, start)
	bladeGain.gain.exponentialRampToValueAtTime(0.035, start + 0.003)
	bladeGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085)
	blade.connect(resonance).connect(bladeGain).connect(audio.destination)
	blade.start(start)
	blade.stop(start + 0.09)
}

export function playBattleImpactSound() {
	const audio = getAudioContext()
	if (!audio || audio.state !== 'running') return
	if (!soundBudget(lastImpactAt)) return
	lastImpactAt = nowMs()
	playNoiseSweep(audio, { start: 1100, end: 180, duration: 0.12, volume: 0.12, filter: 'lowpass' })

	const start = audio.currentTime
	const tone = audio.createOscillator()
	const gain = audio.createGain()
	tone.type = 'triangle'
	tone.frequency.setValueAtTime(170, start)
	tone.frequency.exponentialRampToValueAtTime(55, start + 0.12)
	gain.gain.setValueAtTime(0.0001, start)
	gain.gain.exponentialRampToValueAtTime(0.12, start + 0.008)
	gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14)
	tone.connect(gain).connect(audio.destination)
	tone.start(start)
	tone.stop(start + 0.15)
}
