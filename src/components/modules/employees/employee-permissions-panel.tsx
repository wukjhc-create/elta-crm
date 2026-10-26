'use client'

/**
 * PERM-1 fase 2 (Henrik 2026-10-26): Team → Medarbejder → Rettigheder. Kun for users.manage_roles (serveren håndhæver).
 * Enkel og grupperet: skabelon/basisrolle øverst, derefter otte sammenfoldelige grupper med effektiv status og kilde
 * (Rolle / Tildelt / Frataget) pr. rettighed. Hver tildeling/fratagelse kræver en begrundelse og auditeres på serveren.
 */
import { useEffect, useState, useTransition } from 'react'
import { Loader2, ShieldCheck, Check, Minus } from 'lucide-react'
import {
  getEmployeePermissionsAction,
  setEmployeePermissionAction,
  applyEmployeePermissionTemplateAction,
  resetEmployeePermissionsAction,
  type EmployeePermissionsView,
  type EmployeePermissionRow,
} from '@/lib/actions/employee-permissions'

const SOURCE_BADGE: Record<string, { text: string; cls: string }> = {
  role: { text: 'Rolle', cls: 'bg-gray-100 text-gray-700' },
  grant: { text: 'Ekstra adgang', cls: 'bg-emerald-100 text-emerald-800' },
  revoke: { text: 'Fjernet adgang', cls: 'bg-red-100 text-red-800' },
  none: { text: 'Ingen adgang', cls: 'bg-white text-gray-400 ring-1 ring-gray-200' },
}

