import { readFileSync } from 'node:fs'
import PDFDocument from 'pdfkit'

/**
 * PDF forms drawn on the API (plan 6): the paper layouts of `3. Format form HRM.xlsx` as a list of blocks. Noto Sans
 * Lao has no Latin letters, digits, `-` or `/`, so every string is drawn in runs: Lao in Noto Sans Lao, the rest in
 * Noto Sans.
 */

export const DRAFT = 'ຮ່າງ / DRAFT'
export const CANCELLED = 'ຍົກເລີກ / CANCELLED'

export interface Column {
  header: string
  width: number
  align?: 'left' | 'right' | 'center'
}

export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'fields'; rows: [label: string, value: string][] }
  | { kind: 'checks'; label: string; options: { text: string; checked: boolean }[] }
  /** `size`: the font size of the table, default 10 (the members table of forms 1–4 needs 8 to fit its columns). */
  | { kind: 'table'; columns: Column[]; rows: string[][]; footer?: string[][]; size?: number }
  | { kind: 'signatures'; boxes: { role: string; name: string; date: string }[] }
  | { kind: 'note'; text: string }

export interface PrintModel {
  title: string
  /** Printed in red top left: `DRAFT` before approval, `CANCELLED` once cancelled; none when approved. */
  mark: string | null
  /** `dd/mm/yyyy`, printed top right. */
  date: string
  blocks: Block[]
}

export interface Run {
  lao: boolean
  text: string
}

const isLao = (ch: string) => {
  const cp = ch.codePointAt(0)!
  return cp >= 0x0e80 && cp <= 0x0eff
}
const isSpace = (ch: string) => /\s/.test(ch)

/**
 * `text` cut into runs of one script. A space between letters of one script stays in their run; a space where the
 * script changes, or with no letter around it, is Latin.
 */
export function scriptRuns(text: string): Run[] {
  const chars = [...text]
  const runs: Run[] = []
  const nextScript = (from: number): boolean | null => {
    for (let j = from; j < chars.length; j++) if (!isSpace(chars[j]!)) return isLao(chars[j]!)
    return null
  }
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!
    const last = runs[runs.length - 1]
    let lao: boolean
    if (isSpace(ch)) {
      const next = nextScript(i + 1)
      // Inside one script it stays there; between two it goes to the Latin side (both fonts have a space).
      lao = last ? (next === null || next === last.lao ? last.lao : false) : false
    } else lao = isLao(ch)
    if (last && last.lao === lao) last.text += ch
    else runs.push({ lao, text: ch })
  }
  return runs
}

const FONT_FILES = {
  lao: 'NotoSansLao-Regular.ttf',
  laoBold: 'NotoSansLao-Bold.ttf',
  latin: 'NotoSans-Regular.ttf',
  latinBold: 'NotoSans-Bold.ttf',
} as const
let fonts: Record<keyof typeof FONT_FILES, Buffer> | null = null
const loadFonts = () =>
  (fonts ??= Object.fromEntries(
    Object.entries(FONT_FILES).map(([k, f]) => [k, readFileSync(new URL(`./fonts/${f}`, import.meta.url))]),
  ) as Record<keyof typeof FONT_FILES, Buffer>)

const PAGE = { margin: 40, width: 595.28, height: 841.89 }
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin
/** The lowest y content may reach; the page number sits below it. */
const BOTTOM = PAGE.height - PAGE.margin - 14
const SIZE = 10
const LINE = SIZE * 1.6
const PAD = 4

type Doc = PDFKit.PDFDocument
interface TextOptions {
  width: number
  align?: 'left' | 'right' | 'center'
  bold?: boolean
  size?: number
}

const fontOf = (run: Run, bold: boolean) => (run.lao ? (bold ? 'laoBold' : 'lao') : bold ? 'latinBold' : 'latin')

/** Lao vowel and tone marks drawn on the letter before them: a line never breaks before one. */
const isMark = (ch: string) => {
  const cp = ch.codePointAt(0)!
  return cp === 0x0eb1 || (cp >= 0x0eb4 && cp <= 0x0ebc) || (cp >= 0x0ec8 && cp <= 0x0ece)
}

