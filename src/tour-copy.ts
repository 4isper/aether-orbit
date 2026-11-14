/**
 * The cinema tour's captions: what the frame says about each world while
 * the interface is hidden. One stop, one card — the body card's own title
 * and first observation, so the tour tells the same story the orbit view
 * does, only quieter. Pure strings, both languages: the `.tsx` components
 * read from here.
 */
import { bodies, type SceneView } from './planets.ts'
import { t, type Locale, type StringKey } from './strings.ts'

/** The classification line per view — the same eyebrow the body card shows.
 * Lives here (pure, testable) so the card and the captions never drift. The
 * overview has no eyebrow; the body card only calls this with a body. */
export function worldEyebrow(view: SceneView): StringKey {
  if (view === 'star') return 'orbitOfStar'
  if (view === 'cinder') return 'worldDesert'
  if (view === 'vesper') return 'worldIce'
  if (view === 'comet') return 'worldComet'
  if (view === 'moon') return 'worldMoon'
  if (view === 'belt') return 'worldBelt'
  if (view === 'erebus') return 'worldErebus'
  // The overview has no eyebrow of its own; the body card never asks.
  return 'worldExo'
}

export type TourCaption = {
  /** The body's code name, e.g. "Aurelia" — absent on the overview. */
  name?: string
  /** The classification line, localized — absent on the overview. */
  eyebrow?: string
  /** The world's own title; the overview has a single line. */
  line1: string
  line2?: string
  /** One observation to read on the frame — absent on the overview. */
  fact?: string
}

export function tourCaption(view: SceneView, locale: Locale): TourCaption {
  if (view === 'system') {
    return { line1: t(locale, 'systemOverview') }
  }
  const body = bodies[view]
  return {
    name: body.name,
    eyebrow: t(locale, worldEyebrow(view)),
    line1: body.copy[locale].title[0],
    line2: body.copy[locale].title[1],
    fact: body.copy[locale].facts[0],
  }
}
