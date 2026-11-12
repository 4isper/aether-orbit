import type { Locale } from './strings'

export type PlanetId = 'aurelia' | 'cinder' | 'vesper'
export type SceneView = PlanetId | 'system' | 'star' | 'comet' | 'moon'
export const planetIds: PlanetId[] = ['aurelia', 'cinder', 'vesper']

/** Locale-bound copy of a body: what the interface says about it. */
export type BodyCopy = {
  label: string
  title: [string, string]
  description: [string, string]
  metricLabel: string
  metricUnit: string
  facts: [string, string]
}

export type BodyInfo = {
  /** Latin name, shared by both locales. */
  name: string
  code: string
  radius: string
  metricValue: string
  copy: Record<Locale, BodyCopy>
}

export const planets: Record<PlanetId, BodyInfo> = {
  aurelia: {
    name: 'Aurelia',
    code: '001',
    radius: '1.12',
    metricValue: '384',
    copy: {
      ru: {
        label: 'Аурелия',
        title: ['Тихая', 'орбита'],
        description: ['На границе света и тени.', 'Новый мир — на расстоянии взгляда.'],
        metricLabel: 'Дистанция',
        metricUnit: 'св. года',
        facts: ['Авроры у ночных полюсов', 'Транзиты луны по диску Solis'],
      },
      en: {
        label: 'Aurelia',
        title: ['The quiet', 'orbit'],
        description: ['On the border of light and shadow.', 'A new world at the distance of a glance.'],
        metricLabel: 'Distance',
        metricUnit: 'ly',
        facts: ['Auroras at the night poles', 'Moon transits across Solis'],
      },
    },
  },
  cinder: {
    name: 'Cinder',
    code: '002',
    radius: '1.03',
    metricValue: '−42',
    copy: {
      ru: {
        label: 'Синдер',
        title: ['Пепел', 'и свет'],
        description: ['Там, где ветер хранит тишину.', 'Следующая остановка — за горизонтом.'],
        metricLabel: 'Температура',
        metricUnit: '°C',
        facts: ['Дымка на терминаторе', 'Процедурный микрорельеф'],
      },
      en: {
        label: 'Cinder',
        title: ['Ash', 'and light'],
        description: ['Where the wind keeps the silence.', 'The next stop is past the horizon.'],
        metricLabel: 'Temperature',
        metricUnit: '°C',
        facts: ['Haze at the terminator', 'Procedural micro-relief'],
      },
    },
  },
  vesper: {
    name: 'Vesper',
    code: '003',
    radius: '1.21',
    metricValue: '1 800',
    copy: {
      ru: {
        label: 'Веспер',
        title: ['Кольца', 'тишины'],
        description: ['Там, где лёд хранит свет.', 'Третий мир — за пределами ветра.'],
        metricLabel: 'Ветер',
        metricUnit: 'км/ч',
        facts: ['Тень колец на поверхности', 'Щель Кассини в ободах'],
      },
      en: {
        label: 'Vesper',
        title: ['Rings', 'of silence'],
        description: ['Where the ice keeps the light.', 'The third world is past the wind.'],
        metricLabel: 'Wind',
        metricUnit: 'km/h',
        facts: ['Ring shadows on the surface', 'The Cassini gap in the bands'],
      },
    },
  },
}

export const starInfo: BodyInfo = {
  name: 'Solis',
  code: '000',
  radius: '8.4',
  metricValue: '5 800',
  copy: {
    ru: {
      label: 'Солис',
      title: ['Сердце', 'системы'],
      description: ['Отсюда расходится весь свет.', 'Источник каждой орбиты.'],
      metricLabel: 'Температура',
      metricUnit: 'K',
      facts: ['Протуберанцы у лимба', 'Пятна дрейфуют днями'],
    },
    en: {
      label: 'Solis',
      title: ['The heart', 'of the system'],
      description: ['All light spreads from here.', 'The source of every orbit.'],
      metricLabel: 'Temperature',
      metricUnit: 'K',
      facts: ['Prominences at the limb', 'Spots drift for days'],
    },
  },
}

export const cometInfo: BodyInfo = {
  name: 'Boreas',
  code: '004',
  radius: '0.002',
  metricValue: '0.70',
  copy: {
    ru: {
      label: 'Борея',
      title: ['Ледяной', 'гость'],
      description: ['Ионный хвост — строго от звезды.', 'Пылевой изогнут следом орбиты.'],
      metricLabel: 'Эксцентриситет',
      metricUnit: 'e',
      facts: ['Два хвоста: ион и пыль', 'Разгар у перицентра'],
    },
    en: {
      label: 'Boreas',
      title: ['An icy', 'visitor'],
      description: ['The ion tail points straight from the star.', 'The dust tail curves along its wake.'],
      metricLabel: 'Eccentricity',
      metricUnit: 'e',
      facts: ['Two tails: ion and dust', 'Fullest at periapsis'],
    },
  },
}

export const moonInfo: BodyInfo = {
  name: 'Nox',
  code: '005',
  radius: '0.19',
  metricValue: '79',
  copy: {
    ru: {
      label: 'Нокс',
      title: ['Вечная', 'сторона'],
      description: ['Всегда одним ликом к Aurelia.', 'Полмесяца света, полмесяца тьмы.'],
      metricLabel: 'Период',
      metricUnit: 'сут',
      facts: ['Приливной захват', 'Кольцевые транзиты на диск Aurelia'],
    },
    en: {
      label: 'Nox',
      title: ['The far', 'side'],
      description: ['Always the same face to Aurelia.', 'Half a month of light, half of dark.'],
      metricLabel: 'Period',
      metricUnit: 'days',
      facts: ['Tidal lock', 'Annular transits onto Aurelia'],
    },
  },
}

/** Telemetry for every flyable destination except the system overview. */
export const bodies: Record<Exclude<SceneView, 'system'>, BodyInfo> = {
  ...planets,
  star: starInfo,
  comet: cometInfo,
  moon: moonInfo,
}
