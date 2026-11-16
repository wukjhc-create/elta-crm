/**
 * Godkendt NØD-ordlyd (final review S2). Bevidst IKKE 'use server'. Ingen LLM: nød-tilstanden springer klassifikations-
 * modellen over, og svaret er PRÆCIS denne faste tekst + en fast handoff-sætning — ingen sagsstatus, ingen
 * bekræftelsesspørgsmål, ingen teknisk fejlsøgning, ingen improviserede el-sikkerhedsinstruktioner.
 *
 * Politik (version EMERGENCY_POLICY_VERSION):
 *   1. Bed personen gå væk fra den umiddelbare fare.
 *   2. Ved fare for liv, brand, røg eller gnister: ring 112.
 *   3. Henvendelsen markeres 'emergency', status 'handoff', team service, og en medarbejder skal ringe op NU.
 *   4. AI'en sender ALDRIG selv nødpersonale/montør (dispatch_emergency er forbudt).
 *
 * Instruktioner om at betjene installationen (fx at slå hovedafbryderen fra) er IKKE med. De må kun tilføjes som en
 * af virksomheden eksplicit godkendt, fast skabelon-tilføjelse (APPROVED_EMERGENCY_ADDITIONS) efter særskilt
 * godkendelse — aldrig genereret af en model. Listen er tom.
 */
export const EMERGENCY_POLICY_VERSION = 'emergency-v1-2026-11-16' as const

export const EMERGENCY_TEMPLATE =
  'Gå væk fra faren. Er der fare for liv, brand, røg eller gnister, så ring 112 nu.' as const

export const EMERGENCY_HANDOFF_TEXT = 'Jeg giver din henvendelse videre som akut, så en medarbejder ringer dig op hurtigst muligt.' as const

/** Firma-godkendte faste tilføjelser (kræver særskilt skriftlig godkendelse — ingen i dag) */
export const APPROVED_EMERGENCY_ADDITIONS: readonly string[] = [] as const

export function emergencyReply(): string {
  return [EMERGENCY_TEMPLATE, ...APPROVED_EMERGENCY_ADDITIONS, EMERGENCY_HANDOFF_TEXT].join(' ')
}

/** Ord der aldrig må stå i et AI-svar uden for en godkendt skabelon (fejlsøgning/betjening af el-installationen) */
export const UNAPPROVED_SAFETY_INSTRUCTION = /hovedafbryder|hpfi|fejlstr[øo]msrel|sikring|relæ|sl[åa] (str[øo]mmen )?fra|afbryd str[øo]mmen|nulstil|genstart|reset|tryk på|vip|afmonter/i
