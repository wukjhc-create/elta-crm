/**
 * Standardrolle i "Sagsdeltagere"-panelet (TECH-PARTY-ROLE-1).
 *
 * Regler:
 * - "Fra sagen": rollen følger den valgte register-mulighed (sagens kunde → Kunde, slutkunde → Slutkunde …), også når der
 *   kun er én mulighed (der sker da aldrig et onChange på vælgeren — derfor sættes rollen når tilstanden åbnes).
 * - Skift af mulighed sætter rollen til den nye muligheds standard.
 * - Hver ny tilføjelse starter forfra (første mulighed + dens rolle); den forrige tilføjelses rolle genbruges aldrig.
 * - "Eksisterende part"/"Ny part": generisk standard (Samarbejdspartner).
 * - Brugeren kan altid ændre rollen manuelt bagefter; kun et skift af mulighed overskriver det manuelle valg.
 *
 * Ren UI-logik — ingen database/RPC/RLS-betydning (RPC'erne validerer rollen uanset hvad).
 */
import type { CaseParticipantRole } from './audience'

export const FALLBACK_PARTICIPANT_ROLE: CaseParticipantRole = 'cooperation_partner'

export interface RoleOption { register: string; id: string; defaultRole: CaseParticipantRole }

export type ParticipantMode = null | 'case' | 'search' | 'new'

export function participantOptionKey(o: Pick<RoleOption, 'register' | 'id'>): string {
  return `${o.register}:${o.id}`
}

/** Rolle for en valgt mulighed (ukendt nøgle → generisk standard). */
export function roleForOption(options: readonly RoleOption[], key: string): CaseParticipantRole {
  return options.find((o) => participantOptionKey(o) === key)?.defaultRole ?? FALLBACK_PARTICIPANT_ROLE
}

/** Starttilstand hver gang en tilføjelse åbnes (nulstiller mellem tilføjelser). */
export function initialParticipantSelection(
  mode: ParticipantMode,
  options: readonly RoleOption[],
): { optionKey: string; role: CaseParticipantRole } {
  const first = options[0]
  const optionKey = first ? participantOptionKey(first) : ''
  if (mode === 'case' && first) return { optionKey, role: first.defaultRole }
  return { optionKey, role: FALLBACK_PARTICIPANT_ROLE }
}
