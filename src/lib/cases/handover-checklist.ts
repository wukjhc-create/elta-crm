/**
 * Aflevering-tjekliste pr. sagstype (Henrik 2026-11-01). Solcellesager (service_cases.type = 'solar') bruger de
 * eksisterende solcellekrav (inverter, eltavle, paneler). Alle andre sager — el-installation, service, akut, projekt,
 * generelt og sager uden type — får en el-tjekliste UDEN solcellepunkter og uden påkrævede punkter, så lukke-værnet
 * ikke skaber en falsk blokering (og undtagelsen ikke bliver normal arbejdsgang for el-arbejde).
 *
 * Sagstypen afgør hvilke punkter der er påkrævede — også for en allerede startet tjekliste: skifter kontoret type,
 * normaliseres listen (påkrævet-flag efter typen, manglende skabelonpunkter tilføjes uafkrydset; afkrydsninger og fotos
 * bevares). En tom tjekliste = afleveringen er ikke startet og forbliver tom. Kun eksisterende nøgler/fotokategorier
 * (service_case_attachments.category) bruges — ingen skemaændring. Ren logik (scripts/handover-close-guard-test.ts).
 */
import { DEFAULT_CHECKLIST, type ChecklistItem } from '@/types/service-cases.types'

/** Solcellekravene (uændret fra før) */
export const SOLAR_HANDOVER_CHECKLIST: readonly ChecklistItem[] = DEFAULT_CHECKLIST

/** El-/servicearbejde: ingen solcellepunkter; ingen påkrævede punkter */
export const ELECTRICAL_HANDOVER_CHECKLIST: readonly ChecklistItem[] = [
  { key: 'tavle_photo', label: 'Foto af eltavle', required: false, completed: false, completed_at: null },
  { key: 'before_photo', label: 'Foto før arbejde', required: false, completed: false, completed_at: null },
  { key: 'after_photo', label: 'Foto efter arbejde', required: false, completed: false, completed_at: null },
  { key: 'notes_added', label: 'Noter tilføjet', required: false, completed: false, completed_at: null },
]

export function isSolarCaseType(caseType: string | null | undefined): boolean {
  return caseType === 'solar'
}

/** Skabelonen en ny aflevering startes med (frisk kopi) */
export function handoverTemplateFor(caseType: string | null | undefined): ChecklistItem[] {
  return (isSolarCaseType(caseType) ? SOLAR_HANDOVER_CHECKLIST : ELECTRICAL_HANDOVER_CHECKLIST).map((i) => ({ ...i }))
}

/**
 * Tjeklisten som den gælder for sagens type: påkrævet-flag følger typens skabelon (et solcellepunkt er aldrig påkrævet
 * på en ikke-solcellesag; et punkt uden for skabelonen er valgfrit), manglende skabelonpunkter tilføjes uafkrydset.
 * Ikke-startet (tom/ugyldig) → [].
 */
export function normalizeHandoverChecklist(checklist: unknown, caseType: string | null | undefined): ChecklistItem[] {
  if (!Array.isArray(checklist)) return []
  const template = handoverTemplateFor(caseType)
  const requiredByKey = new Map(template.map((i) => [i.key, i.required]))
  const stored = (checklist as unknown[]).filter((i): i is ChecklistItem => !!i && typeof i === 'object' && typeof (i as ChecklistItem).key === 'string')
  if (!stored.length) return []
  const keys = new Set(stored.map((i) => i.key))
  return [
    ...stored.map((i) => ({ ...i, required: requiredByKey.get(i.key) ?? false })),
    ...template.filter((t) => !keys.has(t.key)),
  ]
}
