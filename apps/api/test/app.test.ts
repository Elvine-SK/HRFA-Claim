import { createTestApp } from '@elvine-sk/platform-server/testing'
import { describe, expect, it } from 'vitest'
import { modules } from '../src/app.ts'

describe('api', () => {
  it('assembles the modules and answers /health without a database', async () => {
    const platform = await createTestApp({ modules: modules() })
    const res = await platform.app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    await platform.ctx.db.destroy()
  })
})
