import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strings, t } from './strings.ts'

test('every locale mirrors the full key set', () => {
  const ruKeys = Object.keys(strings.ru).sort()
  for (const locale of Object.keys(strings) as Array<keyof typeof strings>) {
    assert.deepEqual(Object.keys(strings[locale]).sort(), ruKeys, `${locale} diverged`)
  }
})

test('no string is left empty or untranslated', () => {
  for (const [locale, dictionary] of Object.entries(strings)) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.ok(value.trim().length > 0, `${locale}.${key} is empty`)
    }
  }
})

test('context-lost overlay is localized', () => {
  for (const locale of ['ru', 'en'] as const) {
    assert.equal(t(locale, 'contextLostTitle'), strings[locale].contextLostTitle)
    const body = t(locale, 'contextLostBody')
    assert.ok(body.length > 0, `${locale}.contextLostBody is missing`)
  }
  assert.notEqual(strings.ru.contextLostBody, strings.en.contextLostBody)
})

test('t fills placeholders and keeps unknown slots intact', () => {
  assert.equal(t('ru', 'flyToPlanet', { name: 'Aurelia' }), 'Перелёт к планете Aurelia')
  assert.equal(t('en', 'flightLabel', { from: 'A', to: 'B' }), 'Flight: A — B')
  assert.equal(t('ru', 'systemOverview'), 'Обзор системы')
})
