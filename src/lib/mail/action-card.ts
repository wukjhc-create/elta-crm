/**
 * Intelligent handlingskort til en indgående mail. REN funktion.
 *
 * Kortet foreslår. Det opretter ikke kunde, sag, status, mail eller faktura.
 * Alle forslag har executed: false og requiresConfirmation: true.
 */
import { pickAddressCandidate } from '@/lib/services/incoming-invoice-matcher'
import { classifyDocumentLabel, type DocumentKind } from '@/lib/documents/classify-label'

export interface MailCustomerRef {
  id: string
  name: string
  customerNumber: string | null
  email: string | null
  address: string | null
  postalCode: string | null
  city: string | null
}

export interface MailCaseRef {
  id: string
  caseNumber: string | null
  title: string
  status: string
  customerId: string | null
  address: string | null
  postalCode: string | null
  city: string | null
}

export interface MailActionInput {
  subject: string | null
  bodyText: string | null
  bodyPreview: string | null
  bodyHtml: string | null
  senderEmail: string | null
  senderName: string | null
  attachmentNames: string[]
  linkedCustomerId: string | null
  linkedCaseId: string | null
  customers: MailCustomerRef[]
  /** `failed` = kundesøgningen kunne ikke læses. Så vælges ingen kunde, medmindre mailen allerede er koblet. */
  customerSearch: 'ok' | 'failed' | 'skipped'
  cases: MailCaseRef[]
  /** `unavailable` = sagerne kunne ikke læses. Så vælges ingen sag. */
  casesStatus: 'ok' | 'unavailable' | 'not_loaded'
}

export type MailIntent = 'power_of_attorney' | 'supplier_quote' | 'invoice' | 'inspection' | 'general'

export interface MailSuggestion {
  id: 'attach_mail' | 'save_attachment' | 'create_task' | 'add_note' | 'change_status' | 'create_case' | 'do_nothing' | 'choose_customer'
  label: string
  reason: string
  href: string | null
  requiresConfirmation: true
  executed: false
}

export interface MailActionCard {
  customer: MailCustomerRef | null
  customerStatus: 'linked' | 'unique' | 'ambiguous' | 'none'
  customerReason: string
  address: { street: string | null; postalCode: string | null; city: string | null } | null
  likelyCase: MailCaseRef | null
  caseStatus: 'likely' | 'ambiguous' | 'none' | 'unavailable'
  caseReason: string
  attachments: Array<{ filename: string; kind: DocumentKind; reason: string }>
  intent: MailIntent
  intentReason: string
  confidence: 'high' | 'medium' | 'low'
  suggestions: MailSuggestion[]
}

const OPEN = new Set(['closed', 'converted', 'cancelled'])

function fold(s: string): string {
  return s.toLocaleLowerCase('da').replace(/\s+/g, ' ').trim()
}

function plainText(input: MailActionInput): string {
  const html = (input.bodyHtml ?? '').replace(/<[^>]+>/g, '\n')
  return [input.subject, input.bodyText, input.bodyPreview, html].filter(Boolean).join('\n').slice(0, 20_000)
}

export function extractMailAddress(text: string): { street: string | null; postalCode: string | null; city: string | null } | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const slices: string[] = [...lines]
  const re = /([A-ZÆØÅa-zæøå][A-ZÆØÅa-zæøå.\-]*(?:\s+[A-ZÆØÅa-zæøå][A-ZÆØÅa-zæøå.\-]*)*\s+\d{1,4}[A-Za-z]?(?:,\s*[^,\n]{0,24})?\s+\d{4}\s+[A-ZÆØÅa-zæøå][\wæøåÆØÅ .\-]*)/g
  for (const line of lines) {
    for (const m of line.matchAll(re)) slices.push(m[1])
  }
  const hit = pickAddressCandidate(slices)
  if (!hit) return null
  const cityLine = slices.find((s) => s.includes(hit.zip))
  const city = cityLine?.match(new RegExp(`${hit.zip}\\s+([A-ZÆØÅa-zæøå][\\wæøåÆØÅ.\\- ]*)`))?.[1]?.trim() ?? null
  return { street: hit.streetToken, postalCode: hit.zip, city }
}

function addressMatches(address: { street: string | null; postalCode: string | null }, target: { address: string | null; postalCode: string | null }): boolean {
  if (!address.street || !address.postalCode || !target.postalCode) return false
  if (target.postalCode.trim() !== address.postalCode) return false
  return fold(target.address ?? '').includes(fold(address.street))
}

