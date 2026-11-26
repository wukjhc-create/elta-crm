/**
 * Phase C1 — fixture-test af den deterministiske henvendelses-klassifikator (ren logik, ingen DB).
 *   npx tsx scripts/inquiry-classifier-test.ts
 */
import { classifyInquiry, explainClassification, type InquiryContext } from '../src/lib/classification/inquiry-classifier'
import { caseNumbersInText, extractTextSignals, formEmail, formInquiryType } from '../src/lib/classification/inquiry-text-signals'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, note = '') => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const c = (ctx: InquiryContext) => classifyInquiry(ctx)
const sig = (subject: string, body = '', webForm = false) => extractTextSignals({ subject, body }, { webForm })
const exp = (name: string, ctx: InquiryContext, want: Partial<Record<'senderType' | 'inquiryType' | 'caseReference' | 'proposedAction', string>>) => {
  const r = c(ctx)
  const got = { senderType: r.senderType, inquiryType: r.inquiryType, caseReference: r.caseReference, proposedAction: r.proposedAction }
  const bad = Object.entries(want).filter(([k, v]) => (got as Record<string, string>)[k] !== v)
  ok(name, bad.length === 0, bad.map(([k, v]) => `${k}=${(got as Record<string, string>)[k]} forventet ${v}`).join('; '))
  ok(`${name}: forklaring har regel for hver dimension`, ['sender', 'inquiry', 'case', 'action'].every((d) => r.rules.some((h) => h.dimension === d) || (d === 'sender' && r.senderType === 'unknown') || (d === 'inquiry' && r.inquiryType === 'unknown')))
  return r
}

// --- Tekstsignaler
ok('signal: faktura i emnet', sig('Faktura 12345 fra AO').includes('subject_invoice'))
ok('signal: ordrebekræftelse', sig('Ordrebekræftelse nr. 778899').includes('subject_order_confirmation') && sig('Order confirmation #1').includes('subject_order_confirmation'))
ok('signal: autosvar', sig('Autosvar: Ferie').includes('auto_reply') && sig('Out of Office: back monday').includes('auto_reply'))
ok('signal: leveringsfejl', sig('Undeliverable: Tilbud').includes('delivery_failure'))
ok('signal: nyhedsbrev kræver to kendetegn', !sig('Hej', 'Klik her for at afmelde').includes('newsletter_markers') && sig('Nyt', 'Se nyhedsbrevet i din browser. Afmeld nyhedsbrev her').includes('newsletter_markers'))
ok('signal: service', sig('Fejl på inverter', 'Den viser fejlkode 42').includes('service_keywords') && sig('', 'Mit anlæg virker ikke').includes('service_keywords'))
ok('signal: "Kundeservice" i signatur er ikke service', !sig('Hej', 'Venlig hilsen Kundeservice').includes('service_keywords'))
ok('signal: salgsintention', sig('Tilbud på solceller').includes('sales_intent') && sig('', 'Hvad koster en ladestander?').includes('sales_intent'))
ok('signal: produktord alene er ikke salgsintention', sig('Mine solceller').includes('product_mention') && !sig('Mine solceller').includes('sales_intent'))
ok('signal: formularens type', sig('Ny henvendelse', 'Navn: A\nType: Service\nBesked: x', true).includes('form_type_service') && sig('Ny henvendelse', 'Type: Tilbud på solceller', true).includes('form_type_sales'))
ok('formular: type/email udtrækkes', formInquiryType('Navn: A\nType: Batteri\n') === 'batteri' && formEmail('Email: Kunde@Eksempel.dk\n') === 'kunde@eksempel.dk')
ok('sagsnumre: normaliseres og unikke', JSON.stringify(caseNumbersInText({ subject: 'Ang. svc-01006', body: 'se SVC-01006 og SVC01007' })) === '["SVC-01006","SVC-01007"]')

