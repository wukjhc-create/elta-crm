import { Lock } from 'lucide-react'

interface NoAccessProps {
  permission?: string
  message?: string
}

/**
 * Sprint 7D — graceful no-access UI.
 *
 * Vises naar en bruger uden den noedvendige permission tilgaar en
 * page direkte via URL. Server-actions returnerer fejl, men siden
 * skal render noget brugbart i stedet for tom liste.
 */
export function NoAccess({ permission, message }: NoAccessProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <Lock className="h-6 w-6 text-gray-500" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          Du har ikke adgang
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {message ??
            'Din rolle har ikke tilladelse til at se denne side. Kontakt en administrator hvis du mener det er en fejl.'}
        </p>
        {permission && (
          <p className="mt-3 text-xs text-gray-400">
            Manglende: <code className="font-mono">{permission}</code>
          </p>
        )}
      </div>
    </div>
  )
}
