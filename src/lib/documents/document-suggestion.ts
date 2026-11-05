/**
 * Forslag ud fra et dokument. Filen læses ikke her.
 * extractedText må kun sættes, når kalderen faktisk har teksten.
 * Et filnavn alene bliver aldrig til "filen er læst".
 */
import { classifyDocumentLabel, type DocumentKind } from './classify-label'

export interface DocumentCandidate {
  id: string
  label: string
}

export interface DocumentSuggestionInput {
  filename?: string | null
  subject?: string | null
  extractedText?: string | null
  customers?: DocumentCandidate[]
  cases?: DocumentCandidate[]
}

export interface DocumentSuggestion {
  kind: DocumentKind
  /** Sand kun når extractedText er ikke-tom. */
  readFile: boolean
  basis: 'none' | 'filename' | 'subject' | 'text'
  statement: string
  customerId: string | null
  caseId: string | null
  suggestedAction: string
}

const ACTION: Record<DocumentKind, string> = {
  power_of_attorney: 'Foreslået: knyt dokumentet til sagen i det eksisterende dokumentflow. Der oprettes ingen fuldmagt her.',
  supplier_quote: 'Foreslået: læg det på sagen som leverandørtilbud. Der afgives ingen ordre.',
  invoice: 'Foreslået: læg det i fakturakontrollen. Der godkendes og bogføres ikke.',
  datasheet: 'Foreslået: gem det på sagen som datablad.',
  inspection_report: 'Foreslået: knyt det til besigtigelsen på sagen.',
  unknown: 'Ingen type er genkendt. Vælg typen selv.',
}

function one(list: DocumentCandidate[] | undefined): string | null {
  if (!list || list.length !== 1) return null
  return list[0].id
}

export function suggestDocumentAction(input: DocumentSuggestionInput): DocumentSuggestion {
  const text = input.extractedText?.trim() ?? ''
  const readFile = text.length > 0
  const fromName = classifyDocumentLabel({ filename: input.filename, subject: null })
  const fromSubject = classifyDocumentLabel({ filename: null, subject: input.subject })
  const fromText = readFile ? classifyDocumentLabel({ filename: null, subject: text.slice(0, 2000) }) : null
  const picked = fromName.kind !== 'unknown'
    ? fromName
    : fromSubject.kind !== 'unknown'
      ? fromSubject
      : fromText && fromText.kind !== 'unknown'
        ? fromText
        : fromName
  const basis: DocumentSuggestion['basis'] = fromName.kind !== 'unknown'
    ? 'filename'
    : fromSubject.kind !== 'unknown'
      ? 'subject'
      : fromText && fromText.kind !== 'unknown'
        ? 'text'
        : (input.filename?.trim() || input.subject?.trim() || readFile)
          ? (input.filename?.trim() ? 'filename' : input.subject?.trim() ? 'subject' : 'text')
          : 'none'
  // "Teksten er brugt" kun når typen faktisk kom fra teksten — ellers byggede forslaget på filnavn/emne
  // Teksten klassificeres via emne-feltet, så årsagen hedder "emne ..." — her er det teksten, der er læst
  const statement = basis === 'text' && readFile
    ? (picked.kind === 'unknown' ? 'Teksten er brugt, men gav ingen kendt dokumenttype.' : `Teksten er brugt: ${picked.reason.replace(/^emne /, '')}.`)
    : readFile
      ? `Forslaget bygger på filnavn eller emne; teksten gav ingen type. ${picked.reason}.`
      : `Filen er ikke læst. Forslaget bygger kun på filnavn eller emne. ${picked.reason}.`
  return {
    kind: picked.kind,
    readFile,
    basis,
    statement,
    customerId: one(input.customers),
    caseId: one(input.cases),
    suggestedAction: ACTION[picked.kind],
  }
}
