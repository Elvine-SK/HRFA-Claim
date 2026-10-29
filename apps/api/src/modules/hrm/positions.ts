import { source, sql } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

export interface HrmPositionOption {
  code: string
  name: string
  postType: number | null
}

const positions = () =>
  source('hrm')
    .selectFrom('hrmPosition')
    .select(['postid', 'postname', 'posttype'])
    .where('poststatus', '=', 'Y')

const toOption = (row: { postid: number; postname: string | null; posttype: number | null }): HrmPositionOption => ({
  code: String(row.postid),
  name: row.postname ?? String(row.postid),
  postType: row.posttype,
})

/** Active HRM positions whose name starts with `q` (Lao or English), at most 20: the "ວ່າການ" picker (spec §5). */
export async function searchPositions(q: string): Promise<HrmPositionOption[]> {
  const like = `${q.replace(/[\%_]/g, (ch) => `\${ch}`)}%`
  const rows = await positions()
    .where((eb) => eb.or([eb('postname', 'like', like), eb('postnameeng', 'like', like)]))
    .orderBy(sql`PostOrderBy`)
    .orderBy('postid')
    .limit(20)
    .execute()
  return rows.map(toOption)
}

export async function findPosition(code: string): Promise<HrmPositionOption | null> {
  if (!/^\d{1,9}$/.test(code)) return null
  const row = await positions().where('postid', '=', Number(code)).executeTakeFirst()
  return row ? toOption(row) : null
}
