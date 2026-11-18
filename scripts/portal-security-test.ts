/**
 * Portal-sikkerhed (portal-sikkerhedsreview 2026-11-18) — rene/statiske tests uden DB.
 *   npx tsx scripts/portal-security-test.ts
 * Den dynamiske del (rigtig kode mod staging, kunde A/B, id-angreb) er `cli.ts portal-security-staging`; browserens
 * samlede svar er UI-testen U269.
 */
import { readFileSync } from 'fs'
import {
  PORTAL_OFFER_COLUMNS, PORTAL_LINE_ITEM_COLUMNS, PORTAL_PDF_LINE_COLUMNS, PORTAL_TASK_COLUMNS, PORTAL_FORBIDDEN_KEYS,
  findForbiddenPortalKeys, toPortalTask,
} from '../src/lib/portal/projections'
import { isPortalVisibleBesigtigelse, isPortalConfirmableBesigtigelse, shouldRemindBesigtigelse } from '../src/lib/tasks/besigtigelse-task'

let fails = 0
const ok = (cond: boolean, name: string, note = '') => { if (cond) console.log(`PASS  ${name}`); else { fails++; console.log(`FAIL  ${name}${note ? ` (${note})` : ''}`) } }
const cols = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const forbidden = new Set<string>(PORTAL_FORBIDDEN_KEYS)

// 1. Kolonnelister: ingen kost/margin/noter; kun 'created_by' som server-side (aldrig i DTO'en)
ok(cols(PORTAL_LINE_ITEM_COLUMNS).every((c) => !forbidden.has(c)), 'linjekolonner uden kost/margin/noter/leverandørfelter', cols(PORTAL_LINE_ITEM_COLUMNS).filter((c) => forbidden.has(c)).join(','))
ok(['unit_price', 'discount_percentage', 'total', 'quantity', 'unit', 'description'].every((c) => cols(PORTAL_LINE_ITEM_COLUMNS).includes(c)), 'linjekolonner har kundens salgspris, rabat, antal, enhed og linjetotal')
ok(cols(PORTAL_PDF_LINE_COLUMNS).every((c) => !forbidden.has(c)), 'PDF-linjekolonner uden kost/margin/noter')
ok(cols(PORTAL_OFFER_COLUMNS).filter((c) => forbidden.has(c)).join(',') === 'created_by', "tilbudskolonner: kun 'created_by' (server-side til sælgeropslag) — ingen notes/IP/kilde", cols(PORTAL_OFFER_COLUMNS).filter((c) => forbidden.has(c)).join(','))
ok(['final_amount', 'tax_amount', 'total_amount', 'discount_amount', 'accepted_at', 'rejected_at', 'status'].every((c) => cols(PORTAL_OFFER_COLUMNS).includes(c)), 'tilbudskolonner har totaler, moms, rabat, status og accept-/afvisningstid')
ok(cols(PORTAL_TASK_COLUMNS).includes('customer_visible'), 'opgave-læsningen henter customer_visible (server-side klassifikation)')

// 2. Dybdesøgning finder forbudte nøgler
ok(findForbiddenPortalKeys({ a: [{ cost_price: 1 }], b: { margin_percentage: 2 } }).length === 2, 'findForbiddenPortalKeys finder indlejrede kost-/marginfelter')
ok(findForbiddenPortalKeys({ id: 'x', unit_price: 1, total: 2, line_items: [{ description: 'y' }] }).length === 0, 'findForbiddenPortalKeys: rent kundesvar = ingen fund')

// 3. Opgave-projektion: fast titel, kun tidspunkt, ingen interne felter
const proj = toPortalTask({ id: 't', title: 'Besigtigelse hos Hansen', description: 'Besigtigelse planlagt d. 1. jan kl. 09:00\nIntern: ring leverandøren', due_date: '2026-12-01T08:00:00Z', status: 'pending', created_at: '2026-11-01', auto_rule: null, customer_visible: true })
ok(Object.keys(proj).sort().join(',') === 'created_at,description,due_date,id,status,title', 'opgave-projektion har kun 6 kundefelter', Object.keys(proj).join(','))
ok(proj.title === 'Besigtigelse' && proj.description === 'Tidspunkt: 09:00', 'opgave-projektion: fast titel + kun tidspunkt (ingen intern beskrivelse)', JSON.stringify(proj))
ok(findForbiddenPortalKeys(proj).length === 0, 'opgave-projektion uden forbudte felter')

