import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(import.meta.dirname, '../../web/i18n/locales')

/** Every string of a locale file, with its key path. */
function strings(o: unknown, path = ''): [string, string][] {
  if (typeof o === 'string') return [[path, o]]
  if (!o || typeof o !== 'object') return []
  return Object.entries(o).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
}

describe('app locale files', () => {
  // vue-i18n refuses a whole locale file when one message looks like HTML, and every key then shows raw.
  it.each(['app.en.json', 'app.lo.json'])('%s has no HTML-like message', (file) => {
    const bad = strings(JSON.parse(readFileSync(join(dir, file), 'utf8'))).filter(([, v]) => /[<>]/.test(v))
    expect(bad).toEqual([])
  })

  it('en and lo have the same keys', () => {
    const keys = (file: string) =>
      strings(JSON.parse(readFileSync(join(dir, file), 'utf8')))
        .map(([k]) => k)
        .sort()
    expect(keys('app.lo.json')).toEqual(keys('app.en.json'))
  })
})
