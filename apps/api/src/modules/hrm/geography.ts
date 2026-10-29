import { source } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

/** HRM's `COUNTRY_CODE` for Laos in `hrm_province` (the only value on the testing server, 2026-10-29). */
export const HRM_LAO_COUNTRY_CODE = 'LA'

export interface Place {
  code: string
  nameLo: string
  nameEn: string | null
}

const provinces = () =>
  source('hrm')
    .selectFrom('hrmProvince')
    .select(['provinceCode as code', 'provinceLa as nameLo', 'province as nameEn'])
    .where('countryCode', '=', HRM_LAO_COUNTRY_CODE)

const toPlace = (row: { code: string; nameLo: string | null; nameEn: string | null }): Place => ({
  code: row.code,
  nameLo: row.nameLo ?? row.code,
  nameEn: row.nameEn,
})

/** The provinces of Laos (spec §5), by code. */
export async function listProvinces(): Promise<Place[]> {
  return (await provinces().orderBy('provinceCode').execute()).map(toPlace)
}

export async function findProvince(code: string): Promise<Place | null> {
  const row = await provinces().where('provinceCode', '=', code).executeTakeFirst()
  return row ? toPlace(row) : null
}

const districts = (provinceCode: string) =>
  source('hrm')
    .selectFrom('hrmDistrict')
    .select(['districtCode as code', 'nameLa as nameLo', 'nameEn'])
    .where('provinceCode', '=', provinceCode)

export async function listDistricts(provinceCode: string): Promise<Place[]> {
  return (await districts(provinceCode).orderBy('districtCode').execute()).map(toPlace)
}

export async function findDistrict(provinceCode: string, districtCode: string): Promise<Place | null> {
  const row = await districts(provinceCode).where('districtCode', '=', districtCode).executeTakeFirst()
  return row ? toPlace(row) : null
}
