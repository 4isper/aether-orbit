import { t, type Locale } from '../../strings'

/** The overview's copy: what the map is and how to leave it. */
export function SystemPanel({ locale, travelling }: { locale: Locale; travelling: boolean }) {
  return (
    <>
      <section className="system-intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
        <p className="eyebrow">{t(locale, 'threeWorlds')}</p>
        <h1 id="scene-title">{t(locale, 'systemOverview')}</h1>
        <p>{t(locale, 'choosePlanet')}</p>
      </section>
      <p className="system-note reveal" aria-hidden={travelling}>{t(locale, 'orbitsNote')}</p>
    </>
  )
}
