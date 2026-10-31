/**
 * Aflevering-værn ved lukning (Henrik 2026-10-31, pilot-sim S2): kundens underskrift betyder IKKE at afleveringen er
 * komplet. En sag lukkes ikke, mens påkrævede tjeklistepunkter er åbne. Kun admin/serviceleder (BASISROLLE — en
 * enkelt-grant af cases.close giver ikke undtagelsesret) kan lukke alligevel: tydelig advarsel, eksplicit bekræftelse,
 * obligatorisk begrundelse, audit med de åbne punkter. Ingen tavs undtagelse.
 * En sag hvor afleveringen ikke er startet (tom tjekliste) lukkes som før. Ren logik (scripts/handover-close-guard-test.ts).
 */
import type { ChecklistItem } from '@/types/service-cases.types'

/** Fejlpræfiks når brugeren MÅ lukke alligevel (UI'et spørger så om begrundelse) */
export const HANDOVER_PREFIX = 'HANDOVER: '
export const HANDOVER_OVERRIDE_ROLES: readonly string[] = ['admin', 'serviceleder']
export const HANDOVER_REASON_MIN = 5
export const HANDOVER_REASON_MAX = 500

export type OpenHandoverItem = { key: string; label: string }

/** Påkrævede, ikke-udførte punkter (tom liste = afleveringen er ikke startet eller er komplet) */
export function openRequiredHandoverItems(checklist: unknown): OpenHandoverItem[] {
  if (!Array.isArray(checklist)) return []
  return (checklist as Partial<ChecklistItem>[])
    .filter((i) => !!i && i.required === true && !i.completed)
    .map((i) => ({ key: String(i.key ?? ''), label: String(i.label ?? i.key ?? '') }))
}

export type HandoverCloseDecision =
  | { ok: true; override: null }
  | { ok: true; override: { reason: string; openItems: OpenHandoverItem[] } }
  | { ok: false; error: string }

export function handoverCloseDecision(input: {
  checklist: unknown
  role: string | null | undefined
  override?: { reason?: string | null } | null
}): HandoverCloseDecision {
  const open = openRequiredHandoverItems(input.checklist)
  if (!open.length) return { ok: true, override: null }
  const list = open.map((i) => i.label).join(', ')
  const mayOverride = HANDOVER_OVERRIDE_ROLES.includes(String(input.role ?? ''))
  if (!mayOverride) {
    return { ok: false, error: `Afleveringen er ikke komplet — mangler: ${list}. Udfyld tjeklisten på fanen Aflevering (kun admin eller serviceleder kan lukke uden komplet aflevering)` }
  }
  if (!input.override) return { ok: false, error: `${HANDOVER_PREFIX}Afleveringen er ikke komplet — mangler: ${list}` }
  const reason = String(input.override.reason ?? '').trim()
  if (reason.length < HANDOVER_REASON_MIN) return { ok: false, error: `Skriv en begrundelse (mindst ${HANDOVER_REASON_MIN} tegn) for at lukke uden komplet aflevering` }
  if (reason.length > HANDOVER_REASON_MAX) return { ok: false, error: `Begrundelsen er for lang (højst ${HANDOVER_REASON_MAX} tegn)` }
  return { ok: true, override: { reason, openItems: open } }
}

export function isHandoverCloseError(error: string | null | undefined): error is string {
  return !!error && error.startsWith(HANDOVER_PREFIX)
}
