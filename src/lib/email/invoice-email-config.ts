/**
 * Sprint Ø3.7 — Redigerbare faktura-/rykkertekster + afsenderidentitet.
 *
 * Isomorft (ingen server-only imports): bruges af både send-services
 * (server) og settings-UI/preview (klient). Gemmes som JSONB i
 * company_settings.invoice_email_config. Tomme felter → fallback til
 * DEFAULT_INVOICE_EMAIL_CONFIG, så mails ALDRIG bliver usendbare.
 *
 * Kun kundevendt/sikker data — ingen kost/margin/DB.
 */

export type InvoiceTemplateKey = 'invoice' | 'reminder1' | 'reminder2' | 'reminder3'

export interface InvoiceEmailTemplate {
  subject?: string
  body?: string
}

export interface InvoiceEmailConfig {
  sender_name?: string
  reply_to?: string
  invoice?: InvoiceEmailTemplate
  reminder1?: InvoiceEmailTemplate
  reminder2?: InvoiceEmailTemplate
  reminder3?: InvoiceEmailTemplate
}

/** Sikre, kundevendte variabler. Ingen interne/kost-felter. */
export const TEMPLATE_VARIABLES: Array<{ token: string; label: string }> = [
  { token: 'customer_name', label: 'Kundens navn' },
  { token: 'invoice_number', label: 'Fakturanummer' },
  { token: 'amount', label: 'Beløb inkl. moms' },
  { token: 'due_date', label: 'Forfaldsdato' },
  { token: 'days_overdue', label: 'Dage over forfald' },
  { token: 'payment_reference', label: 'Betalingsreference' },
  { token: 'case_number', label: 'Sagsnummer' },
  { token: 'company_name', label: 'Firmanavn' },
  { token: 'company_email', label: 'Firma-email' },
  { token: 'company_phone', label: 'Firmatelefon' },
]

export type TemplateVars = Partial<Record<string, string | number | null | undefined>>

const KNOWN_TOKENS = new Set(TEMPLATE_VARIABLES.map((v) => v.token))

/**
 * Sikker variabel-interpolation. Erstatter {{ token }} med værdi for
 * KENDTE tokens; ukendte eller tomme tokens fjernes helt — der sendes
 * ALDRIG rå {{variable}} videre til kunden.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  if (!text) return ''
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, token: string) => {
    if (!KNOWN_TOKENS.has(token)) return ''
    const v = vars[token]
    return v === null || v === undefined ? '' : String(v)
  })
}

interface DefaultTemplate {
  subject: string
  body: string
}

/** Standard-templates (fallback). Matcher den tidligere hardcodede tekst. */
export const DEFAULT_INVOICE_EMAIL_CONFIG: {
  sender_name: string
  reply_to: string
  invoice: DefaultTemplate
  reminder1: DefaultTemplate
  reminder2: DefaultTemplate
  reminder3: DefaultTemplate
} = {
  sender_name: '',
  reply_to: '',
  invoice: {
    subject: 'Faktura {{invoice_number}} fra {{company_name}}',
    body:
      'Vedhæftet finder du faktura for det udførte arbejde. Nedenfor ser du de vigtigste detaljer.\n\n' +
      'Anvend venligst betalingsreferencen, så vi automatisk kan registrere din indbetaling.',
  },
  reminder1: {
    subject: 'Påmindelse: Faktura {{invoice_number}} — {{company_name}}',
    body:
      'Vi har ikke registreret betaling af nedenstående faktura endnu. Måske er den blot blevet overset.\n\n' +
      'Skulle betalingen allerede være foretaget, kan du naturligvis se bort fra denne mail.',
  },
  reminder2: {
    subject: 'Anden påmindelse: Faktura {{invoice_number}} — {{company_name}}',
    body:
      'Vi har tidligere sendt en venlig påmindelse, men har stadig ikke modtaget betaling af nedenstående faktura.\n\n' +
      'Bedes du venligst betale snarest, eller kontakte os hvis der er noget vi skal være opmærksomme på.',
  },
  reminder3: {
    subject: 'Sidste varsel: Faktura {{invoice_number}} — {{company_name}}',
    body:
      'Fakturaen er nu mere end 20 dage forfalden og overgår til manuel behandling hos os.\n\n' +
      'Kontakt os omgående, så vi kan finde en løsning inden videre skridt.',
  },
}

/** Headline i farvebjælken pr. template (ikke redigerbar — strukturel). */
export const TEMPLATE_HEADLINES: Record<InvoiceTemplateKey, string> = {
  invoice: 'Tak for din ordre',
  reminder1: 'Venlig påmindelse om betaling',
  reminder2: 'Anden påmindelse — udestående betaling',
  reminder3: 'Sidste varsel — manuel behandling',
}

export const TEMPLATE_LABELS: Record<InvoiceTemplateKey, string> = {
  invoice: 'Faktura-mail',
  reminder1: 'Betalingspåmindelse — niveau 1 (venlig)',
  reminder2: 'Betalingspåmindelse — niveau 2 (fast)',
  reminder3: 'Betalingspåmindelse — niveau 3 (sidste varsel)',
}

/** Sikker parse af rå JSONB → config (ukendt input → tomt). */
export function parseInvoiceEmailConfig(raw: unknown): InvoiceEmailConfig {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const tmpl = (v: unknown): InvoiceEmailTemplate | undefined => {
    if (!v || typeof v !== 'object') return undefined
    const o = v as Record<string, unknown>
    return {
      subject: typeof o.subject === 'string' ? o.subject : undefined,
      body: typeof o.body === 'string' ? o.body : undefined,
    }
  }
  return {
    sender_name: typeof r.sender_name === 'string' ? r.sender_name : undefined,
    reply_to: typeof r.reply_to === 'string' ? r.reply_to : undefined,
    invoice: tmpl(r.invoice),
    reminder1: tmpl(r.reminder1),
    reminder2: tmpl(r.reminder2),
    reminder3: tmpl(r.reminder3),
  }
}

/**
 * Resolver subject+body for en template-nøgle: brug brugerens override
 * hvis udfyldt, ellers standard. Interpolér variabler sikkert.
 */
export function resolveTemplate(
  cfg: InvoiceEmailConfig | null | undefined,
  key: InvoiceTemplateKey,
  vars: TemplateVars
): { subject: string; body: string } {
  const def = DEFAULT_INVOICE_EMAIL_CONFIG[key]
  const override = cfg?.[key]
  const rawSubject = override?.subject?.trim() ? override.subject.trim() : def.subject
  const rawBody = override?.body?.trim() ? override.body.trim() : def.body
  return {
    subject: renderTemplate(rawSubject, vars),
    body: renderTemplate(rawBody, vars),
  }
}

/** Realistiske eksempel-variabler til preview (sender ALDRIG mail). */
export function buildSampleVars(): TemplateVars {
  return {
    customer_name: 'Jens Hansen',
    invoice_number: 'FAK-2026-0042',
    amount: '24.500,00 kr.',
    due_date: '27. juni 2026',
    days_overdue: 8,
    payment_reference: '0042',
    case_number: 'SAG-1043',
    company_name: 'Elta Solar ApS',
    company_email: 'kontakt@eltasolar.dk',
    company_phone: '+45 70 70 70 70',
  }
}