export function EmployeePermissionsPanel({ employeeId }: { employeeId: string }) {
  const [view, setView] = useState<EmployeePermissionsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [tpl, setTpl] = useState('')
  // grupper forbliver åbne når visningen genindlæses efter en ændring
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set())
  const [pending, startTransition] = useTransition()

  const load = async () => {
    const res = await getEmployeePermissionsAction(employeeId)
    if (res.ok) { setView(res.data); setError(null); setTpl(res.data.template ?? '') } else setError(res.message)
  }
  useEffect(() => { void load() }, [employeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => startTransition(async () => {
    const r = await fn()
    setFlash({ ok: r.ok, text: r.message })
    setTimeout(() => setFlash(null), 6000)
    await load()
  })

  const change = (row: EmployeePermissionRow, effect: 'grant' | 'revoke' | null) => {
    let reason: string | null = null
    if (effect) {
      reason = window.prompt(`${effect === 'grant' ? 'Giv ekstra adgang' : 'Fjern adgangen'}: "${row.label}" — skriv en kort begrundelse:`)
      if (!reason || !reason.trim()) return
    } else if (!window.confirm(`Gendan rollens standard for "${row.label}"?`)) return
    run(() => setEmployeePermissionAction(employeeId, row.permission, effect, reason))
  }

  if (error) return <p className="text-sm text-red-800" data-testid="employee-permissions-error">{error}</p>
  if (!view) return <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Henter rettigheder…</div>

  const deviations = view.groups.reduce((a, g) => a + g.deviations, 0)
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 space-y-4" data-testid="employee-permissions-panel">
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-5 h-5 text-gray-700 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Rettigheder</h3>
          <p className="text-xs text-gray-700" data-testid="employee-permissions-summary">
            Grundrolle: <strong>{view.role}</strong>
            {' '}· Skabelon: <strong>{view.template ? (view.templates.find((t) => t.key === view.template)?.label ?? view.template) : 'ingen'}</strong>
          </p>
          <p className="text-xs text-gray-700">
            Effektiv adgang: <strong>{view.effectiveCount}</strong> rettigheder · {deviations === 0 ? 'følger grundrollen' : `${deviations} ændring${deviations === 1 ? '' : 'er'} i forhold til grundrollen`}
          </p>
          <p className="text-[11px] text-gray-500 mt-1" data-testid="employee-permissions-enforcement">
            Håndhævelse: app og API ✓ · database: følger grundrollen, indtil tabellerne er konverteret (ekstra adgang og
            fjernet adgang gælder i appen, ikke ved direkte databaseadgang).
          </p>
        </div>
      </div>

      {!view.overridesAvailable && (
        <p className="text-xs text-amber-900 bg-amber-50 rounded px-2 py-1">Individuelle rettigheder er ikke aktiveret i dette miljø endnu — kun rollens standard vises.</p>
      )}
      {flash && <p className={`text-xs rounded px-2 py-1 ${flash.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`} data-testid="employee-permissions-flash">{flash.text}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-700">
          Skabelon
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="block mt-1 px-2 py-1.5 border rounded text-sm" data-testid="employee-permissions-template">
            <option value="">Vælg…</option>
            {view.templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={!tpl || pending || !view.overridesAvailable} data-testid="employee-permissions-apply-template"
          onClick={() => { if (window.confirm('Anvend skabelonen? Basisrollen sættes, og alle nuværende afvigelser erstattes af skabelonens.')) run(() => applyEmployeePermissionTemplateAction(employeeId, tpl)) }}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Anvend skabelon</button>
        <button type="button" disabled={pending || deviations === 0 || !view.overridesAvailable} data-testid="employee-permissions-reset"
          onClick={() => { if (window.confirm(view.template ? 'Nulstil til skabelonen? Manuelle afvigelser fjernes.' : 'Fjern alle afvigelser? Rettighederne følger derefter rollen.')) run(() => resetEmployeePermissionsAction(employeeId)) }}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Nulstil til skabelon</button>
        {pending && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
      </div>

      <div className="divide-y rounded ring-1 ring-gray-200">
        {view.groups.map((g) => (
          <details key={g.key} className="group" data-testid={`employee-permissions-group-${g.key}`} open={openGroups.has(g.key)}
            onToggle={(e) => { const isOpen = (e.currentTarget as HTMLDetailsElement).open; setOpenGroups((prev) => { const n = new Set(prev); if (isOpen) n.add(g.key); else n.delete(g.key); return n }) }}>
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none text-sm">
              <span className="font-medium text-gray-900">{g.label}</span>
              <span className="text-xs text-gray-500">
                {g.rows.filter((r) => r.effective).length}/{g.rows.length}
                {g.deviations > 0 && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">{g.deviations} ændring{g.deviations === 1 ? '' : 'er'}</span>}
              </span>
            </summary>
            <ul className="px-3 pb-2 space-y-1">
              {g.rows.map((r) => (
                <li key={r.permission} className="flex flex-wrap items-center gap-2 text-sm py-1" data-testid={`perm-row-${r.permission}`}>
                  {r.effective ? <Check className="w-4 h-4 text-emerald-700" aria-label="har rettigheden" /> : <Minus className="w-4 h-4 text-gray-400" aria-label="har ikke rettigheden" />}
                  <span className="flex-1 min-w-[12rem] text-gray-800" title={r.permission}>{r.label}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${SOURCE_BADGE[r.source]?.cls ?? ''}`} data-testid={`perm-source-${r.permission}`}>{SOURCE_BADGE[r.source]?.text ?? r.source}</span>
                  {r.override && (
                    <span className="text-[11px] text-gray-500 w-full sm:w-auto">
                      {r.override.source === 'template' ? 'fra skabelonen' : 'tilføjet manuelt'}{r.override.reason ? ` · ${r.override.reason}` : ''}
                    </span>
                  )}
                  {view.overridesAvailable && (r.override
                    ? <button type="button" disabled={pending} onClick={() => change(r, null)} className="text-xs text-gray-700 underline" data-testid={`perm-clear-${r.permission}`}>Gendan rollens standard</button>
                    : r.effective
                      ? <button type="button" disabled={pending} onClick={() => change(r, 'revoke')} className="text-xs text-red-700 underline" data-testid={`perm-revoke-${r.permission}`}>Fjern adgang</button>
                      : <button type="button" disabled={pending} onClick={() => change(r, 'grant')} className="text-xs text-emerald-700 underline" data-testid={`perm-grant-${r.permission}`}>Giv adgang</button>)}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