// Fund fra prod-shadow v1 (2026-11-26): disclaimers, citeret historik, svar-emner, videresendelser
ok('disclaimer "modtaget ved en fejl" er ikke service', !sig('Ordre 12', 'Hej\nHvis du har modtaget denne mail ved en fejl, så slet den').includes('service_keywords'))
ok('"fejl" uden "ved en" er stadig service', sig('', 'Der er en fejl på inverteren').includes('service_keywords'))
ok('citeret historik tæller ikke (ELTA\'s eget tilbud i svaret)', !sig('Hej', 'Tak, det lyder godt.\n\nFra: ELTA\nSendt: i går\nHer er vores tilbud på installation af solceller').includes('sales_intent'))
ok('">"-citat tæller ikke', !sig('Hej', 'Ok fint\n> Vi sender et tilbud').includes('sales_intent'))
ok('svar-emne "SV: Tilbud" er ikke en ny salgsforespørgsel', !sig('SV: Tilbud på solceller', 'Tak, vi tænker over det').includes('sales_intent') && sig('SV: Tilbud på solceller', '').includes('reply_subject'))
ok('svar med ny salgsintention i egen tekst tæller', sig('SV: Tilbud', 'Kan I også give et tilbud på en ladestander?').includes('sales_intent'))
ok('videresendt mail: den videresendte tekst tæller', sig('VS: Henvendelse', 'Se nedenfor\n\nFra: kunde\nSendt: i dag\nMit anlæg virker ikke').includes('service_keywords'))
ok('videresendt (FW) er ikke et "svar"', !sig('FW: Tilbud på batteri', '').includes('reply_subject') && sig('FW: Tilbud på batteri', '').includes('sales_intent'))
exp('ukendt afsender: faktura-ord + faktura-filnavn + bilag → faktura (to beviser)', { hasAttachments: true, attachmentNamedInvoice: true, textSignals: sig('Faktura 2211') }, { senderType: 'unknown', inquiryType: 'invoice', proposedAction: 'route_to_bookkeeping' })
exp('ukendt afsender: faktura@-adresse + filnavn → faktura', { hasAttachments: true, attachmentNamedInvoice: true, invoiceSenderAddress: true }, { inquiryType: 'invoice' })
const single = exp('ukendt afsender: kun faktura-ord → IKKE faktura (gæt ikke)', { hasAttachments: true, textSignals: sig('Faktura') }, { inquiryType: 'unknown' })
ok('enkelt faktura-bevis giver tvivl-grund', single.doubts.includes('inquiry:single_invoice_evidence_unknown_sender'))
exp('to beviser men intet bilag → ikke faktura', { attachmentNamedInvoice: true, invoiceSenderAddress: true, textSignals: sig('Faktura') }, { inquiryType: 'unknown' })
exp('leverandør: faktura-filnavn alene + bilag → faktura', { supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, hasAttachments: true, attachmentNamedInvoice: true }, { inquiryType: 'invoice' })
exp('kunde med faktura-filnavn → stadig kundehenvendelse', { customerMatch: { state: 'unique' }, hasAttachments: true, attachmentNamedInvoice: true, textSignals: sig('Faktura') }, { inquiryType: 'customer_inquiry' })

