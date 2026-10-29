import ExcelJS from 'exceljs'
import type { UploadLine } from './posting.ts'

/** Writes the lines of a batch as a file for CORE (spec §11); another layout, or direct posting, replaces it here. */
export interface UploadWriter {
  contentType: string
  extension: string
  write(lines: UploadLine[]): Promise<Uint8Array>
}

const HEADER = ['ACCOUNT', 'BRANCH', 'NAME', 'CCY', 'CHEQUE_NO', 'AMT', 'RVS_NO', 'DR_CR', 'REMARK']
const WIDTHS = [26, 9, 30, 6, 11, 18, 9, 7, 80]
const AMT_COLUMN = 6

/**
 * The FA-M `Upload file` sheet: a header row, then one row per line. `AMT` is a number cell shown as
 * `1,000,000.00`; every other cell is text, so account numbers keep their leading zeros. An amount has at most 15
 * significant digits (13 whole, 2 decimals), which a spreadsheet number holds exactly to the cent.
 */
export const xlsxWriter: UploadWriter = {
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  extension: 'xlsx',
  async write(lines) {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('Upload file')
    sheet.columns = HEADER.map((header, i) => ({ header, width: WIDTHS[i] }))
    sheet.getRow(1).font = { bold: true }
    for (const l of lines) {
      const row = sheet.addRow([l.account, l.branch, l.name, l.ccy, l.chequeNo, Number(l.amount), l.rvsNo, l.side, l.remark])
      row.getCell(AMT_COLUMN).numFmt = '#,##0.00'
    }
    return new Uint8Array(await book.xlsx.writeBuffer())
  },
}