interface Piece {
  text: string
  font: string
  width: number
}
type Line = Piece[]

const lineWidth = (line: Line) => line.reduce((w, p) => w + p.width, 0)

/**
 * `text` wrapped at `width`: words (split at spaces) go on a line while they fit; a word wider than a line (Lao
 * writes phrases without spaces) is cut between letters, never before a mark. `\n` starts a new line.
 */
function layout(doc: Doc, text: string, width: number, bold: boolean, size: number): Line[] {
  doc.fontSize(size)
  const measure = (t: string, font: string) => doc.font(font).widthOfString(t)
  const lines: Line[] = []
  for (const paragraph of text.split('\n')) {
    let line: Line = []
    let used = 0
    const push = (piece: Piece) => {
      const last = line[line.length - 1]
      if (last && last.font === piece.font) {
        last.text += piece.text
        last.width += piece.width
      } else line.push({ ...piece })
      used += piece.width
    }
    const breakLine = () => {
      // A space that ended the line is not drawn at the start of the next.
      const last = line[line.length - 1]
      if (last && /\s$/.test(last.text)) {
        const trimmed = last.text.replace(/\s+$/, '')
        last.width = measure(trimmed, last.font)
        last.text = trimmed
      }
      lines.push(line)
      line = []
      used = 0
    }
    // Words with the space after them, each cut into its script runs.
    for (const word of paragraph.match(/\S+\s*|\s+/g) ?? []) {
      const pieces = scriptRuns(word).map((r) => {
        const font = fontOf(r, bold)
        return { text: r.text, font, width: measure(r.text, font) }
      })
      const w = pieces.reduce((n, p) => n + p.width, 0)
      const bare = w - (/\s$/.test(word) ? measure(word.match(/\s+$/)![0], pieces[pieces.length - 1]!.font) : 0)
      if (used > 0 && used + bare > width) breakLine()
      if (bare <= width) {
        pieces.forEach(push)
        continue
      }
      // Too wide for any line: letter by letter, marks kept with their letter.
      for (const p of pieces) {
        const chars = [...p.text]
        let cluster = ''
        const flush = () => {
          if (!cluster) return
          const cw = measure(cluster, p.font)
          if (used > 0 && used + cw > width) breakLine()
          push({ text: cluster, font: p.font, width: cw })
          cluster = ''
        }
        for (const ch of chars) {
          if (!isMark(ch)) flush()
          cluster += ch
        }
        flush()
      }
    }
    breakLine()
  }
  return lines
}

const lineHeightOf = (size: number) => size * 1.6

/** Height `text` takes wrapped at `width`. */
function heightOf(doc: Doc, text: string, o: TextOptions): number {
  const size = o.size ?? SIZE
  return layout(doc, text, o.width, !!o.bold, size).length * lineHeightOf(size)
}

/** Width of `text` on one line. */
function widthOf(doc: Doc, text: string, bold: boolean, size: number): number {
  return layout(doc, text, Number.POSITIVE_INFINITY, bold, size).reduce((w, l) => Math.max(w, lineWidth(l)), 0)
}

/** `text` at (x, y), wrapped at `width`, each script in its font; returns the height drawn. */
function draw(doc: Doc, text: string, x: number, y: number, o: TextOptions): number {
  const size = o.size ?? SIZE
  const lines = layout(doc, text, o.width, !!o.bold, size)
  lines.forEach((line, i) => {
    const free = o.width - lineWidth(line)
    let at = x + (o.align === 'right' ? free : o.align === 'center' ? free / 2 : 0)
    const top = y + i * lineHeightOf(size) + size * 0.25
    for (const piece of line) {
      doc.font(piece.font).fontSize(size).text(piece.text, at, top, { lineBreak: false })
      at += piece.width
    }
  })
  return lines.length * lineHeightOf(size)
}

/** Moves to a new page when `height` does not fit below `y`; returns the y to draw at. */
function room(doc: Doc, y: number, height: number): number {
  if (y + height <= BOTTOM) return y
  doc.addPage()
  return PAGE.margin
}

