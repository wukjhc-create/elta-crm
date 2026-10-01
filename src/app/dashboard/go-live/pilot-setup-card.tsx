/**
 * "Opsætning før pilot" — skrivebeskyttet tjekliste (kun admin). Viser hvad der
 * mangler i drift-opsætningen og hvor det rettes. Ingen handlinger, ingen værdier.
 */

import Link from 'next/link'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { getPilotSetupChecklistAction } from '@/lib/actions/pilot-setup'

export async function PilotSetupCard() {
  const res = await getPilotSetupChecklistAction()
  if (!res.ok) return null
  const missing = res.items.filter((i) => !i.ok).length
  return (
    <section className="bg-white rounded-lg border p-4 sm:p-5 mb-6" data-testid="pilot-setup">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold">Opsætning før pilot</h2>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded ${missing ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
          {missing ? `${missing} mangler` : 'alt på plads'}
        </span>
      </div>
      <ul className="divide-y">
        {res.items.map((i) => (
          <li key={i.key} className="py-2 flex items-start gap-2" data-testid={`pilot-setup-${i.key}`} data-ok={i.ok ? 'ja' : 'nej'}>
            {i.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{i.label}</div>
              <div className="text-xs text-gray-600">{i.detail}</div>
              {!i.ok && (
                <div className="text-xs text-gray-500 mt-0.5">
                  Ret: {i.href ? <Link href={i.href} className="text-emerald-700 hover:underline">{i.fixHint}</Link> : i.fixHint}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
