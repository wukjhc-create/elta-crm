/**
 * Klassificér et dokument ud fra filnavn eller emne. REN funktion.
 *
 * Gætter aldrig indhold. Et ukendt navn forbliver `unknown` — der opfindes ingen
 * fuldmagt, faktura eller datablad, fordi filen "ligner" noget.
 */
export type DocumentKind =
  | 'power_of_attorney'
  | 'supplier_quote'
  | 'invoice'
  | 'datasheet'
  | 'inspection_report'
  | 'unknown'

const RULES: Array<{ kind: Exclude<DocumentKind, 'unknown'>; re: RegExp; reason: string }> = [
  { kind: 'power_of_attorney', re: /fuldmagt|power\s*of\s*attorney|\bpoa\b/i, reason: 'indeholder fuldmagt' },
  { kind: 'inspection_report', re: /besigtigelses|besigtigelse|inspektionsrapport|inspection report/i, reason: 'indeholder besigtigelse' },
  { kind: 'datasheet', re: /datablad|datasheet|data sheet/i, reason: 'indeholder datablad' },
  { kind: 'invoice', re: /kreditnota|(^|[^a-z0-9æøå])faktura(?![a-z0-9æøå])|(^|[^a-z0-9æøå])invoice(?![a-z0-9æøå])/i, reason: 'indeholder faktura' },
  { kind: 'supplier_quote', re: /(^|[^a-z0-9æøå])(leverandørtilbud|tilbud|quote)(?![a-z0-9æøå])/i, reason: 'indeholder tilbud' },
]

export function classifyDocumentLabel(input: { filename?: string | null; subject?: string | null }): { kind: DocumentKind; reason: string } {
  const filename = (input.filename ?? '').trim()
  const subject = (input.subject ?? '').trim()
  for (const rule of RULES) {
    if (filename && rule.re.test(filename)) return { kind: rule.kind, reason: `filnavn ${rule.reason}` }
  }
  for (const rule of RULES) {
    if (subject && rule.re.test(subject)) return { kind: rule.kind, reason: `emne ${rule.reason}` }
  }
  if (!filename && !subject) return { kind: 'unknown', reason: 'intet filnavn eller emne at klassificere ud fra' }
  return { kind: 'unknown', reason: 'ingen kendt dokumenttype i filnavn eller emne' }
}
