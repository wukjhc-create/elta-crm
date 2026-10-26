'use server'

/**
 * PERM-1 fase 3 (klient): den indloggede brugers EFFEKTIVE rettigheder (rolle + overrides) til UI'et — menu, genveje,
 * knapper. Kun læsning af egne rettigheder; serveren håndhæver uafhængigt i hver action/side.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'

export async function getMyEffectivePermissionsAction(): Promise<string[] | null> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    return [...ctx.permissions]
  } catch {
    return null
  }
}
