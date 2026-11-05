/**
 * Trafiklys oven på den eksisterende fakturakontrol. Opretter ingen ny pris.
 * Manglende pris, en læsefejl og et ukendt beløb er aldrig 0.
 * Godkender, bogfører og betaler ikke.
 */
import { chargeLabel } from '@/lib/invoice-control/charge-label'
import { unitPriceMovement } from '@/lib/invoice-control/purchasing-review'
import type { InvoiceControl } from '@/lib/invoice-control/engine'

export type TrafficLight = 'green' | 'yellow' | 'red' | 'unknown'

export interface TrafficFinding {
  light: Exclude<TrafficLight, 'unknown'> | 'unknown'
  code: string
  label: string
  /** Kr, når beløbet kendes. null når det ikke kan beregnes. */
  amount: number | null
  reason: string
  followUp: string
}

export interface PurchasingCheckLine {
  lineNumber?: number
  invoicedQty: number | null
  /** null = der er intet aftalt antal. Det bliver ikke et fund og ikke 0. */
  expectedQty: number | null
  /** null eller ikke-positiv = prisen kendes ikke. Bliver aldrig 0 i et beløb. */
  catalogueUnitPrice: number | null
  previousUnitPrice: number | null
  duplicate: boolean
}

export interface TrafficLightInput {
  control: InvoiceControl | null
  pending?: boolean
  loadFailed?: boolean
  duplicateOfId?: string | null
  caseId?: string | null
  purchaseOrderId?: string | null
  lineDescriptions?: string[]
  purchasing?: { loadFailed?: boolean; lines?: PurchasingCheckLine[] }
}

