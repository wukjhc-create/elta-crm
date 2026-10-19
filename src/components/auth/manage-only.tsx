import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

/**
 * PM2-9 (rolle-review 2026-10-19): indstillingssider, man kan SE med settings.view, men kun GEMME med settings.manage.
 * Uden ret vises formularen låst (<fieldset disabled> deaktiverer alle felter og knapper), så man aldrig udfylder noget,
 * serveren afviser. Med ret vises børnene uændret.
 */
export function ManageOnly({ canManage, children, what = 'disse indstillinger' }: { canManage: boolean; children: ReactNode; what?: string }) {
  if (canManage) return <>{children}</>
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-900">
        <Lock className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Kun administratorer kan ændre {what}. Du kan se dem, men ikke gemme.</span>
      </div>
      <fieldset disabled className="contents" aria-disabled="true">
        {children}
      </fieldset>
    </div>
  )
}
