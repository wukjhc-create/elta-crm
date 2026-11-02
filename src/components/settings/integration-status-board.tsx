import { isGraphConfigured } from '@/lib/services/microsoft-graph'
import { integrationBoard, type IntegrationMode } from '@/lib/integrations/status-board'

const MODE: Record<IntegrationMode, string> = {
  off: 'FRA',
  test: 'TEST',
  active: 'AKTIV',
  error: 'FEJL',
}

const CLS: Record<IntegrationMode, string> = {
  off: 'bg-gray-100 text-gray-700',
  test: 'bg-amber-100 text-amber-900',
  active: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
}

/** Read-only. Ændrer ingen flag og viser ingen hemmeligheder. */
export function IntegrationStatusBoard() {
  const rows = integrationBoard(process.env, { graphConfigured: isGraphConfigured() })
  return (
    <section className="rounded-lg border bg-white p-4" data-testid="integration-status-board">
      <h2 className="text-lg font-semibold text-gray-900">Integrationsstatus</h2>
      <p className="mt-1 text-sm text-gray-600">Kill-switches læses fra miljøet. De kan ikke tændes her, og nøgler vises ikke.</p>
      <ul className="mt-4 divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-4 py-3 text-sm">
            <div>
              <p className="font-medium text-gray-900">{row.label}</p>
              <p className="text-gray-600">{row.detail}</p>
              <p className="text-xs text-gray-500">Kontakt: {row.killSwitch}</p>
            </div>
            <span className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${CLS[row.mode]}`}>{MODE[row.mode]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
