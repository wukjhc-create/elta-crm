/**
 * C2 — udtræk af identitetssignaler fra mailens EGEN tekst (signatur o.l.). Ren funktion (ingen DB, ikke 'use server').
 * Citeret historik er fjernet med C1's `freshBody` FØR udtræk (ellers ville ELTA's egen signatur i citerede svar give
 * falske match). ELTA's egne numre (company_settings) filtreres fra.
 */
import { freshBody } from '@/lib/classification/inquiry-text-signals'
import { canonicalPhone } from '@/lib/utils/phone'

const PHONE = /(?:\+|00)?(?:45[\s.-]?)?(?<!\d)(\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})(?!\d)/g
const VAT = /\b(?:cvr|se|vat)[\s.\-:]*(?:nr\.?|nummer|no\.?)?[\s.\-:]*(?:dk)?[\s-]?(\d{2}\s?\d{2}\s?\d{2}\s?\d{2})\b/gi
const CASE_NR = /\bSVC-?(\d{5})\b/gi
const OFFER_NR = /\bTILBUD-(\d{4})-(\d{3,6})\b/gi

export interface ExtractedIdentitySignals { phones: string[]; vats: string[]; caseNumbers: string[]; offerNumbers: string[] }

export function extractIdentitySignals(
  input: { subject: string | null; body: string | null; forwarded: boolean },
  own: { phones: Array<string | null | undefined>; vats: Array<string | null | undefined> } = { phones: [], vats: [] },
): ExtractedIdentitySignals {
  const fresh = freshBody(input.body, { forwarded: input.forwarded })
  const ownPhones = new Set(own.phones.map((p) => canonicalPhone(p)).filter(Boolean))
  const ownVats = new Set(own.vats.map((v) => String(v ?? '').replace(/\D/g, '')).filter((v) => v.length === 8))
  const vats = new Set<string>()
  const vatSpans: Array<[number, number]> = []
  for (const m of fresh.matchAll(VAT)) {
    const v = m[1].replace(/\D/g, '')
    vatSpans.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
    if (!ownVats.has(v)) vats.add(v)
  }
  const phones = new Set<string>()
  for (const m of fresh.matchAll(PHONE)) {
    const idx = m.index ?? 0
    if (vatSpans.some(([a, b]) => idx >= a && idx < b)) continue // et CVR-nummer er ikke et telefonnummer
    const p = canonicalPhone(m[0])
    if (p && !ownPhones.has(p)) phones.add(p)
  }
  // Sags-/tilbudsnumre må gerne stå i citeret historik (et svar på ELTA's mail bærer nummeret) — de er referencer, ikke identitet
  const text = `${input.subject ?? ''}\n${String(input.body ?? '').slice(0, 20000)}`
  const caseNumbers = [...new Set([...text.matchAll(CASE_NR)].map((m) => `SVC-${m[1]}`))]
  const offerNumbers = [...new Set([...text.matchAll(OFFER_NR)].map((m) => `TILBUD-${m[1]}-${m[2]}`))]
  return { phones: [...phones], vats: [...vats], caseNumbers, offerNumbers }
}
