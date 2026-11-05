/**
 * Dokumentforslag på leverandørfakturaen. REN funktion.
 *
 * incoming_invoices.raw_text er IKKE altid læst dokumenttekst:
 *  - mail uden vedhæftning eller med ulæselig vedhæftning: mailens brødtekst (lib/services/incoming-invoices.ts)
 *  - API-ingest: JSON eller leverandørens feed (source = 'manual')
 * Kun tekst fra en uploadet fil eller en læst vedhæftning må kaldes "teksten". Kan det ikke afgøres, gives intet forslag.
 * Selve teksten forlader aldrig serveren; kun denne korte note gør.
 */
import { suggestDocumentAction } from '@/lib/documents/document-suggestion'

export type InvoiceTextOrigin = 'extracted' | 'none' | 'not_document' | 'unknown'

export interface InvoiceTextOriginInput {
  source: string | null
  rawText: string | null
  /** Kildemailens tekst. undefined = ikke læst (fejl, ingen adgang eller ingen kildemail). */
  email?: { bodyText: string | null; bodyPreview: string | null }
}

export function invoiceTextOrigin(input: InvoiceTextOriginInput): InvoiceTextOrigin {
  const text = (input.rawText ?? '').trim()
  if (!text) return 'none'
  if (input.source === 'upload') return 'extracted'
  if (input.source !== 'email') return 'not_document'
  if (!input.email) return 'unknown'
  const body = (input.email.bodyText ?? '').trim()
  const preview = (input.email.bodyPreview ?? '').trim()
  return text === body || text === preview ? 'not_document' : 'extracted'
}

export function invoiceDocumentNote(rawText: string | null, origin: InvoiceTextOrigin): string {
  if (origin === 'extracted') {
    const suggestion = suggestDocumentAction({ extractedText: rawText })
    return `${suggestion.statement} ${suggestion.suggestedAction}`
  }
  if (origin === 'none') return 'Fakturateksten findes ikke. Filnavnet bruges ikke, som om filen var læst.'
  if (origin === 'not_document') return 'Fakturaen har ingen læst dokumenttekst, kun mail- eller API-data. Der er intet dokumentforslag.'
  return 'Det kunne ikke afgøres, om teksten kommer fra dokumentet. Der er intet dokumentforslag.'
}
