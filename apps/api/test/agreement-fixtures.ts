import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { appDb } from '../src/shared/db.ts'

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