// --- Afsendertype (adskilt fra henvendelsestype)
exp('intern ELTA-afsender', { internalSender: true }, { senderType: 'internal', inquiryType: 'internal_message', caseReference: 'not_applicable', proposedAction: 'no_action' })
exp('kendt kunde, ingen signaler → kundehenvendelse', { customerMatch: { state: 'unique' } }, { senderType: 'existing_customer', inquiryType: 'customer_inquiry', proposedAction: 'assign_customer_inquiry' })
exp('kendt kunde + fejl → service + servicesag-forslag', { customerMatch: { state: 'unique' }, textSignals: sig('Fejl', 'inverteren viser fejl') }, { senderType: 'existing_customer', inquiryType: 'service_request', proposedAction: 'create_service_case_proposal' })
exp('ukendt afsender + fejl → identificér afsender (ingen kunde oprettes)', { customerMatch: { state: 'none' }, textSignals: sig('Fejl på anlæg', 'virker ikke') }, { senderType: 'unknown', inquiryType: 'service_request', proposedAction: 'identify_sender' })
exp('ukendt afsender + tilbud → lead-forslag', { textSignals: sig('Tilbud på solceller') }, { senderType: 'unknown', inquiryType: 'sales_inquiry', proposedAction: 'create_lead_proposal' })
exp('ukendt afsender uden signaler → ukendt/manuel', {}, { senderType: 'unknown', inquiryType: 'unknown', caseReference: 'none', proposedAction: 'manual_review' })
exp('service + salg i fritekst → ukendt (gæt ikke)', { customerMatch: { state: 'unique' }, textSignals: sig('Tilbud', 'Vi vil gerne have et tilbud, og inverteren virker ikke') }, { inquiryType: 'unknown', proposedAction: 'manual_review' })
exp('kunde med produktord alene → kundehenvendelse (ikke salg)', { customerMatch: { state: 'unique' }, textSignals: sig('Mine solceller', 'Hej, et spørgsmål om mine solceller') }, { inquiryType: 'customer_inquiry' })
exp('kunde spørger om faktura → kundehenvendelse (ikke leverandørfaktura)', { customerMatch: { state: 'unique' }, hasAttachments: true, textSignals: sig('Spørgsmål til faktura') }, { senderType: 'existing_customer', inquiryType: 'customer_inquiry' })
exp('flertydigt kundematch → ukendt afsender', { customerMatch: { state: 'ambiguous' } }, { senderType: 'unknown' })

// Webformular
exp('webformular, salg (type-felt)', { webForm: true, textSignals: sig('Ny henvendelse', 'Type: Tilbud\nBesked: Solceller til hus', true) }, { senderType: 'web_form', inquiryType: 'sales_inquiry', proposedAction: 'create_lead_proposal' })
exp('webformular, produktord alene → salg', { webForm: true, textSignals: sig('Ny henvendelse', 'Besked: batteri til mit hus', true) }, { inquiryType: 'sales_inquiry' })
exp('webformular, type service vinder over fritekst-salg', { webForm: true, textSignals: sig('Ny henvendelse', 'Type: Service\nBesked: fejl, og hvad koster en ny inverter', true) }, { inquiryType: 'service_request' })
exp('webformular med kendt kundes e-mail → eksisterende kunde', { webForm: true, customerMatch: { state: 'unique', viaFormEmail: true } }, { senderType: 'existing_customer' })
exp('FormSubmit-systemmail → automatisk', { webFormSystemMail: true }, { senderType: 'automated', inquiryType: 'automated_message', proposedAction: 'no_action' })

// Leverandør / partner
exp('leverandør (grossist-domæne) + faktura m. bilag', { supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, hasAttachments: true, textSignals: sig('Faktura 991') }, { senderType: 'supplier', inquiryType: 'invoice', proposedAction: 'route_to_bookkeeping' })
exp('leverandør + "faktura" uden bilag → ukendt type', { supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, textSignals: sig('Faktura spørgsmål') }, { senderType: 'supplier', inquiryType: 'unknown', proposedAction: 'review_party_mail' })
exp('leverandør + ordrebekræftelse', { supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, textSignals: sig('Ordrebekræftelse 4455') }, { inquiryType: 'order_confirmation', proposedAction: 'match_to_purchase' })
exp('noreply hos leverandør → leverandør (ikke kun automatisk)', { automatedSender: true, supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, textSignals: sig('Din ordre er afsendt') }, { senderType: 'supplier', inquiryType: 'order_confirmation' })
exp('registreret leverandørfaktura vinder', { supplier: { isSupplier: true, reasons: ['sender_history_supplier'] }, invoiceRegistered: true }, { inquiryType: 'invoice', proposedAction: 'route_to_bookkeeping' })
exp('leverandørevidens vs. manuelt oprettet kunde → ukendt', { supplier: { isSupplier: true, reasons: ['sender_history_supplier'] }, customerMatch: { state: 'unique', autoCreated: false } }, { senderType: 'unknown' })
const r1 = exp('leverandørevidens slår auto-oprettet kunde', { supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, customerMatch: { state: 'unique', autoCreated: true } }, { senderType: 'supplier' })
ok('leverandør slår auto-kunde: reglen nævnes', r1.rules.some((h) => h.rule === 'supplier_beats_auto_created_customer'))
exp('samarbejdspartner (bekræftet relation)', { partyRelations: ['cooperation_partner'], customerMatch: { state: 'unique' } }, { senderType: 'cooperation_partner', inquiryType: 'unknown', proposedAction: 'review_party_mail' })
exp('partner-relation vinder over leverandørevidens', { partyRelations: ['cooperation_partner', 'supplier'], supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] } }, { senderType: 'cooperation_partner' })
exp('producent → samarbejdspartner-afsender', { partyRelations: ['manufacturer'] }, { senderType: 'cooperation_partner' })

