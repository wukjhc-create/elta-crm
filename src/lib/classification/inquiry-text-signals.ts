/**
 * Phase C1 — tekstsignaler for henvendelses-klassifikation. Ren logik (ingen DB, ikke 'use server').
 *
 * Hvert signal er et navngivet, deterministisk mønster, så en klassifikation altid kan forklares med "hvilke ord/regler
 * ramte". Mønstrene er bevidst konservative: et signal skal være tydeligt, ellers hellere intet signal (→ ukendt).
 */

export type TextSignal =
  | 'subject_invoice'          // faktura/invoice/kreditnota i emnet
  | 'subject_order_confirmation' // ordrebekræftelse/order confirmation/følgeseddel/forsendelse i emnet
  | 'auto_reply'               // autosvar/out of office/fraværsbesked
  | 'delivery_failure'         // undeliverable/delivery status/returneret mail
  | 'newsletter_markers'       // mindst to nyhedsbrev-kendetegn (afmeld, view in browser …)
  | 'service_keywords'         // fejl/defekt/virker ikke/service/reparation …
  | 'sales_intent'             // tilbud/pris/hvad koster/interesseret i/nyt anlæg …
  | 'product_mention'          // solceller/batteri/ladestander/varmepumpe (alene IKKE salg — kan være en fejl på eget anlæg)
  | 'form_type_service'        // webformularens inquiry_type peger på service
  | 'form_type_sales'          // webformularens inquiry_type peger på salg/tilbud
  | 'reply_subject'            // svar/videresendelse (SV:/RE:/VS:) — en fortsat dialog, ikke en ny forespørgsel

export interface TextInput {
  subject?: string | null
  body?: string | null
}

const SUBJECT_INVOICE = /\b(faktura|fakturanr|invoice|kreditnota|credit\s*note|rykker)\b/i
const SUBJECT_ORDER_CONF = /(ordre|order)\s*-?\s*(bekr(æ|ae)ftelse|confirmation)|ordrebekr|leveringsbekr(æ|ae)ftelse|f(ø|oe)lgeseddel|delivery\s*note|forsendelses?(bekr|meddelelse|info)|shipping\s*confirmation|din ordre (er )?(afsendt|sendt|modtaget)|order\s*(shipped|received)/i
const AUTO_REPLY = /(^|\b)(autosvar|automatisk svar|auto(matic)?[- ]?reply|out of office|frav(æ|ae)rsbesked|ikke p(å|aa) kontoret|abwesenheit)/i
const DELIVERY_FAILURE = /(undeliverable|delivery status notification|kunne ikke leveres|mail delivery (failed|subsystem)|returned mail|ikke-leveret|leveringsfejl)/i
const NEWSLETTER = [
  /afmeld(e|ing)?\s*(nyhedsbrev|her|dig)?/i, /unsubscribe/i, /view (this email )?in (your )?browser/i, /se (mailen|nyhedsbrevet) i (din )?browser/i,
  /nyhedsbrev/i, /newsletter/i, /manage (your )?(email )?preferences/i, /administrer (dine )?(mail)?pr(æ|ae)ferencer/i,
]
// "fejl" efter "ved en" er en ansvarsfraskrivelse ("modtaget ved en fejl"), ikke en servicesag (prod-shadow 2026-11-26)
const SERVICE = /\b((?<!ved en )fejl(kode|meddelelse)?|defekt|virker ikke|virker ikke længere|g(å|aa)r i stykker|i stykker|service(besøg|eftersyn)?|reparation|reparere|nedbrud|alarm|slår fra|sl(å|aa)r hfi|hpfi|rel(æ|ae)et|ingen str(ø|oe)m|mangler str(ø|oe)m|inverter(en)? (viser|melder|fejl)|producerer ikke|garanti(sag)?|reklamation)\b/i
const SALES_INTENT = /\b(tilbud|pristilbud|prisoverslag|hvad koster|hvad vil det koste|pris p(å|aa)|priser p(å|aa)|interesseret i|interesse for|f(å|aa) et tilbud|nyt anl(æ|ae)g|installation af|k(ø|oe)be)\b/i
const PRODUCT = /\b(solcelleanl(æ|ae)g(get)?|solceller(ne)?|solpaneler|batteri(et|løsning|anlæg)?|ladestander(en)?|ladeboks(en)?|varmepumpe(n)?|elbil-?lader)\b/i
const FORM_TYPE = /(^|\n)\s*(type|inquiry_type)\s*:\s*([^\n]+)/i

/** Uddrag webformularens "Type:"-felt (efter normalizeFormSubmitTable) */
export function formInquiryType(body: string | null | undefined): string | null {
  const m = FORM_TYPE.exec(String(body ?? ''))
  return m ? m[3].trim().toLowerCase().slice(0, 60) : null
}

/** Uddrag webformularens "Email:"-felt (kundens egen adresse — afsenderen er FormSubmit) */
export function formEmail(body: string | null | undefined): string | null {
  const m = /(^|\n)\s*(email|e-mail)\s*:\s*([^\s\n]+@[^\s\n]+\.[a-z]{2,})/i.exec(String(body ?? ''))
  return m ? m[3].trim().toLowerCase() : null
}

