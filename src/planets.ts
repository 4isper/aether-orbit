export type PlanetId = 'aurelia' | 'cinder'
export type SceneView = PlanetId | 'system'

type PlanetInfo = {
  name: string
  label: string
  code: string
  title: [string, string]
  description: [string, string]
  radius: string
  metric: [string, string, string]
  anchor: [number, number, number]
}

export const planets: Record<PlanetId, PlanetInfo> = {
  aurelia: {
    name: 'Aurelia',
    label: 'Аурелия',
    code: '001',
    title: ['Тихая', 'орбита'],
    description: ['На границе света и тени.', 'Новый мир — на расстоянии взгляда.'],
    radius: '1.12',
    metric: ['Дистанция', '384', 'св. года'],
    anchor: [0, 0, 0],
  },
  cinder: {
    name: 'Cinder',
    label: 'Синдер',
    code: '002',
    title: ['Пепел', 'и свет'],
    description: ['Там, где ветер хранит тишину.', 'Следующая остановка — за горизонтом.'],
    radius: '1.03',
    metric: ['Температура', '−42', '°C'],
    anchor: [18, 0, -6],
  },
}