// 4. Synlighed: kun eksplicit kundevendt — aldrig udledt af titel/dato/ejerskab
const T = (o: Record<string, unknown>) => ({ title: 'Besigtigelse hos Hansen', auto_rule: null, status: 'pending', due_date: '2026-12-01', ...o })
ok(isPortalVisibleBesigtigelse(T({ customer_visible: true })), 'kundevendt booket besigtigelse vises')
ok(!isPortalVisibleBesigtigelse(T({})), 'samme titel UDEN customer_visible vises ikke (titel ≠ kundevendt)')
ok(!isPortalVisibleBesigtigelse(T({ customer_visible: false })), 'customer_visible=false vises ikke')
ok(!isPortalVisibleBesigtigelse(T({ customer_visible: true, auto_rule: 'assistant_appointment' })), 'assistent-aftale vises ikke, selv med flaget')
ok(!isPortalVisibleBesigtigelse({ title: 'Ring til kunden', customer_visible: true }), 'flaget alene gør ikke en vilkårlig opgave til en portal-besigtigelse')
ok(isPortalVisibleBesigtigelse({ title: 'PORTAL: Besigtigelse anmodet — X', customer_visible: true }), 'kundens egen portal-anmodning vises')
ok(!isPortalConfirmableBesigtigelse({ title: 'PORTAL: Besigtigelse anmodet — X', customer_visible: true }), 'kundens egen anmodning kan ikke bekræftes af kunden')
ok(!isPortalConfirmableBesigtigelse(T({})), 'intern "Besigtigelse hos"-opgave kan ikke bekræftes/ombookes')
ok(!shouldRemindBesigtigelse(T({ due_date: '2099-01-01' })), 'ingen kundemail-rykker om en ikke-kundevendt opgave')
ok(shouldRemindBesigtigelse(T({ due_date: '2099-01-01', customer_visible: true })), 'rykker om kundevendt, ubekræftet, fremtidig besigtigelse')

// 5. Statisk: portalens læse-/skrivestier vælger aldrig '*' og spreder aldrig en række til kunden
const src = readFileSync('src/lib/actions/portal.ts', 'utf8')
const fnBody = (name: string) => { const i = src.indexOf(`export async function ${name}(`); const j = src.indexOf('\nexport async function ', i + 10); return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j) }
const PORTAL_FNS = ['getPortalOffers', 'getPortalOffer', 'acceptOffer', 'rejectOffer', 'getPortalMessages', 'sendPortalMessage', 'getAttachmentUrl', 'getPortalInvoices', 'getPortalDocuments', 'portalBookBesigtigelse', 'getPortalBesigtigelser', 'portalConfirmBesigtigelse', 'portalRequestReschedule', 'uploadPortalAttachment']
for (const f of PORTAL_FNS) {
  const b = fnBody(f)
  ok(b.length > 0, `${f} findes`)
  ok(!/\.select\(\s*['"`]\*['"`]\s*\)/.test(b) && !/\.select\(\s*`\s*\*/.test(b), `${f}: ingen select('*')`)
  ok(b.includes('validatePortalToken(token)'), `${f}: validerer tokenet først`)
}
ok(!/\.\.\.t,\s*title:/.test(fnBody('getPortalBesigtigelser')), 'getPortalBesigtigelser spreder ikke opgaverækken (eksplicit toPortalTask)')
ok(fnBody('getPortalBesigtigelser').includes(".eq('customer_visible', true)"), 'getPortalBesigtigelser filtrerer på customer_visible i databaseforespørgslen')
ok(/customer_visible: true/.test(fnBody('portalBookBesigtigelse')), 'kundens egen portal-booking markeres kundevendt')
const pdf = readFileSync('src/app/api/portal/offers/pdf/route.ts', 'utf8')
ok(!/select\(`\s*\*/.test(pdf) && pdf.includes('PORTAL_PDF_LINE_COLUMNS'), 'portal-PDF: ingen *, eksplicitte portal-linjekolonner')
const cases = readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const gpsc = cases.slice(cases.indexOf('export async function getPortalServiceCases('), cases.indexOf('export async function createServiceCaseFromEmail('))
const gpscCode = gpsc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
ok(!gpscCode.includes("select('*')") && !/status_note|contract_sum|budget|planned_hours/.test(gpscCode), 'portal-sager: eksplicit kolonneliste uden interne felter')
const book = readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const bb = book.slice(book.indexOf('export async function bookBesigtigelse('), book.indexOf('// PRICE ALERTS'))
ok(bb.indexOf('customer_visible: true') > bb.indexOf('sendEmailViaGraph('), 'bookBesigtigelse: kundevendt FØRST efter afsendt booking-bekræftelse')
const cron = readFileSync('src/app/api/cron/offer-reminders/route.ts', 'utf8')
ok(cron.includes(".eq('customer_visible', true)"), 'rykker-cron: kun kundevendte besigtigelser')
const mig = readFileSync('supabase/migrations/00252_customer_tasks_customer_visible.sql', 'utf8')
ok(/ADD COLUMN IF NOT EXISTS customer_visible BOOLEAN NOT NULL DEFAULT false/.test(mig) && !/UPDATE public\.customer_tasks/i.test(mig), '00252: standard privat, ingen backfill')

if (fails) { console.log(`\n❌ ${fails} fejl`); process.exit(1) }
console.log('\n✅ portal-security-test: alle bestået')
