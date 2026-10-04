/**
 * N66: afsenderdomæne som leverandørsignal for mail-fakturaer (ren logik, ingen I/O).
 *
 * En leverandør "ejer" et domæne når dens website-host eller kontakt-e-mail har samme domæne (www. ignoreres,
 * underdomæner tæller: faktura.sieg.dk → sieg.dk). Gratis-/privat-mail (gmail, hotmail, live, yahoo …) er aldrig et
 * leverandørsignal — her sender privatpersoner og montører også fra.
 */

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.dk', 'live.com', 'live.dk', 'outlook.com', 'outlook.dk', 'msn.com',
  'yahoo.com', 'yahoo.dk', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'mail.dk', 'jubii.dk', 'privat.dk', 'protonmail.com',
  'proton.me', 'gmx.com', 'gmx.net', 'tdcadsl.dk', 'post.tele.dk', 'stofanet.dk', 'youmail.dk', 'webspeed.dk', 'email.dk',
])

/** true når adressen er en gratis-/privat-mail (gmail, hotmail, live …). */
export function isFreeMailAddress(email: string | null | undefined): boolean {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})\s*>?\s*$/i.exec(String(email ?? '').trim())
  return !!m && FREE_MAIL.has(m[1].toLowerCase().replace(/^www\./, ''))
}

/**
 * N68: en mail-faktura er "sandsynligvis ikke en leverandørfaktura", når den kommer fra en privat-/gratis-mail og hverken
 * fik leverandør eller beløb. Prod 2026-10-04: 13 af 36 åbne var kundehenvendelser, ansøgninger og svar på Eltas egne
 * fakturaer. Kun en markering — intet afvises automatisk.
 */
export function isProbablyNotSupplierInvoice(i: { senderEmail: string | null | undefined; supplierId: string | null; amountInclVat: number | null }): boolean {
  return isFreeMailAddress(i.senderEmail) && !i.supplierId && i.amountInclVat == null
}

/** Domænet fra en e-mailadresse (små bogstaver, uden www.) — null ved ugyldig adresse eller gratis-mail. */
export function senderDomain(email: string | null | undefined): string | null {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})\s*>?\s*$/i.exec(String(email ?? '').trim())
  if (!m) return null
  const dom = m[1].toLowerCase().replace(/^www\./, '')
  return FREE_MAIL.has(dom) ? null : dom
}

/** Host fra et website-felt ("https://www.sieg.dk/kontakt", "sieg.dk") uden www. — null hvis det ikke ligner en host. */
export function websiteHost(website: string | null | undefined): string | null {
  const raw = String(website ?? '').trim().toLowerCase()
  if (!raw) return null
  const host = raw.replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '')
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
}

/** true når `host` er domænet selv eller et underdomæne af det. */
function sameOrSub(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)
}

/** Leverandører hvis website eller kontakt-e-mail matcher afsenderdomænet. */
export function suppliersForDomain<T extends { website?: string | null; contact_email?: string | null }>(domain: string, suppliers: T[]): T[] {
  return suppliers.filter((s) => {
    const host = websiteHost(s.website)
    const mailDom = senderDomain(s.contact_email)
    return (host !== null && sameOrSub(host, domain)) || (mailDom !== null && sameOrSub(mailDom, domain))
  })
}
