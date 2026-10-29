import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TEST_ORIGIN, type TestClient } from '@elvine-sk/platform-server/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'
import { appDb } from '../src/shared/db.ts'
import { API } from './helpers.ts'

/** Role ids by key, as the agreements migration seeded them. */
export async function roleIds(...keys: string[]) {
  const rows = await runWithContext(SYSTEM_CONTEXT, () =>
    appDb().selectFrom('roles').select(['id', 'key']).where('key', 'in', keys).execute(),
  )
  return keys.map((k) => rows.find((r) => r.key === k)!.id)
}

/**
 * Form 1 bodies with fresh Doc.nos. The test files of a run share one database, so each file takes its own
 * document year: Doc.nos of two files never meet.
 */
export function domesticBodies(year: number, leader = '10010') {
  let seq = 100
  return (over: Record<string, unknown> = {}) => {
    seq += 1
    return {
      formType: 'domestic',
      subject: 'Branch audit',
      title: 'Audit of the Luang Prabang branch',
      reference: null,
      docNo: `${seq}.BCEL.888010.${year}`,
      docDate: `${year}-10-29`,
      travelFrom: '2026-11-02',
      travelTo: '2026-11-05',
      fromProvinceCode: '01',
      toProvinceCode: '06',
      policyOption: 'bcel_all',
      hasAdvance: false,
      members: [{ eid: leader, isLeader: true }],
      ...over,
    }
  }
}

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

/** The workflow as an administrator creates it from `workflow.json`. */
export async function createWorkflow(admin: TestClient) {
  const file = JSON.parse(
    readFileSync(join(import.meta.dirname, '../src/modules/agreements/workflow.json'), 'utf8'),
  ) as { key: string; name: string; entityType: string; definition: unknown }
  const existing = await admin.get(`${API}/approval/workflows`)
  if (existing.body.data?.some((w: any) => w.key === file.key)) return
  const wf = await admin.post(`${API}/approval/workflows`, { key: file.key, entityType: file.entityType, name: file.name })
  expect(wf.status, JSON.stringify(wf.body)).toBe(201)
  const v = await admin.post(`${API}/approval/workflows/${wf.body.data.id}/versions`, {
    definition: file.definition,
    activate: true,
  })
  expect(v.status, JSON.stringify(v.body)).toBe(201)
}

/** Attach a signed copy (PDF) to the agreement, as the files card does. */
export async function attachPdf(platform: PlatformApp, client: TestClient, id: string, name = 'signed.pdf', type = 'application/pdf') {
  const form = new FormData()
  form.append('file', new File([PDF], name, { type }))
  form.append('entityType', 'agreement')
  form.append('entityId', id)
  const headers: Record<string, string> = { origin: TEST_ORIGIN }
  if (client.cookies.size) headers.cookie = [...client.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  if (client.csrfToken) headers['x-csrf-token'] = client.csrfToken
  return platform.app.request(`${API}/files`, { method: 'POST', headers, body: form })
}

/** Approve the agreement's open request as `client`. */
export async function approve(client: TestClient, agreementId: string, decision: 'approve' | 'return' | 'reject' = 'approve') {
  const inbox = await client.get(`${API}/approval/inbox`)
  const item = inbox.body.data.find((i: any) => i.entityId === agreementId)
  expect(item, 'in the inbox').toBeTruthy()
  const res = await client.post(`${API}/approval/requests/${item.requestId}/${decision}`, { comment: 'checked' })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
}
