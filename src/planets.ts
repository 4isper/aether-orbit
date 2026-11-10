export type PlanetId = 'aurelia' | 'cinder' | 'vesper'
export type SceneView = PlanetId | 'system' | 'star' | 'comet'
export const planetIds: PlanetId[] = ['aurelia', 'cinder', 'vesper']

export type BodyInfo = {
  name: string
  label: string
  code: string
  title: [string, string]
  description: [string, string]
  radius: string
  metric: [string, string, string]
}

export const planets: Record<PlanetId, BodyInfo> = {
  aurelia: {
    name: 'Aurelia',
    label: 'Аурелия',
    code: '001',
    title: ['Тихая', 'орбита'],
    description: ['На границе света и тени.', 'Новый мир — на расстоянии взгляда.'],
    radius: '1.12',
    metric: ['Дистанция', '384', 'св. года'],
  },
  cinder: {
    name: 'Cinder',
    label: 'Синдер',
    code: '002',
    title: ['Пепел', 'и свет'],
    description: ['Там, где ветер хранит тишину.', 'Следующая остановка — за горизонтом.'],
    radius: '1.03',
    metric: ['Температура', '−42', '°C'],
  },
  vesper: {
    name: 'Vesper',
    label: 'Веспер',
    code: '003',
    title: ['Кольца', 'тишины'],
    description: ['Там, где лёд хранит свет.', 'Третий мир — за пределами ветра.'],
    radius: '9.1',
    metric: ['Ветер', '1 800', 'км/ч'],
  },
}

export const starInfo: BodyInfo = {
  name: 'Solis',
  label: 'Солис',
  code: '000',
  title: ['Сердце', 'системы'],
  description: ['Отсюда расходится весь свет.', 'Источник каждой орбиты.'],
  radius: '8.4',
  metric: ['Температура', '5 800', 'K'],
}

export const cometInfo: BodyInfo = {
  name: 'Boreas',
  label: 'Борея',
  code: '004',
  title: ['Ледяной', 'гость'],
  description: ['Хвост тянется строго от звезды.', 'Возвращается раз в девяносто дней.'],
  radius: '0.02',
  metric: ['Эксцентриситет', '0.70', 'e'],
}

/** Telemetry for every flyable destination except the system overview. */
export const bodies: Record<Exclude<SceneView, 'system'>, BodyInfo> = {
  ...planets,
  star: starInfo,
  comet: cometInfo,
}
