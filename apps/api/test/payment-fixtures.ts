import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TEST_ORIGIN, type TestClient } from '@elvine-sk/platform-server/testing'
import { expect } from 'vitest'
import { transition } from '../src/modules/payments/procedures.ts'
import { approvedAgreement } from './agreement-fixtures.ts'
import { API } from './helpers.ts'

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

/** Upload a file onto a record (`settlement`, `agreement`) as the files card does; PDF unless `png`. */
export async function attachFile(
  platform: PlatformApp,
  client: TestClient,
  entityType: string,
  entityId: string,
  { name = 'receipt.pdf', png = false } = {},
) {
  const form = new FormData()
  form.append('file', new File([png ? PNG : PDF], name, { type: png ? 'image/png' : 'application/pdf' }))
  form.append('entityType', entityType)
  form.append('entityId', entityId)
  const headers: Record<string, string> = { origin: TEST_ORIGIN }
  if (client.cookies.size) headers.cookie = [...client.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  if (client.csrfToken) headers['x-csrf-token'] = client.csrfToken
  const res = await platform.app.request(`${API}/files`, { method: 'POST', headers, body: form })
  return { status: res.status, body: (await res.json()) as any }
}

/**
 * An agreement whose payment is exported: approved as the system (no workflow), calculated by `finance`, its
 * payment approved as the system, then exported by `finance`. `hr` creates the agreement.
 */
export async function exportedPayment(
  platform: PlatformApp,
  finance: TestClient,
  hr: TestClient,
  body: Record<string, unknown>,
) {
  const agreement = await approvedAgreement(platform, hr, body)
  const created = await finance.post(`${API}/payments`, { agreementId: agreement.id })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const id = created.body.data.id as string
  await runWithContext(SYSTEM_CONTEXT, async () => {
    await transition(id, 1, 'in_approval')
    await transition(id, 2, 'approved')
  })
  const exported = await finance.post(`${API}/payments/${id}/export`, { version: 3 })
  expect(exported.status, JSON.stringify(exported.body)).toBe(200)
  return { agreement, payment: exported.body.data }
}
