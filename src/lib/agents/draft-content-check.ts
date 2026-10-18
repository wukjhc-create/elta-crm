/**
 * AI-7 (AI-review 2026-10-18): et LLM-svarudkast kan — styret af tekst i den indgående mail — indeholde links,
 * telefonnumre eller beløb, som ingen har bedt om. Før blev udkastet et "gennemset" afsendelsesforslag, så længe
 * skabelon-pladsholderen var væk. Her findes de konkrete påstande i udkastet, der IKKE står i kildemailen (og ikke er
 * Eltas egne), så godkenderen ser dem eksplicit. Ren funktion (ingen I/O). Blokerer ikke — markerer.
 */
import { BRAND_WEBSITE, BRAND_EMAIL } from '@/lib/brand'

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi
const PHONE_RE = /(?:\+45[\s-]?)?\b\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g
const AMOUNT_RE = /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?\s?(?:kr\.?|DKK|,-)/gi

const digits = (s: string) => s.replace(/\D/g, '')
const OWN_HOSTS = [BRAND_WEBSITE.toLowerCase(), BRAND_EMAIL.split('@')[1].toLowerCase()]

export interface DraftContentWarnings { urls: string[]; phones: string[]; amounts: string[] }

export function unverifiedDraftClaims(draft: string, source: string): DraftContentWarnings {
  const src = source.toLowerCase()
  const srcDigits = digits(source)
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()))]
  const urls = uniq(draft.match(URL_RE) ?? []).filter((u) => {
    const l = u.toLowerCase()
    return !src.includes(l) && !OWN_HOSTS.some((h) => l.replace(/^https?:\/\//, '').replace(/^www\./, '').startsWith(h))
  })
  const phones = uniq(draft.match(PHONE_RE) ?? []).filter((p) => !srcDigits.includes(digits(p).slice(-8)))
  const amounts = uniq(draft.match(AMOUNT_RE) ?? []).filter((a) => !srcDigits.includes(digits(a)) || digits(a).length === 0)
  return { urls, phones, amounts }
}

export function hasDraftWarnings(w: DraftContentWarnings): boolean {
  return w.urls.length + w.phones.length + w.amounts.length > 0
}

export function describeDraftWarnings(w: DraftContentWarnings): string {
  const parts = [
    w.urls.length ? `links (${w.urls.join(', ')})` : '',
    w.phones.length ? `telefonnumre (${w.phones.join(', ')})` : '',
    w.amounts.length ? `beløb (${w.amounts.join(', ')})` : '',
  ].filter(Boolean)
  return parts.length ? `OBS: udkastet indeholder ${parts.join(', ')}, som ikke står i kundens mail — kontrollér før godkendelse.` : ''
}
