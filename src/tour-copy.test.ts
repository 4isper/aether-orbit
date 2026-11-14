import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tourCaption } from './tour-copy.ts'
import { bodies } from './planets.ts'
import type { SceneView } from './planets.ts'

const VIEWS: SceneView[] = ['aurelia', 'cinder', 'vesper', 'system', 'star', 'comet', 'moon', 'belt', 'erebus']

test('every tour stop has a caption with a non-empty title, in both languages', () => {
  for (const view of VIEWS) {
    for (const locale of ['ru', 'en'] as const) {
      const caption = tourCaption(view, locale)
      assert.ok(caption.line1.trim().length > 0, `view ${view} (${locale}) has an empty line1`)
      assert.ok(!caption.line2 || caption.line2.trim().length > 0, `view ${view} (${locale}) has a blank line2`)
    }
  }
})

test('body stops name themselves and offer one observation', () => {
  for (const view of VIEWS.filter((v) => v !== 'system')) {
    const caption = tourCaption(view, 'ru')
    assert.ok(caption.name && caption.name.length > 0, `view ${view} has no name`)
    assert.ok(caption.eyebrow && caption.eyebrow.length > 0, `view ${view} has no eyebrow`)
    assert.ok(caption.fact && caption.fact.length > 0, `view ${view} has no observation`)
    // The title is the body card's own title — one story, two tellings.
    assert.deepEqual([caption.line1, caption.line2], [...bodies[view].copy.ru.title])
  }
})

test('the overview stops alone: no name, no observation', () => {
  const caption = tourCaption('system', 'en')
  assert.equal(caption.name, undefined)
  assert.equal(caption.eyebrow, undefined)
  assert.equal(caption.fact, undefined)
  assert.ok(caption.line1.includes('overview') || caption.line1.length > 0)
})