/** Navne der er værd at slå op. Kun eksplicitte udtryk — ikke et gæt ud af en signatur. */
export function mailNameCandidates(subject: string | null, senderName: string | null): string[] {
  const out: string[] = []
  const named = (subject ?? '').match(/\bfor\s+([A-ZÆØÅ][\p{L}'.-]+(?:\s+[A-ZÆØÅ][\p{L}'.-]+){0,3})/u)
  if (named?.[1] && named[1].length >= 5) out.push(named[1].trim())
  const sender = (senderName ?? '').trim()
  if (sender.length >= 5 && !/formsubmit|noreply|no-reply|mailer-daemon/i.test(sender)) out.push(sender)
  return [...new Set(out)].slice(0, 2)
}

function matchCustomer(input: MailActionInput, text: string): { status: MailActionCard['customerStatus']; customer: MailCustomerRef | null; reason: string } {
  if (input.customerSearch === 'failed' && !input.linkedCustomerId) {
    return { status: 'none', customer: null, reason: 'Kundesøgningen fejlede. Ingen kunde er valgt.' }
  }
  if (input.linkedCustomerId) {
    const linked = input.customers.find((c) => c.id === input.linkedCustomerId) ?? null
    return { status: 'linked', customer: linked, reason: 'Mailen er allerede koblet til kunden.' }
  }
  const sender = (input.senderEmail ?? '').trim().toLocaleLowerCase('da')
  if (sender) {
    const byMail = input.customers.filter((c) => (c.email ?? '').trim().toLocaleLowerCase('da') === sender)
    if (byMail.length === 1) return { status: 'unique', customer: byMail[0], reason: 'Afsenderens e-mail matcher kunden.' }
    if (byMail.length > 1) return { status: 'ambiguous', customer: null, reason: 'Afsenderens e-mail matcher flere kunder.' }
  }
  const byName = input.customers.filter((c) => c.name.trim().length >= 5 && fold(text).includes(fold(c.name)))
  const ids = [...new Set(byName.map((c) => c.id))]
  if (ids.length === 1) return { status: 'unique', customer: byName[0], reason: 'Navnet står i mailen og matcher én kunde.' }
  if (ids.length > 1) return { status: 'ambiguous', customer: null, reason: 'Navnet matcher flere kunder. Vælg en.' }
  return { status: 'none', customer: null, reason: 'Ingen kunde er matchet. Der oprettes ikke en kunde automatisk.' }
}

function rankCases(input: MailActionInput, text: string, customer: MailCustomerRef | null, address: MailActionCard['address']): { status: MailActionCard['caseStatus']; case: MailCaseRef | null; reason: string } {
  if (input.casesStatus === 'unavailable') return { status: 'unavailable', case: null, reason: 'Sagerne kunne ikke læses. Ingen sag er valgt.' }
  if (input.casesStatus === 'not_loaded') return { status: 'none', case: null, reason: 'Sagerne er ikke hentet endnu.' }
  const folded = fold(text)
  const scored = input.cases.map((c) => {
    let score = 0
    const reasons: string[] = []
    if (input.linkedCaseId && c.id === input.linkedCaseId) {
      score += 100
      reasons.push('mailen er allerede knyttet til sagen')
    }
    if (c.caseNumber && folded.includes(fold(c.caseNumber))) {
      score += 80
      reasons.push('sagsnummeret står i mailen')
    }
    if (customer && c.customerId === customer.id && !OPEN.has(c.status)) {
      score += 40
      reasons.push('åben sag på kunden')
    }
    if (address && addressMatches(address, c)) {
      score += 50
      reasons.push('adresse matcher sagen')
    }
    const tokens = c.title.split(/\s+/).filter((w) => w.length > 3)
    if (tokens.some((w) => folded.includes(fold(w)))) {
      score += 25
      reasons.push('sagstitlen ligner emnet')
    }
    if (OPEN.has(c.status)) score -= 40
    return { c, score, reasons }
  }).filter((s) => s.score >= 40).sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))

  if (!scored.length) return { status: 'none', case: null, reason: 'Ingen sag skiller sig ud.' }
  const [best, second] = scored
  if (!second || best.score - second.score >= 20) {
    return { status: 'likely', case: best.c, reason: best.reasons.join(', ') || 'sagen matcher kunden' }
  }
  return { status: 'ambiguous', case: null, reason: 'Flere sager matcher lige godt. Vælg en på mailen.' }
}