// Automatisk
exp('noreply uden leverandør', { automatedSender: true }, { senderType: 'automated', inquiryType: 'automated_message', proposedAction: 'no_action' })
exp('nyhedsbrev fra ukendt', { textSignals: sig('Ugens tilbud!', 'Se nyhedsbrevet i din browser. Afmeld her: unsubscribe') }, { senderType: 'automated', inquiryType: 'automated_message' })
exp('kundens autosvar → automatisk', { customerMatch: { state: 'unique' }, textSignals: sig('Autosvar: på ferie') }, { senderType: 'automated' })
exp('leveringsfejl → automatisk', { textSignals: sig('Undeliverable: Dit tilbud') }, { senderType: 'automated' })

// Sagsreference (egen dimension)
exp('sagsnummer i emnet → eksisterende sag', { customerMatch: { state: 'unique' }, caseNumbers: { existing: ['SVC-01006'], unknown: [] }, textSignals: sig('Ang. SVC-01006 fejl', 'virker ikke') }, { inquiryType: 'service_request', caseReference: 'existing_case', proposedAction: 'link_to_case' })
exp('to sagsnumre → flertydig + manuel', { customerMatch: { state: 'unique' }, caseNumbers: { existing: ['SVC-01006', 'SVC-01007'], unknown: [] } }, { caseReference: 'ambiguous', proposedAction: 'manual_review' })
exp('tråd koblet til sag', { customerMatch: { state: 'unique' }, threadCaseIds: ['x'] }, { caseReference: 'existing_case', proposedAction: 'link_to_case' })
exp('ukendt sagsnummer ignoreres', { customerMatch: { state: 'unique' }, caseNumbers: { existing: [], unknown: ['SVC-99999'] } }, { caseReference: 'none' })
exp('kundens eneste åbne sag → kun mulig sag (ingen kobling)', { customerMatch: { state: 'unique' }, openCasesForCustomer: 1 }, { caseReference: 'possible_case', proposedAction: 'assign_customer_inquiry' })
exp('leverandør med sagsnummer → kobling foreslås', { supplier: { isSupplier: true, reasons: ['known_wholesaler_domain'] }, caseNumbers: { existing: ['SVC-01006'], unknown: [] } }, { senderType: 'supplier', caseReference: 'existing_case', proposedAction: 'link_to_case' })

// Forklaring + determinisme
const e = classifyInquiry({ customerMatch: { state: 'unique' }, textSignals: sig('Fejl') })
const lines = explainClassification(e)
ok('forklaring: fire linjer med regler', lines.length >= 4 && lines[0].includes('email_matches_customer') && lines[1].includes('service_keywords'))
ok('version sat', e.version === 'c1-v1')
ok('deterministisk (samme input → samme output)', JSON.stringify(classifyInquiry({ textSignals: sig('Tilbud') })) === JSON.stringify(classifyInquiry({ textSignals: sig('Tilbud') })))
ok('ukendt bærer altid en tvivl-grund', classifyInquiry({}).doubts.length >= 2)

console.log(fail ? `❌ ${fail} fejl, ${pass} ok` : `✅ ${pass} tjek — C1 henvendelses-klassifikator`)
process.exitCode = fail ? 1 : 0
