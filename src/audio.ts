/**
 * Ambient soundtrack, synthesized in the browser: two low oscillators and a
 * filtered noise bed breathing on a slow LFO. No audio assets, no autoplay —
 * the AudioContext is created on the first user gesture (the sound button)
 * because browsers require one anyway. Toggling only fades the master gain,
 * so the graph is built once and races are impossible.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let boostGain: GainNode | null = null
let enabled = false

const LEVEL = 0.09
const FADE = 0.4
/** The boost hum rides under the ambience: felt, not heard. */
const BOOST_LEVEL = 0.06

/**
 * Whether an arriving event announcement deserves its cue: only the moment
 * a window begins counts — the chip re-announces every second while a
 * window ticks or a countdown runs, and none of that is a cue.
 */
export function eventCueTransition(
  previous: { inProgress: boolean } | null,
  next: { inProgress: boolean } | null,
): boolean {
  return Boolean(next?.inProgress) && !(previous?.inProgress ?? false)
}

function buildGraph(context: AudioContext): GainNode {
  const out = context.createGain()
  out.gain.value = 0.0001
  out.connect(context.destination)

  // The drone: a root and a slightly detuned fifth two octaves below hearing.
  const drone = (frequency: number, level: number) => {
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = frequency
    const gain = context.createGain()
    gain.gain.value = level
    osc.connect(gain).connect(out)
    osc.start()
  }
  drone(55, 0.5)
  drone(82.41, 0.32)
  drone(110, 0.16)

  // The hiss of the observation deck: looped brown noise behind a lowpass.
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    data[i] = (last + 0.02 * white) / 1.02
    last = data[i]
    data[i] *= 3.5
  }
  const noise = context.createBufferSource()
  noise.buffer = noiseBuffer
  noise.loop = true
  const lowpass = context.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 220
  lowpass.Q.value = 0.7
  const noiseGain = context.createGain()
  noiseGain.gain.value = 0.35
  noise.connect(lowpass).connect(noiseGain).connect(out)
  noise.start()

  // The boost hum: two beating saws behind a lowpass, silent until the
  // pilot holds the boost key. The gain sits at zero, setBoost drives it.
  const humBus = context.createGain()
  humBus.gain.value = 0.0001
  humBus.connect(out)
  boostGain = humBus
  const hum = (frequency: number) => {
    const osc = context.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = frequency
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 160
    osc.connect(filter).connect(humBus)
    osc.start()
  }
  hum(41.2)
  hum(41.8)

  // Breathing: a very slow LFO swells the whole mix around its base level.
  const lfo = context.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.07
  const lfoDepth = context.createGain()
  lfoDepth.gain.value = 0.03
  lfo.connect(lfoDepth).connect(out.gain)
  lfo.start()

  return out
}

/** Current ambience state, mirrored into App state by the caller. */
export function isAmbienceOn() {
  return enabled
}

const AMBIENCE_KEY = 'aether-ambience'

/**
 * The user's sound intent, persisted like the locale: autoplay policies still
 * hold the actual start until the first gesture, but the button renders in
 * the remembered state and the first interaction anywhere resumes it.
 */
export function readStoredAmbience(): boolean {
  try {
    return localStorage.getItem(AMBIENCE_KEY) === 'on'
  } catch {
    return false
  }
}

export function storeAmbience(on: boolean): void {
  try {
    localStorage.setItem(AMBIENCE_KEY, on ? 'on' : 'off')
  } catch {
    // private mode: the choice just does not persist
  }
}

/** Fade the ambience in or out; safe to call with the same value repeatedly. */
export function setAmbience(on: boolean) {
  if (on && !ctx) {
    ctx = new AudioContext()
    master = buildGraph(ctx)
  }
  if (!ctx || !master) return
  enabled = on
  if (ctx.state === 'suspended') void ctx.resume()
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setTargetAtTime(on ? LEVEL : 0.0001, now, FADE)
}

/**
 * The boost hum under the ambience: on while the pilot holds the boost key.
 * Idempotent, safe with the sound off (no context yet — nothing to drive).
 */
export function setBoost(active: boolean) {
  if (!ctx || !boostGain) return
  const now = ctx.currentTime
  boostGain.gain.setTargetAtTime(active ? BOOST_LEVEL : 0.0001, now, active ? 0.12 : 0.35)
}

/**
 * A one-shot swell for the moment an announced sky event begins: the drone's
 * fifth sliding down an octave, felt as a slow wave. Silent with the sound
 * off; safe to call repeatedly.
 */
export function playEventCue() {
  if (!ctx || !master || !enabled) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(82.41, now)
  osc.frequency.exponentialRampToValueAtTime(55, now + 1.6)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9)
  osc.connect(gain).connect(master)
  osc.start(now)
  osc.stop(now + 2)
}