function drawTitle(doc: Doc, text: string, y: number): number {
  y = room(doc, y, 30)
  draw(doc, text, PAGE.margin, y, { width: CONTENT_WIDTH, align: 'center', bold: true, size: 14 })
  return y + heightOf(doc, text, { width: CONTENT_WIDTH, bold: true, size: 14 }) + 6
}

function drawFields(doc: Doc, rows: [string, string][], y: number): number {
  const labelWidth = 200
  const valueWidth = CONTENT_WIDTH - labelWidth
  for (const [label, value] of rows) {
    const h = Math.max(
      heightOf(doc, label, { width: labelWidth - PAD, bold: true }),
      heightOf(doc, value, { width: valueWidth }),
    )
    y = room(doc, y, h)
    draw(doc, label, PAGE.margin, y, { width: labelWidth - PAD, bold: true })
    draw(doc, value, PAGE.margin + labelWidth, y, { width: valueWidth })
    y += h + 2
  }
  return y + 4
}

function drawChecks(doc: Doc, label: string, options: { text: string; checked: boolean }[], y: number): number {
  y = room(doc, y, LINE * 2)
  draw(doc, label, PAGE.margin, y, { width: CONTENT_WIDTH, bold: true })
  y += heightOf(doc, label, { width: CONTENT_WIDTH, bold: true })
  let x = PAGE.margin
  const box = 9
  for (const o of options) {
    const w = widthOf(doc, o.text, false, SIZE) + box + 18
    if (x + w > PAGE.margin + CONTENT_WIDTH && x > PAGE.margin) {
      x = PAGE.margin
      y += LINE
    }
    y = room(doc, y, LINE)
    const top = y + (LINE - box) / 2 - 1
    doc.lineWidth(0.8).rect(x, top, box, box).stroke()
    if (o.checked) {
      doc
        .moveTo(x + 1.5, top + 1.5)
        .lineTo(x + box - 1.5, top + box - 1.5)
        .moveTo(x + box - 1.5, top + 1.5)
        .lineTo(x + 1.5, top + box - 1.5)
        .stroke()
    }
    draw(doc, o.text, x + box + 4, y, { width: w - box - 4 })
    x += w
  }
  return y + LINE + 6
}

type TableBlock = Extract<Block, { kind: 'table' }>

/** Column widths of a table, scaled down to the page when they add up to more. */
function widthsOf(columns: Column[]): number[] {
  const total = columns.reduce((s, c) => s + c.width, 0)
  const scale = total > CONTENT_WIDTH ? CONTENT_WIDTH / total : 1
  return columns.map((c) => c.width * scale)
}

/** The number of lines each body cell of `table` takes, row by row (for tests of a layout's column widths). */
export function cellLineCounts(table: TableBlock): number[][] {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, autoFirstPage: false })
  for (const [name, data] of Object.entries(loadFonts())) doc.registerFont(name, data)
  const widths = widthsOf(table.columns)
  const size = table.size ?? SIZE
  return table.rows.map((r) => r.map((cell, i) => layout(doc, cell, widths[i]! - 2 * PAD, false, size).length))
}

function drawTable(doc: Doc, table: TableBlock, y: number): number {
  const { columns, rows } = table
  const footer = table.footer ?? []
  const size = table.size ?? SIZE
  const widths = widthsOf(columns)
  const rowHeight = (cells: string[], bold: boolean) =>
    Math.max(...cells.map((cell, i) => heightOf(doc, cell, { width: widths[i]! - 2 * PAD, bold, size }))) + 2 * PAD
  const drawRow = (cells: string[], top: number, h: number, bold: boolean, fill: boolean) => {
    let x = PAGE.margin
    cells.forEach((cell, i) => {
      if (fill) doc.save().rect(x, top, widths[i]!, h).fill('#eeeeee').restore()
      doc.lineWidth(0.6).rect(x, top, widths[i]!, h).stroke()
      draw(doc, cell, x + PAD, top + PAD, { width: widths[i]! - 2 * PAD, align: columns[i]!.align, bold, size })
      x += widths[i]!
    })
  }
  const headers = columns.map((c) => c.header)
  const headerHeight = rowHeight(headers, true)
  y = room(doc, y, headerHeight + LINE + 2 * PAD)
  drawRow(headers, y, headerHeight, true, true)
  y += headerHeight
  for (const [cells, bold] of [...rows.map((r) => [r, false] as const), ...footer.map((r) => [r, true] as const)]) {
    const h = rowHeight(cells, bold)
    if (y + h > BOTTOM) {
      doc.addPage()
      y = PAGE.margin
      drawRow(headers, y, headerHeight, true, true)
      y += headerHeight
    }
    drawRow(cells, y, h, bold, false)
    y += h
  }
  return y + 10
}

