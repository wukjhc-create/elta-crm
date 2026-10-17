/**
 * PM-1/PM-2 (portal-review 2026-10-17): en kundemail med portal-link må kun gå til den kunde, linket tilhører. Mailrouteren
 * kan vælge en anden part (betaler/partner/slutkunde/kontakt på adressen) — så fjernes linkene, så modtageren ikke får
 * fuld adgang til en anden kundes portal (tilbud, fakturaer, dokumenter, chat). Ren funktion — bevidst IKKE 'use server'.
 */
const PORTAL_URL = /https?:\/\/[^\s"'<>]+\/portal\/[a-f0-9]{32,128}[^\s"'<>]*/gi
const PORTAL_ANCHOR = /<a\b[^>]*href=["']https?:\/\/[^"']+\/portal\/[a-f0-9]{32,128}[^"']*["'][^>]*>[\s\S]*?<\/a>/gi

/**
 * Erstatter hvert <a href="…/portal/<token>…">…</a> (hele knappen) med `replacementHtml` (standard: intet) og fjerner
 * løse portal-URL'er.
 */
export function stripPortalLinks(html: string, replacementHtml = ''): string {
  return html.replace(PORTAL_ANCHOR, replacementHtml).replace(PORTAL_URL, '')
}

export function containsPortalLink(html: string): boolean {
  PORTAL_URL.lastIndex = 0
  const hit = PORTAL_URL.test(html)
  PORTAL_URL.lastIndex = 0
  return hit
}
