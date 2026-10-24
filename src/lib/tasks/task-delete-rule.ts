/**
 * MP-00236 (Henrik 2026-10-24): hvornår må en opgave slettes? Ren logik til UI'et (knappen vises kun når sletning er
 * tilladt). Serveren (taskDeleteDenied i lib/actions/customer-tasks.ts) håndhæver den samme regel og tjekker desuden
 * sags-scope for montøren. Bevidst IKKE 'use server'.
 *   - tasks.delete (admin/serviceleder): tilladte opgaver
 *   - ellers aldrig system-/auto-opgaver (afslut dem i stedet)
 *   - med tasks.create (salg/bogholderi): kun egne oprettede
 *   - uden tasks.create (montør): oprettet af og tildelt én selv, koblet til en sag
 */
export interface TaskDeleteAbilities {
  canDeleteAll: boolean
  canCreateAny: boolean
  userId: string | null
}

export function taskDeleteAllowed(
  t: { created_by: string | null; assigned_to: string | null; auto_generated?: boolean | null; service_case_id?: string | null },
  a: TaskDeleteAbilities,
): boolean {
  if (a.canDeleteAll) return true
  if (!a.userId || t.auto_generated || !t.created_by || t.created_by !== a.userId) return false
  if (a.canCreateAny) return true
  return t.assigned_to === a.userId && !!t.service_case_id
}
