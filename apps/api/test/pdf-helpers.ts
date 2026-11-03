/** Pages of a pdfkit file: its page objects are plain dictionaries (no object streams). */
export function pageCount(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length
}
