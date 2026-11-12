/**
 * UI strings for both locales, flat and typed: `strings.ru` is the source of
 * truth, `strings.en` must mirror every key. Placeholders use {name} syntax
 * and are filled by `t()`. The locale itself lives in App state (persisted to
 * localStorage), and every component that renders copy takes it as a prop.
 */

export type Locale = 'ru' | 'en'

const ru = {
  simActive: 'Симуляция активна',
  systemOverview: 'Обзор системы',
  systemOverviewLabel: 'Обзор',
  loader: 'Формируем орбиту',
  navLabel: 'Навигация по системе',
  tour: 'Тур',
  tourStart: 'Автоматический тур по системе',
  tourStop: 'Остановить тур по системе',
  freeFlight: 'Полёт',
  freeFlightStart: 'Свободный полёт: WASD — движение, стрелки — обзор, Q/E — вниз и вверх, Shift — ускорение',
  freeFlightStop: 'Выйти из свободного полёта и вернуться на орбиту',
  freeFlightStatus: 'Свободный полёт',
  hudSpeed: 'Скорость',
  hudNearest: 'До {name}',
  hudUnit: 'ед.',
  hudBoost: 'Shift · ускорение',
  flyToStar: 'Перелёт к звезде {name}',
  flyToPlanet: 'Перелёт к планете {name}',
  flyToComet: 'Перелёт к комете {name}',
  flyToMoon: 'Перелёт к луне {name}',
  explorePlanet: 'Исследовать {name}',
  toOrbit: 'Выйти на орбиту',
  toComet: 'К комете',
  timeControls: 'Управление временем',
  pause: 'Остановить время',
  resume: 'Возобновить время',
  reverse: 'Обратить ход времени',
  unreverse: 'Вернуть обычный ход времени',
  speedGroup: 'Скорость времени',
  speed: 'Скорость времени ×{value}',
  inFlight: 'Межорбитальный перелёт',
  overviewHint: 'Обзор системы. Три мира доступны для исследования.',
  onOrbit: 'На орбите {name}',
  orbitOfStar: 'Звезда системы',
  worldDesert: 'Пустынный мир',
  worldIce: 'Мини-нептун',
  worldComet: 'Комета',
  worldMoon: 'Спутник Aurelia',
  worldExo: 'Экзопланета',
  bodyTelemetry: 'Параметры небесного тела',
  radius: 'Радиус',
  observations: 'Наблюдения',
  exploreOrbit: 'Исследуйте орбиту',
  exploreHint: 'Движение · масштаб · вращение',
  resetCamera: 'Сбросить ракурс камеры',
  resetCameraShort: 'Сбросить ракурс',
  saveFrame: 'Сохранить кадр как PNG',
  saveFrameShort: 'Сохранить кадр',
  shareFrame: 'Поделиться кадром ссылкой',
  shareFrameShort: 'Поделиться',
  linkCopied: 'Ссылка скопирована',
  threeWorlds: 'Aether / Три мира',
  choosePlanet: 'Выберите планету, чтобы выйти на орбиту.',
  orbitsNote: 'Орбиты вокруг звезды · Масштаб условный',
  systemAria: 'Обзор системы. Выберите мир или звезду нажатием на сферу или подпись.',
  planetSceneAria: 'Интерактивная сцена планеты {name}. Перетаскивайте для вращения и используйте колесо для масштабирования.',
  starSceneAria: 'Интерактивная сцена звезды {name}. Перетаскивайте для вращения и используйте колесо для масштабирования.',
  cometSceneAria: 'Интерактивная сцена кометы {name}. Перетаскивайте для вращения и используйте колесо для масштабирования.',
  moonSceneAria: 'Интерактивная сцена луны {name}. Перетаскивайте для вращения и используйте колесо для масштабирования.',
  flightLabel: 'Перелёт: {from} — {to}',
  webglTitle: 'Нужен WebGL',
  webglBody: 'Сцена считается на вашем устройстве в реальном времени — для неё нужен WebGL2 или WebGL.',
  webglHint: 'Включите аппаратное ускорение в настройках браузера, обновите видеодрайвер и перезагрузите страницу.',
  contextLostTitle: 'Контекст WebGL потерян',
  contextLostBody: 'Перезагрузите страницу, чтобы вернуть сцену. Если проблема повторяется — обновите видеодрайвер.',
  errorTitle: 'Сцена не запустилась',
  errorBody: 'Произошла ошибка во время инициализации сцены. Перезагрузите страницу — если не поможет, проверьте поддержку WebGL и видеодрайвер.',
  moon: 'Нокс',
  localeSwitch: 'Переключить язык интерфейса',
  shortcutsTitle: 'Горячие клавиши',
  shortcutsClose: 'Закрыть справку',
  shortcutViews: 'Aurelia · Cinder · Vesper · Solis · Boreas · Нокс · обзор',
  shortcutFree: 'Свободный полёт: движение, обзор и ускорение',
  shortcutPause: 'Остановить и возобновить время',
  shortcutReset: 'Сбросить ракурс',
  shortcutCinema: 'Режим кино: скрыть интерфейс',
  shortcutHelp: 'Эта справка',
  shortcutsHint: 'Клавиши',
  ambienceOn: 'Включить эмбиент',
  ambienceOff: 'Выключить эмбиент',
  eventTransit: 'Транзит Nox по диску Solis',
  eventEclipse: 'Затмение: Nox в тени Aurelia',
  eventPerihelion: 'Boreas у перицентра',
  eventNow: 'идёт сейчас',
  eventIn: 'через {time}',
  eventGo: 'К моменту',
  eventDuration: '{m} мин {s} с',
  eventSeconds: '{s} с',
}