function intentOf(text: string, attachments: MailActionCard['attachments']): { intent: MailIntent; reason: string } {
  if (attachments.some((a) => a.kind === 'power_of_attorney') || /fuldmagt/i.test(text)) return { intent: 'power_of_attorney', reason: 'Mailen eller en vedhæftning nævner fuldmagt.' }
  if (attachments.some((a) => a.kind === 'inspection_report') || /besigtigelse/i.test(text)) return { intent: 'inspection', reason: 'Mailen eller en vedhæftning nævner besigtigelse.' }
  if (attachments.some((a) => a.kind === 'invoice') || /(^|[^a-z0-9æøå])faktura(?![a-z0-9æøå])/i.test(text)) return { intent: 'invoice', reason: 'Mailen eller en vedhæftning nævner faktura.' }
  if (attachments.some((a) => a.kind === 'supplier_quote') || /(^|[^a-z0-9æøå])tilbud(?![a-z0-9æøå])/i.test(text)) return { intent: 'supplier_quote', reason: 'Mailen eller en vedhæftning nævner tilbud.' }
  return { intent: 'general', reason: 'Ingen specifik hensigt er genkendt.' }
}

function suggest(input: MailActionInput, card: Omit<MailActionCard, 'suggestions' | 'confidence'>): MailSuggestion[] {
  const customerHref = card.customer ? `/dashboard/customers/${card.customer.id}` : null
  const caseLabel = card.likelyCase ? `${card.likelyCase.caseNumber ?? 'sag'} — ${card.likelyCase.title}` : null
  const poa = card.attachments.some((a) => a.kind === 'power_of_attorney')
  const items: MailSuggestion[] = []
  if (card.customerStatus === 'ambiguous') {
    items.push({ id: 'choose_customer', label: 'Vælg kunde', reason: card.customerReason, href: null, requiresConfirmation: true, executed: false })
  }
  if (card.likelyCase && caseLabel) {
    items.push({ id: 'attach_mail', label: `Knyt mailen til sag ${caseLabel}`, reason: card.caseReason, href: `/dashboard/orders/${card.likelyCase.id}`, requiresConfirmation: true, executed: false })
  }
  if (poa) {
    items.push({ id: 'save_attachment', label: 'Gem vedhæftningen som fuldmagt', reason: 'Filnavn eller emne siger fuldmagt. Filen arkiveres ikke automatisk.', href: customerHref, requiresConfirmation: true, executed: false })
    items.push({ id: 'create_task', label: 'Opret opgave: gennemgå fuldmagt', reason: 'Forslag. Der oprettes ingen opgave her.', href: customerHref, requiresConfirmation: true, executed: false })
    items.push({ id: 'add_note', label: 'Noter at fuldmagten er modtaget', reason: 'Forslag. Der skrives ingen note her.', href: customerHref, requiresConfirmation: true, executed: false })
  } else {
    items.push({ id: 'create_task', label: 'Opret opgave ud fra mailen', reason: 'Forslag. Der oprettes ingen opgave her.', href: customerHref, requiresConfirmation: true, executed: false })
  }
  items.push({ id: 'change_status', label: 'Skift ikke status automatisk', reason: 'Status ændres kun bevidst på sagen.', href: card.likelyCase ? `/dashboard/orders/${card.likelyCase.id}` : null, requiresConfirmation: true, executed: false })
  items.push({ id: 'create_case', label: 'Opret ny sag kun bevidst', reason: 'Mailen opretter ikke en sag.', href: null, requiresConfirmation: true, executed: false })
  items.push({ id: 'do_nothing', label: 'Gør ingenting', reason: 'Lad mailen ligge.', href: null, requiresConfirmation: true, executed: false })
  void input
  return items
}

export function buildMailActionCard(input: MailActionInput): MailActionCard {
  const text = plainText(input)
  const address = extractMailAddress(text)
  const customer = matchCustomer(input, text)
  const attachments = input.attachmentNames.map((filename) => ({ filename, ...classifyDocumentLabel({ filename, subject: input.subject }) }))
  const intent = intentOf(`${input.subject ?? ''}\n${input.attachmentNames.join('\n')}\n${text}`, attachments)
  const ranked = rankCases(input, text, customer.customer, address)
  const confidence: MailActionCard['confidence'] = customer.status === 'ambiguous' || ranked.status === 'ambiguous'
    ? 'low'
    : customer.status === 'linked' || (customer.status === 'unique' && ranked.status === 'likely')
      ? 'high'
      : customer.status === 'unique' || ranked.status === 'likely'
        ? 'medium'
        : 'low'
  const partial = {
    customer: customer.customer,
    customerStatus: customer.status,
    customerReason: customer.reason,
    address,
    likelyCase: ranked.case,
    caseStatus: ranked.status,
    caseReason: ranked.reason,
    attachments,
    intent: intent.intent,
    intentReason: intent.reason,
    confidence,
  }
  return { ...partial, suggestions: suggest(input, partial) }
}
