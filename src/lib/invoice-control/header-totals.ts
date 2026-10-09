/**
 * IC8 — hovedbeløb mod linjesum på en leverandørfaktura. Ren funktion, ingen bogføring.
 * Beløb i øre. En linje uden beløb gør linjesummen ukendt. Hullet bliver ikke 0.
 */
/**
 * Samme øre-regel som `toOre` i aftercalc.ts. Gentaget her, så fakturapanelet
 * (klient) ikke henter efterkalkulationen. `header-totals-test` sammenligner de to.
 */
function toOre(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const neg = s.startsWith('-')
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.')
  const frac2 = (frac + '00').slice(0, 2)
  const third = frac[2] ?? '0'
  let ore = Number(whole) * 100 + Number(frac2)
  if (third >= '5') ore += 1
  if (!Number.isSafeInteger(ore)) return null
  return neg ? -ore : ore
}

export interface HeaderLine {
  totalPrice: number | string | null
  quantity: number | string | null
  unitPrice: number | string | null
}

export interface HeaderTotalsInput {
  amountExclVat: number | string | null
  vatAmount: number | string | null
  amountInclVat: number | string | null
  lines: HeaderLine[]
}

export type HeaderSumStatus = 'match' | 'mismatch' | 'incomplete' | 'no_lines' | 'no_header'
export type VatStatus = 'match' | 'mismatch' | 'incomplete'

export interface HeaderLineCheck {
  status: HeaderSumStatus
  headerExclOre: number | null
  /** Null når en linje mangler beløb, eller når der ingen linjer er. */
  lineSumOre: number | null
  /** Linjesum minus beløb ekskl. moms. Null når en af siderne er ukendt. */
  differenceOre: number | null
  lineCount: number
  missingLineCount: number
  /** Linjer uden total, hvor beløbet er antal × enhedspris. */
  derivedLineCount: number
  vatStatus: VatStatus
  /** Inkl. moms minus (ekskl. moms + moms). Null når et af de tre beløb mangler. */
  vatDifferenceOre: number | null
}

/** Angivet linjetotal vinder. Ellers antal × enhedspris, begge med to decimaler. */
export function lineTotalOre(line: HeaderLine): { ore: number | null; derived: boolean } {
  const stated = toOre(line.totalPrice)
  if (stated != null) return { ore: stated, derived: false }
  const qty = toOre(line.quantity)
  const unit = toOre(line.unitPrice)
  if (qty == null || unit == null) return { ore: null, derived: false }
  const product = Math.round((qty * unit) / 100)
  if (!Number.isSafeInteger(product)) return { ore: null, derived: false }
  return { ore: product, derived: true }
}

export function headerLineCheck(input: HeaderTotalsInput): HeaderLineCheck {
  const headerExclOre = toOre(input.amountExclVat)
  const vatOre = toOre(input.vatAmount)
  const inclOre = toOre(input.amountInclVat)
  const vatDifferenceOre = headerExclOre == null || vatOre == null || inclOre == null
    ? null
    : inclOre - (headerExclOre + vatOre)
  const vatStatus: VatStatus = vatDifferenceOre == null ? 'incomplete' : vatDifferenceOre === 0 ? 'match' : 'mismatch'

  const base = {
    headerExclOre,
    lineCount: input.lines.length,
    vatStatus,
    vatDifferenceOre,
  }

  if (input.lines.length === 0) {
    return { ...base, status: 'no_lines', lineSumOre: null, differenceOre: null, missingLineCount: 0, derivedLineCount: 0 }
  }

  let sum = 0
  let missing = 0
  let derived = 0
  for (const line of input.lines) {
    const total = lineTotalOre(line)
    if (total.ore == null) missing += 1
    else {
      sum += total.ore
      if (total.derived) derived += 1
    }
  }

  if (missing > 0) {
    return { ...base, status: 'incomplete', lineSumOre: null, differenceOre: null, missingLineCount: missing, derivedLineCount: derived }
  }
  if (headerExclOre == null) {
    return { ...base, status: 'no_header', lineSumOre: sum, differenceOre: null, missingLineCount: 0, derivedLineCount: derived }
  }
  const differenceOre = sum - headerExclOre
  return {
    ...base,
    status: differenceOre === 0 ? 'match' : 'mismatch',
    lineSumOre: sum,
    differenceOre,
    missingLineCount: 0,
    derivedLineCount: derived,
  }
}

function kr(ore: number): string {
  const neg = ore < 0
  const abs = Math.abs(ore)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '−' : ''}${grouped},${frac} kr`
}

/** Dansk sætning til fakturapanelet. Afvigelse nævnes kun når den er kendt. */
export function headerLineSummary(check: HeaderLineCheck): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  const vat = check.vatStatus === 'mismatch' && check.vatDifferenceOre != null
    ? ` Ekskl. moms + moms stemmer ikke med beløb inkl. moms (forskel ${kr(check.vatDifferenceOre)}).`
    : ''
  if (check.status === 'match') {
    return { tone: vat ? 'bad' : 'ok', text: `Linjesummen stemmer med beløb ekskl. moms (${kr(check.headerExclOre ?? 0)}).${vat}` }
  }
  if (check.status === 'mismatch' && check.lineSumOre != null && check.headerExclOre != null && check.differenceOre != null) {
    return {
      tone: 'bad',
      text: `Linjesummen ${kr(check.lineSumOre)} afviger fra beløb ekskl. moms ${kr(check.headerExclOre)} (forskel ${kr(check.differenceOre)}).${vat}`,
    }
  }
  if (check.status === 'incomplete') {
    const n = check.missingLineCount
    return { tone: 'warn', text: `Linjesummen kan ikke kontrolleres. ${n} ${n === 1 ? 'linje mangler beløb' : 'linjer mangler beløb'}, og hullet tælles ikke som 0.${vat}` }
  }
  if (check.status === 'no_header') {
    return { tone: 'warn', text: `Fakturaen har intet beløb ekskl. moms, så linjesummen kan ikke sammenlignes.${vat}` }
  }
  return { tone: 'warn', text: `Fakturaen har ingen linjer, så hovedbeløbet kan ikke kontrolleres.${vat}` }
}