function drawSignatures(
  doc: Doc,
  boxes: { role: string; name: string; date: string }[],
  y: number,
  onRow?: (page: number) => void,
): number {
  const perRow = Math.min(3, Math.max(1, boxes.length))
  const width = CONTENT_WIDTH / perRow
  const height = LINE * 2 + 40 + LINE * 2
  // The whole block moves to the next page when it does not fit: the boxes are signed together.
  y = room(doc, y, Math.ceil(boxes.length / perRow) * (height + 6))
  for (let i = 0; i < boxes.length; i += perRow) {
    const row = boxes.slice(i, i + perRow)
    onRow?.(doc.bufferedPageRange().count - 1)
    row.forEach((b, k) => {
      const x = PAGE.margin + k * width
      draw(doc, b.role, x, y, { width: width - PAD, align: 'center', bold: true })
      draw(doc, b.name || ' ', x, y + LINE * 2 + 40, { width: width - PAD, align: 'center' })
      draw(doc, `ວັນທີ (Date): ${b.date || '____/____/________'}`, x, y + LINE * 3 + 40, {
        width: width - PAD,
        align: 'center',
      })
    })
    y += height + 6
  }
  return y
}

function drawNote(doc: Doc, text: string, y: number): number {
  const h = heightOf(doc, text, { width: CONTENT_WIDTH })
  y = room(doc, y, h)
  draw(doc, text, PAGE.margin, y, { width: CONTENT_WIDTH })
  return y + h + 6
}

/** The model as an A4 PDF file. `onSignatureRow` hears the page of each row of signature boxes (for tests). */
export function renderPdf(model: PrintModel, trace: { onSignatureRow?: (page: number) => void } = {}): Promise<Uint8Array> {
  const f = loadFonts()
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true, info: { Title: model.title } })
  for (const [name, data] of Object.entries(f)) doc.registerFont(name, data)
  const chunks: Buffer[] = []
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on('error', reject)
  })

  let y = PAGE.margin
  if (model.mark) {
    doc.save().fillColor('#b91c1c')
    draw(doc, model.mark, PAGE.margin, y, { width: CONTENT_WIDTH / 2, bold: true })
    doc.restore()
  }
  draw(doc, `ວັນທີ (Date): ${model.date}`, PAGE.margin + CONTENT_WIDTH / 2, y, {
    width: CONTENT_WIDTH / 2,
    align: 'right',
  })
  y += LINE + 4
  y = drawTitle(doc, model.title, y)
  for (const b of model.blocks) {
    if (b.kind === 'title') y = drawTitle(doc, b.text, y)
    else if (b.kind === 'fields') y = drawFields(doc, b.rows, y)
    else if (b.kind === 'checks') y = drawChecks(doc, b.label, b.options, y)
    else if (b.kind === 'table') y = drawTable(doc, b, y)
    else if (b.kind === 'signatures') y = drawSignatures(doc, b.boxes, y, trace.onSignatureRow)
    else y = drawNote(doc, b.text, y)
  }

  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Below the bottom margin: lift it so pdfkit does not start a new page for the footer.
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    draw(doc, `${i + 1} / ${range.count}`, PAGE.margin, PAGE.height - PAGE.margin + 4, {
      width: CONTENT_WIDTH,
      align: 'center',
      size: 8,
    })
    doc.page.margins.bottom = bottom
  }
  doc.end()
  return done
}

/** The headers of a PDF download: an attachment, never cached. */
export function pdfHeaders(pdf: Uint8Array, fileName: string): Record<string, string> {
  return {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
    'content-length': String(pdf.byteLength),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  }
}