function knownUnitPrice(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

export interface TrafficLightResult {
  light: TrafficLight
  findings: TrafficFinding[]
}

const rank: Record<TrafficLight, number> = { unknown: 3, red: 2, yellow: 1, green: 0 }

export function invoiceTrafficLight(input: TrafficLightInput): TrafficLightResult {
  const findings: TrafficFinding[] = []
  if (input.pending) {
    findings.push({ light: 'unknown', code: 'pending', label: 'Kontrollen kører', amount: null, reason: 'Resultatet er ikke klar.', followUp: 'Vent på kontrollen. Et manglende resultat er ikke grønt.' })
  } else if (input.loadFailed || !input.control) {
    findings.push({ light: 'unknown', code: 'load_failed', label: 'Kontrollen kunne ikke læses', amount: null, reason: 'Priskontrollen fejlede.', followUp: 'Prøv igen. Fejlen tælles ikke som 0 kr og ikke som godkendt.' })
  } else {
    const control = input.control
    const over = control.lines.filter((l) => l.verdict === 'overcharge')
    const under = control.lines.filter((l) => l.verdict === 'undercharge')
    const blind = control.lines.filter((l) => l.verdict === 'not_controllable')
    // Ingen linjer = intet er kontrolleret. Må ikke ende som grøn, fordi ingen fund er tilbage.
    if (!control.lines.length) {
      findings.push({ light: 'unknown', code: 'no_lines', label: 'Ingen linjer at kontrollere', amount: null, reason: 'Fakturaen har ingen læste linjer.', followUp: 'Læs fakturaen igen eller udfyld linjerne. Intet er kontrolleret.' })
    }
    if (over.length) {
      findings.push({
        light: 'red',
        code: 'overcharge',
        label: 'Pris over aftalt',
        amount: control.controlledLines > 0 ? control.overchargeAmount : null,
        reason: `${over.length} linje(r) ligger over tolerancen.`,
        followUp: 'Følg op med leverandøren før godkendelse. Godkend ikke herfra.',
      })
    }
    if (under.length) {
      findings.push({ light: 'yellow', code: 'undercharge', label: 'Pris under aftalt', amount: null, reason: `${under.length} linje(r) ligger under den aftalte pris.`, followUp: 'Tjek om linjen er en kredit eller en forkert vare.' })
    }
    if (blind.length) {
      findings.push({ light: 'yellow', code: 'not_controllable', label: 'Ikke kontrolleret', amount: null, reason: `${blind.length} linje(r) mangler en brugbar forventet pris eller et sammenligneligt grundlag.`, followUp: 'Find prisen. En manglende pris er ikke 0 kr.' })
    }
    if (!over.length && !under.length && !blind.length && control.verdict === 'ok') {
      findings.push({ light: 'green', code: 'prices_ok', label: 'Kontrollerede priser stemmer', amount: control.overchargeAmount, reason: 'De kontrollerede linjer er inden for tolerancen.', followUp: 'Se stadig fordeling, dublet og gebyrer nedenfor.' })
    }
  }

  if (input.duplicateOfId) {
    findings.push({ light: 'red', code: 'duplicate', label: 'Mulig dublet', amount: null, reason: 'Fakturaen peger på en anden faktura som dublet.', followUp: 'Sammenlign de to fakturaer før noget godkendes.' })
  }
  for (const description of input.lineDescriptions ?? []) {
    const kind = chargeLabel(description)
    if (!kind) continue
    findings.push({ light: 'yellow', code: kind, label: kind === 'fragt' ? 'Fragt' : 'Gebyr', amount: null, reason: `Linjen “${description}” er ${kind} og indgår ikke som en kontrolleret varepris.`, followUp: 'Vurder om beløbet var aftalt.' })
  }
  if (!input.caseId) {
    findings.push({ light: 'yellow', code: 'no_case', label: 'Ikke fordelt på sag', amount: null, reason: 'Fakturaen har ingen sag.', followUp: 'Knyt den til sagen, hvis den hører til et arbejde.' })
  }
  if (!input.purchaseOrderId) {
    findings.push({ light: 'yellow', code: 'no_purchase_order', label: 'Ingen indkøbsordre', amount: null, reason: 'Der er ingen indkøbsordre at sammenligne antal og pris med.', followUp: 'Sammenlign med katalogprisen, hvor den findes.' })
  }
  if (input.purchasing?.loadFailed) {
    findings.push({ light: 'unknown', code: 'purchasing_unreadable', label: 'Indkøbstjekket kunne ikke læses', amount: null, reason: 'Antal og katalogpris kunne ikke sammenlignes.', followUp: 'Prøv igen. Fejlen er ikke grøn og ikke 0 kr.' })
  }
  for (const line of input.purchasing?.lines ?? []) {
    const where = line.lineNumber != null ? `Linje ${line.lineNumber}: ` : ''
    if (line.duplicate) {
      findings.push({ light: 'red', code: 'duplicate_line', label: 'Mulig dubletlinje', amount: null, reason: `${where}to linjer har samme vare.`, followUp: 'Sammenlign linjerne før noget godkendes.' })
    }
    if (line.expectedQty != null && Number.isFinite(line.expectedQty) && line.invoicedQty != null && Number.isFinite(line.invoicedQty) && line.invoicedQty !== line.expectedQty) {
      findings.push({ light: 'yellow', code: 'qty_mismatch', label: 'Antal afviger', amount: null, reason: `${where}faktureret ${line.invoicedQty}, forventet ${line.expectedQty}.`, followUp: 'Tjek antallet før godkendelse.' })
    }
    const catalogue = knownUnitPrice(line.catalogueUnitPrice)
    const previous = knownUnitPrice(line.previousUnitPrice)
    if (catalogue == null) {
      findings.push({ light: 'yellow', code: 'missing_purchase_price', label: 'Indkøbspris ukendt', amount: null, reason: `${where}kataloget har ingen brugbar pris på linjen.`, followUp: 'Find prisen. Den sættes ikke til 0.' })
    } else {
      const movement = unitPriceMovement(catalogue, previous)
      if (movement.moved && movement.diff != null) {
        findings.push({ light: 'yellow', code: 'price_movement', label: 'Prisen har flyttet sig', amount: movement.diff, reason: `${where}katalogprisen i dag afviger mindst 5 % og 0,50 kr pr. enhed fra prisen på fakturadatoen.`, followUp: 'Sammenlign med aftalen. Der godkendes ikke herfra.' })
      }
    }
  }

  if (!findings.length) {
    findings.push({ light: 'green', code: 'clear', label: 'Ingen afvigelse fundet', amount: null, reason: 'De tjek, der kunne køres, fandt ingen afvigelse.', followUp: 'Et menneske godkender stadig fakturaen.' })
  }
  // Manglende indkøbsordre vises, men gør ikke en ellers grøn faktura gul: de fleste fakturaer har ingen ordre endnu.
  const light = findings.filter((f) => f.code !== 'no_purchase_order').reduce<TrafficLight>((worst, f) => (rank[f.light] > rank[worst] ? f.light : worst), 'green')
  return { light, findings }
}
