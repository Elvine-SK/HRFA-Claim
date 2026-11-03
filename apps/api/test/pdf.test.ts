import { describe, expect, it } from 'vitest'
import { renderPdf, scriptRuns, type PrintModel } from '../src/modules/print/pdf.ts'
import { pageCount } from './pdf-helpers.ts'

describe('script runs', () => {
  it('splits Lao from Latin, digits and punctuation', () => {
    expect(scriptRuns('ນາງ ສົມໃຈ - 0001.BCEL (LAK)')).toEqual([
      { lao: true, text: 'ນາງ ສົມໃຈ' },
      { lao: false, text: ' - 0001.BCEL (LAK)' },
    ])
    expect(scriptRuns('ເງິນແຮ/ADV').map((r) => r.text).join('')).toBe('ເງິນແຮ/ADV')
    expect(scriptRuns('Mr. A ສົມ')).toEqual([
      { lao: false, text: 'Mr. A ' },
      { lao: true, text: 'ສົມ' },
    ])
    expect(scriptRuns('')).toEqual([])
    expect(scriptRuns('  ')).toEqual([{ lao: false, text: '  ' }])
  })
})

describe('PDF renderer', () => {
  it('renders a PDF over several pages', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => [String(i + 1), 'ຄ່າເດີນທາງ '.repeat(20), '1,000.00'])
    const model: PrintModel = {
      title: 'ໃບສະຫຼຸບເງິນແຮເດີນທາງ',
      mark: 'ຮ່າງ / DRAFT',
      date: '03/11/2026',
      blocks: [
        { kind: 'fields', rows: [['ເລກທີ (Doc No.):', '0001.ທຄຕລ.888010.2026']] },
        {
          kind: 'checks',
          label: 'ປະເພດການສົ່ງເງິນແຮ (Advance Status):',
          options: [
            { text: '1. ບໍ່ໄດ້ນຳໃຊ້ເງິນແຮ (Unused)', checked: false },
            { text: '2. ນຳໃຊ້ບາງສ່ວນ (Partly used)', checked: true },
          ],
        },
        {
          kind: 'table',
          columns: [
            { header: 'No.', width: 40 },
            { header: 'ລາຍການ', width: 360 },
            { header: 'Amount', width: 115, align: 'right' },
          ],
          rows,
          footer: [['', 'ລວມ (Total)', '60,000.00']],
        },
        { kind: 'note', text: 'ໝາຍເຫດ: late' },
        { kind: 'signatures', boxes: [{ role: 'ຜູ້ກວດສອບ', name: 'A', date: '03/11/2026' }] },
      ],
    }
    const pdf = await renderPdf(model)
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    expect(pageCount(pdf)).toBeGreaterThan(1)
  })

  it('keeps the five signature boxes of a settlement on one page', async () => {
    const boxes = Array.from({ length: 5 }, (_, i) => ({ role: `Role ${i}`, name: 'A', date: '03/11/2026' }))
    // Fill the page a little more each time, so some run leaves room for one row of boxes only.
    for (let n = 1; n <= 40; n++) {
      const pages: number[] = []
      await renderPdf(
        {
          title: 'T',
          mark: null,
          date: '03/11/2026',
          blocks: [
            { kind: 'table', columns: [{ header: 'No.', width: 515 }], rows: Array.from({ length: n }, (_, i) => [String(i)]) },
            { kind: 'signatures', boxes },
          ],
        },
        { onSignatureRow: (page) => pages.push(page) },
      )
      expect(new Set(pages).size, `${n} rows`).toBe(1)
    }
  })

  it('renders a one-page form', async () => {
    const pdf = await renderPdf({ title: 'T', mark: null, date: '01/01/2026', blocks: [{ kind: 'title', text: 'x' }] })
    expect(pageCount(pdf)).toBe(1)
  })
})
