'use client'

/**
 * Sprint Ø2.2 — Login & adgang på medarbejderkortet.
 *
 * Viser login-status (har/ikke login, aktiv/inaktiv, adgangsrolle) og giver
 * admin handlinger: inviter bruger, knyt eksisterende bruger, aktivér/
 * deaktivér login, samt ændre ADGANGSROLLE (profiles.role — den autoritative
 * kilde til rettigheder; employees.role er kun fag-/HR-klassifikation).
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import { ShieldCheck, ShieldOff, UserPlus, Link2, KeyRound, Mail, RefreshCw, Copy, Check, TriangleAlert } from 'lucide-react'
import {
  getEmployeeLoginStatus,
  listLinkableProfiles,
  inviteEmployeeLogin,
  linkExistingProfile,
  setEmployeeLoginActive,
  setEmployeeAuthRole,
  sendEmployeeAccessEmail,
  getEmployeeSetPasswordLink,
  type EmployeeLoginStatus,
  type LinkableProfile,
} from '@/lib/actions/employee-login'
import type { UserRole } from '@/types/auth.types'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'serviceleder', label: 'Serviceleder' },
  { value: 'salg', label: 'Salg' },
  { value: 'bogholderi', label: 'Bogholderi' },
  { value: 'montør', label: 'Montør' },
]

export function EmployeeLoginPanel({
  employeeId,
  employeeEmail,
}: {
  employeeId: string
  employeeEmail: string | null
}) {
  const [status, setStatus] = useState<EmployeeLoginStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [inviteRole, setInviteRole] = useState<UserRole>('montør')
  const [linkables, setLinkables] = useState<LinkableProfile[]>([])
  const [linkChoice, setLinkChoice] = useState<string>('')
  // Kopierbart sæt-kode-link (fallback / manuel udlevering). Behandles som en
  // adgangskode — vises kun on-demand.
  const [revealedLink, setRevealedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getEmployeeLoginStatus(employeeId)
    if (res.success && res.data) setStatus(res.data)
    else setError(res.error ?? 'Kunne ikke hente login-status')
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    load()
  }, [load])

  // Hent koblbare brugere når der ikke er login endnu.
  useEffect(() => {
    if (status && !status.has_login) {
      listLinkableProfiles().then((r) => {
        if (r.success && r.data) setLinkables(r.data)
      })
    }
  }, [status])

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        setInfo(okMsg)
        await load()
      } else {
        setError(res.error ?? 'Handlingen fejlede')
      }
    })
  }

  // Send invitation/nulstil-mail via vores egen mail. Kommer der et fallback-
  // link retur (mail ikke sat op / afsendelse fejlede), afsløres det så admin
  // kan udlevere det manuelt.
  const handleSendAccess = (mode: 'invite' | 'reset') => {
    setError(null)
    setInfo(null)
    setRevealedLink(null)
    startTransition(async () => {
      const res = await sendEmployeeAccessEmail(employeeId, mode)
      if (!res.success) {
        setError(res.error ?? 'Handlingen fejlede')
        return
      }
      if (res.data?.sent) {
        setInfo(mode === 'invite' ? 'Invitation sendt på mail.' : 'Nulstil-adgangskode sendt på mail.')
      } else {
        setInfo('Mail er ikke sat op — kopiér linket nedenfor og udlevér det sikkert til medarbejderen.')
        if (res.data?.link) setRevealedLink(res.data.link)
      }
      await load()
    })
  }

  const handleRevealLink = () => {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await getEmployeeSetPasswordLink(employeeId)
      if (res.success && res.data) {
        setRevealedLink(res.data.link)
      } else {
        setError(res.error ?? 'Kunne ikke generere link')
      }
    })
  }

  const handleCopy = async () => {
    if (!revealedLink) return
    await navigator.clipboard.writeText(revealedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold">Login & adgang</h3>
      </div>

      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded p-2">{error}</div>}
      {info && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded p-2">{info}</div>}

      {loading || !status ? (
        <p className="text-sm text-gray-400">Henter…</p>
      ) : status.has_login ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="ok" icon={<ShieldCheck className="w-3.5 h-3.5" />}>Har login</Badge>
            {status.is_active ? (
              <Badge tone="ok">Aktiv</Badge>
            ) : (
              <Badge tone="warn" icon={<ShieldOff className="w-3.5 h-3.5" />}>Inaktiv</Badge>
            )}
            {status.email && <span className="text-gray-500">{status.email}</span>}
          </div>

          {/* Adgangsrolle (autoritativ — profiles.role) */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-28">Adgangsrolle</label>
            <select
              className="text-sm border rounded px-2 py-1"
              value={status.auth_role ?? 'montør'}
              disabled={pending}
              onChange={(e) =>
                run(() => setEmployeeAuthRole(employeeId, e.target.value as UserRole), 'Adgangsrolle opdateret')
              }
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-gray-400">styrer rettigheder</span>
          </div>

          <div>
            {status.is_active ? (
              <button
                onClick={() => run(() => setEmployeeLoginActive(employeeId, false), 'Login deaktiveret')}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <ShieldOff className="w-4 h-4" /> Deaktivér login
              </button>
            ) : (
              <button
                onClick={() => run(() => setEmployeeLoginActive(employeeId, true), 'Login aktiveret')}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" /> Aktivér login
              </button>
            )}
          </div>

          {/* Adgang & invitation — gensend/nulstil + kopierbart fallback-link */}
          <div className="pt-3 border-t space-y-2">
            <p className="text-xs font-medium text-gray-500">Adgang & invitation</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleSendAccess('invite')}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" /> Gensend invitation
              </button>
              <button
                onClick={() => handleSendAccess('reset')}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                <Mail className="w-4 h-4" /> Send nulstil adgangskode
              </button>
              <button
                onClick={handleRevealLink}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" /> Vis sæt-kode-link
              </button>
            </div>

            {revealedLink && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-2">
                <p className="flex items-start gap-1.5 text-xs text-amber-800">
                  <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    <strong>Behandl dette link som en adgangskode.</strong> Del det kun sikkert
                    med medarbejderen. Linket er personligt og udløber efter kort tid.
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={revealedLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 text-xs font-mono border rounded px-2 py-1 bg-white text-gray-700"
                  />
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Kopieret' : 'Kopiér'}
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Invitation betyder, at medarbejderen selv sætter sin adgangskode via linket. Der
              vises ingen adgangskode her.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Badge tone="muted" icon={<ShieldOff className="w-3.5 h-3.5" />}>Har ikke login</Badge>

          {/* Inviter bruger */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 w-28">Inviter bruger</span>
            <select
              className="text-sm border rounded px-2 py-1"
              value={inviteRole}
              disabled={pending}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => run(() => inviteEmployeeLogin(employeeId, inviteRole), 'Invitation sendt')}
              disabled={pending || !employeeEmail}
              title={employeeEmail ? `Send invitation til ${employeeEmail}` : 'Medarbejderen mangler e-mail'}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" /> Inviter {employeeEmail ? `(${employeeEmail})` : ''}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            Invitation betyder, at medarbejderen selv sætter sin adgangskode via linket i mailen.
            Der vises ingen adgangskode her.
          </p>

          {/* Knyt eksisterende bruger */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 w-28">Knyt eksisterende</span>
            <select
              className="text-sm border rounded px-2 py-1 min-w-[200px]"
              value={linkChoice}
              disabled={pending || linkables.length === 0}
              onChange={(e) => setLinkChoice(e.target.value)}
            >
              <option value="">{linkables.length ? 'Vælg bruger…' : 'Ingen ledige brugere'}</option>
              {linkables.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.full_name || p.email || p.id)} {p.email ? `· ${p.email}` : ''} ({p.role})
                </option>
              ))}
            </select>
            <button
              onClick={() => run(() => linkExistingProfile(employeeId, linkChoice), 'Bruger knyttet')}
              disabled={pending || !linkChoice}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              <Link2 className="w-4 h-4" /> Knyt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode
  tone: 'ok' | 'warn' | 'muted'
  icon?: React.ReactNode
}) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : tone === 'warn'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-gray-50 text-gray-600 ring-gray-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ring-1 ${cls}`}>
      {icon}
      {children}
    </span>
  )
}