/** Svar/videresendelse i emnet ("SV:", "RE:", "AW:", "VS:", "FW:") */
const REPLY_SUBJECT = /^\s*((sv|re|aw|vs|fw|fwd|videresend|videresendt)\s*:\s*)+/i
const FORWARD_SUBJECT = /^\s*((sv|re|aw)\s*:\s*)*(vs|fw|fwd|videresend|videresendt)\s*:/i
/** Hvor den citerede historik begynder (alt herefter er tidligere mails — ofte ELTA's egne svar og signatur) */
const QUOTE_START = /^\s*(>|-{2,}\s*(original|oprindelig)\s*(message|meddelelse)|_{5,}|fra:\s|from:\s|sendt:\s|sent:\s|den .{4,80} skrev|on .{4,80} wrote:)/im
/** Ansvarsfraskrivelser/fortrolighedsklausuler — tæller aldrig som signal */
const DISCLAIMER = /(ved en fejl|fortrolig|tavshedspligt|confidential|intended (only )?(for the )?recipient|received this (e-?mail|message) in error|beskyttet af|privileged)/i

export function isReplySubject(subject: string | null | undefined): boolean {
  return REPLY_SUBJECT.test(String(subject ?? ''))
}

export function isForwardSubject(subject: string | null | undefined): boolean {
  return FORWARD_SUBJECT.test(String(subject ?? ''))
}

/**
 * Mailens "egen" tekst: før citeret historik, uden ansvarsfraskrivelses-linjer. En VIDERESENDT mail beholder teksten efter
 * videresendelses-hovedet (det er den egentlige henvendelse) — kun disclaimers fjernes.
 */
export function freshBody(body: string | null | undefined, opts: { forwarded?: boolean } = {}): string {
  const b = String(body ?? '').slice(0, 6000)
  const m = opts.forwarded ? null : QUOTE_START.exec(b)
  const head = m ? b.slice(0, m.index) : b
  return head.split('\n').filter((l) => !DISCLAIMER.test(l)).join('\n')
}

export function extractTextSignals(input: TextInput, opts: { webForm?: boolean; forwarded?: boolean } = {}): TextSignal[] {
  const subject = String(input.subject ?? '')
  const rawBody = String(input.body ?? '').slice(0, 6000)
  // Webformularer har ingen citeret historik; ellers kun mailens egen tekst (videresendte: hele den videresendte tekst)
  const forwarded = !!opts.forwarded || isForwardSubject(subject)
  const body = opts.webForm ? rawBody : freshBody(rawBody, { forwarded })
  const reply = isReplySubject(subject) && !forwarded
  const cleanSubject = subject.replace(REPLY_SUBJECT, '')
  const text = `${cleanSubject}\n${body}`
  const out: TextSignal[] = []
  if (reply) out.push('reply_subject')
  if (SUBJECT_INVOICE.test(cleanSubject)) out.push('subject_invoice')
  if (SUBJECT_ORDER_CONF.test(cleanSubject)) out.push('subject_order_confirmation')
  if (AUTO_REPLY.test(subject)) out.push('auto_reply')
  if (DELIVERY_FAILURE.test(subject)) out.push('delivery_failure')
  if (NEWSLETTER.filter((r) => r.test(rawBody)).length >= 2) out.push('newsletter_markers')
  if (SERVICE.test(text)) out.push('service_keywords')
  // Salg = NY forespørgsel: i et svar ("SV: Tilbud …") tæller kun mailens egen tekst, ikke emnet
  if (SALES_INTENT.test(reply ? body : text)) out.push('sales_intent')
  if (PRODUCT.test(text)) out.push('product_mention')
  if (opts.webForm) {
    const t = formInquiryType(body)
    if (t && /service|fejl|reparation|garanti|eftersyn/.test(t)) out.push('form_type_service')
    if (t && /tilbud|solcelle|batteri|ladestander|salg|nyt anl|installation|pris/.test(t)) out.push('form_type_sales')
  }
  return out
}

/** Sagsnumre nævnt i emne/tekst (SVC-01006) — normaliseret til store bogstaver, unikke */
export function caseNumbersInText(input: TextInput): string[] {
  const text = `${input.subject ?? ''}\n${String(input.body ?? '').slice(0, 6000)}`
  return [...new Set((text.match(/\bSVC-?\d{5}\b/gi) ?? []).map((s) => s.toUpperCase().replace(/^SVC-?/, 'SVC-')))]
}

/** Diagnose: hvilke nøgleord (ikke indhold) udløste service-/salgssignalet — bruges kun i shadow-rapporten */
export function matchedSignalTerms(input: TextInput, opts: { forwarded?: boolean } = {}): { service: string[]; sales: string[]; product: string[] } {
  const forwarded = !!opts.forwarded || isForwardSubject(input.subject)
  const text = `${String(input.subject ?? '').replace(REPLY_SUBJECT, '')}\n${freshBody(input.body, { forwarded })}`
  const all = (re: RegExp) => [...new Set((text.match(new RegExp(re.source, 'gi')) ?? []).map((s) => s.toLowerCase()))]
  return { service: all(SERVICE), sales: all(SALES_INTENT), product: all(PRODUCT) }
}