export type StringKey = keyof typeof ru

const en: Record<StringKey, string> = {
  simActive: 'Simulation active',
  systemOverview: 'System overview',
  systemOverviewLabel: 'Overview',
  loader: 'Plotting the orbit',
  navLabel: 'System navigation',
  tour: 'Tour',
  tourStart: 'Automatic tour of the system',
  tourStop: 'Stop the system tour',
  freeFlight: 'Flight',
  freeFlightStart: 'Free flight: WASD moves, arrows look, Q/E down and up, Shift boosts',
  freeFlightStop: 'Leave free flight and return to orbit',
  freeFlightStatus: 'Free flight',
  hudSpeed: 'Speed',
  hudNearest: 'To {name}',
  hudUnit: 'u',
  hudBoost: 'Shift · boost',
  flyToStar: 'Fly to the star {name}',
  flyToPlanet: 'Fly to the planet {name}',
  flyToComet: 'Fly to the comet {name}',
  flyToMoon: 'Fly to the moon {name}',
  explorePlanet: 'Explore {name}',
  toOrbit: 'Enter orbit',
  toComet: 'To the comet',
  timeControls: 'Time controls',
  pause: 'Pause time',
  resume: 'Resume time',
  reverse: 'Reverse the flow of time',
  unreverse: 'Restore the normal flow of time',
  speedGroup: 'Time speed',
  speed: 'Time speed ×{value}',
  inFlight: 'Inter-orbit flight',
  overviewHint: 'System overview. Three worlds are ready to explore.',
  onOrbit: 'In orbit of {name}',
  orbitOfStar: 'The star of the system',
  worldDesert: 'Desert world',
  worldIce: 'Ice mini-neptune',
  worldComet: 'Comet',
  worldMoon: 'Moon of Aurelia',
  worldExo: 'Exoplanet',
  bodyTelemetry: 'Body telemetry',
  radius: 'Radius',
  observations: 'Observations',
  exploreOrbit: 'Explore the orbit',
  exploreHint: 'Motion · scale · rotation',
  resetCamera: 'Reset the camera pose',
  resetCameraShort: 'Reset pose',
  saveFrame: 'Save frame as PNG',
  saveFrameShort: 'Save frame',
  shareFrame: 'Share this view as a link',
  shareFrameShort: 'Share',
  linkCopied: 'Link copied',
  threeWorlds: 'Aether / Three worlds',
  choosePlanet: 'Pick a planet to enter its orbit.',
  orbitsNote: 'Orbits around the star · Scale is illustrative',
  systemAria: 'System overview. Choose a world or the star by clicking its sphere or label.',
  planetSceneAria: 'Interactive scene of the planet {name}. Drag to rotate, scroll to zoom.',
  starSceneAria: 'Interactive scene of the star {name}. Drag to rotate, scroll to zoom.',
  cometSceneAria: 'Interactive scene of the comet {name}. Drag to rotate, scroll to zoom.',
  moonSceneAria: 'Interactive scene of the moon {name}. Drag to rotate, scroll to zoom.',
  flightLabel: 'Flight: {from} — {to}',
  webglTitle: 'WebGL required',
  webglBody: 'The scene runs on your device in real time - it needs WebGL2 or WebGL.',
  webglHint: 'Enable hardware acceleration in the browser settings, update the graphics driver and reload the page.',
  contextLostTitle: 'WebGL context lost',
  contextLostBody: 'Reload the page to bring the scene back. If it keeps happening, update your graphics driver.',
  errorTitle: 'The scene failed to start',
  errorBody: 'Something went wrong while initializing the scene. Reload the page - if that does not help, check WebGL support and the graphics driver.',
  moon: 'Nox',
  localeSwitch: 'Switch the interface language',
  shortcutsTitle: 'Keyboard shortcuts',
  shortcutsClose: 'Close the shortcuts',
  shortcutViews: 'Aurelia · Cinder · Vesper · Solis · Boreas · Nox · overview',
  shortcutFree: 'Free flight: move, look and boost',
  shortcutPause: 'Pause and resume time',
  shortcutReset: 'Reset the camera pose',
  shortcutCinema: 'Cinema mode: hide the interface',
  shortcutHelp: 'This help',
  shortcutsHint: 'Keys',
  ambienceOn: 'Turn on the ambience',
  ambienceOff: 'Turn off the ambience',
  eventTransit: 'Nox transit across Solis',
  eventEclipse: "Eclipse: Nox enters Aurelia's shadow",
  eventPerihelion: 'Boreas at perihelion',
  eventNow: 'happening now',
  eventIn: 'in {time}',
  eventGo: 'Skip to the moment',
  eventDuration: '{m} min {s} s',
  eventSeconds: '{s} s',
}

export const strings: Record<Locale, Record<StringKey, string>> = { ru, en }

/** Fill "{placeholder}" slots in a string template. */
export function t(
  locale: Locale,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  const template = strings[locale][key]
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (slot, name) =>
    name in vars ? String(vars[name]) : slot,
  )
}

const STORAGE_KEY = 'aether-locale'

/** Persisted locale, defaulting to Russian (the project's home language). */
export function readStoredLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru'
  } catch {
    return 'ru'
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // private mode: the choice just does not persist
  }
}
