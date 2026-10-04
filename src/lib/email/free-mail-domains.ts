/**
 * Gratis-/privat-maildomæner — ÉN liste for hele systemet (ren logik, ingen I/O). Bevidst IKKE 'use server'.
 *
 * Bruges hvor et domæne ellers tolkes som "samme virksomhed": mail → kunde-kobling på domæne (email-linker) og
 * afsenderdomæne som leverandørsignal (invoice-control). Kommunikations-review 2026-10-04 (S1): linkerens egen liste
 * manglede bl.a. hotmail.dk/live.dk/outlook.dk/gmx → ALLE mails fra fx @hotmail.dk blev koblet til den første kunde
 * med en hotmail.dk-adresse (vist på kundekortet, vedhæftninger arkiveret på kunden).
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  // internationale
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.co.uk', 'outlook.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'protonmail.com', 'proton.me', 'pm.me', 'gmx.com', 'gmx.net', 'gmx.de', 'mail.com', 'zoho.com', 'yandex.com',
  'tutanota.com', 'fastmail.com', 'hey.com',
  // danske
  'hotmail.dk', 'live.dk', 'outlook.dk', 'msn.dk', 'yahoo.dk', 'gmx.dk', 'mail.dk', 'email.dk', 'jubii.dk', 'ofir.dk',
  'privat.dk', 'youmail.dk', 'sol.dk', 'webmail.dk', 'post.tele.dk', 'mail.tele.dk', 'tdcadsl.dk', 'tdcspace.dk',
  'stofanet.dk', 'webspeed.dk', 'telenet.dk', 'get2net.dk', 'kabelmail.dk', 'city.dk', 'post.cybercity.dk',
  'cybercity.dk', 'mail.telenor.dk', 'fiberpost.dk', 'c.dk',
])

/** true for et gratis-/privat-maildomæne (uden "www.", case-ufølsom). */
export function isFreeMailDomain(domain: string | null | undefined): boolean {
  return FREE_MAIL_DOMAINS.has(String(domain ?? '').trim().toLowerCase().replace(/^www\./, ''))
}
