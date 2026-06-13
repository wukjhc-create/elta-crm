'use client'

/**
 * Sprint Ø2 ERP — READ-ONLY sektioner til medarbejderkortet.
 * Alle komponenter er selv-hentende og viser KUN data (ingen redigering —
 * al redigering sker på Rediger medarbejder-siden).
 */

import { useState, useEffect } from 'react'
import {
  ShieldCheck, ShieldOff, KeyRound, Clock, Wrench, Award, History, AlertTriangle,
} from 'lucide-react'
import { getEmployeeLoginStatus, type EmployeeLoginStatus } from '@/lib/actions/employee-login'
import { listEmployeeOvertimeRates } from '@/lib/actions/employee-overtime-rates'
import { listEquipment } from '@/lib/actions/employee-equipment'
import { listCertificates } from '@/lib/actions/employee-certificates'
import { listEmployeeEvents } from '@/lib/actions/employee-events'
import {
  certificateStatus,
  EQUIPMENT_CATEGORY_OPTIONS, EQUIPMENT_STATUS_OPTIONS, CERTIFICATE_CATEGORY_OPTIONS,
  type EmployeeOvertimeRate, type EmployeeEquipment, type EmployeeCertificate, type EmployeeEvent,
} from '@/types/employees.types'

const dkk = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 2 }).format(n)
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
const dt = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s); if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('da-DK', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const eqCat = new Map(EQUIPMENT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]))
const eqStat = new Map(EQUIPMENT_STATUS_OPTIONS.map((o) => [o.value, o.label]))
const certCat = new Map(CERTIFICATE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]))

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-500">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm border-b last:border-b-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-900 text-right">{v}</span>
    </div>
  )
}

// ---------------- Badges ----------------
export function EmployeeProfileBadges({ employeeId, employeeActive }: { employeeId: string; employeeActive: boolean }) {
  const [login, setLogin] = useState<EmployeeLoginStatus | null>(null)
  const [certs, setCerts] = useState<EmployeeCertificate[]>([])
  const [equip, setEquip] = useState<EmployeeEquipment[]>([])
  const [ot, setOt] = useState<EmployeeOvertimeRate[]>([])
  useEffect(() => {
    getEmployeeLoginStatus(employeeId).then((r) => r.success && r.data && setLogin(r.data))
    listCertificates(employeeId).then((r) => r.success && r.data && setCerts(r.data))
    listEquipment(employeeId).then((r) => r.success && r.data && setEquip(r.data))
    listEmployeeOvertimeRates(employeeId).then((r) => r.success && r.data && setOt(r.data))
  }, [employeeId])

  const certWarn = certs.some((c) => !c.archived && ['expiring', 'expired'].includes(certificateStatus(c.expires_date)))
  const issued = equip.some((e) => e.status === 'udleveret')
  const otActive = ot.some((r) => r.is_active)
  const loginDeact = login?.has_login && login.is_active === false

  const B = ({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'info'; children: React.ReactNode }) => {
    const cls = tone === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : tone === 'warn' ? 'bg-red-50 text-red-700 ring-red-200'
      : tone === 'info' ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : 'bg-gray-50 text-gray-600 ring-gray-200'
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ring-1 ${cls}`}>{children}</span>
  }
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t">
      {!employeeActive && <B tone="warn"><AlertTriangle className="w-3.5 h-3.5" />Medarbejder inaktiv</B>}
      {login?.has_login ? <B tone="ok"><ShieldCheck className="w-3.5 h-3.5" />Har login</B> : <B tone="muted"><ShieldOff className="w-3.5 h-3.5" />Intet login</B>}
      {loginDeact && <B tone="warn"><ShieldOff className="w-3.5 h-3.5" />Login deaktiveret</B>}
      {certWarn && <B tone="warn"><Award className="w-3.5 h-3.5" />Certifikat udløber</B>}
      {issued && <B tone="info"><Wrench className="w-3.5 h-3.5" />Udstyr udleveret</B>}
      {otActive && <B tone="ok"><Clock className="w-3.5 h-3.5" />Overtidssatser aktiv</B>}
    </div>
  )
}

// ---------------- Login (read-only) ----------------
export function EmployeeLoginSummary({ employeeId }: { employeeId: string }) {
  const [s, setS] = useState<EmployeeLoginStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { getEmployeeLoginStatus(employeeId).then((r) => { if (r.success && r.data) setS(r.data); setLoaded(true) }) }, [employeeId])
  return (
    <Card icon={<KeyRound className="w-4 h-4" />} title="Login & adgang">
      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : !s?.has_login ? (
        <p className="text-sm text-gray-500">Ingen login knyttet. Knyt/inviter på Rediger medarbejder-siden.</p>
      ) : (
        <>
          {s.is_active === false && (
            <div className="mb-2 flex items-center gap-2 text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded p-2">
              <AlertTriangle className="w-4 h-4" /> Login er deaktiveret — medarbejderen kan ikke logge ind.
            </div>
          )}
          <KV k="Login-email" v={s.email ?? '—'} />
          <KV k="Adgangsrolle" v={s.auth_role ?? '—'} />
          <KV k="Status" v={s.is_active === false ? <span className="text-red-700">Deaktiveret</span> : <span className="text-emerald-700">Aktiv</span>} />
          <KV k="Seneste login" v={dt(s.last_sign_in_at)} />
          <KV k="Oprettet" v={dt(s.created_at)} />
        </>
      )}
    </Card>
  )
}

// ---------------- Overtidssatser (read-only) ----------------
export function EmployeeOvertimeRatesView({ employeeId }: { employeeId: string }) {
  const [rates, setRates] = useState<EmployeeOvertimeRate[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { listEmployeeOvertimeRates(employeeId).then((r) => { if (r.success && r.data) setRates(r.data); setLoaded(true) }) }, [employeeId])
  return (
    <Card icon={<Clock className="w-4 h-4" />} title="Overtidssatser">
      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : rates.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen satser. Oprettes/redigeres på Rediger medarbejder-siden.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-gray-500 text-left border-b">
            <th className="py-1 pr-2 font-medium">Sats</th><th className="py-1 px-2 text-right font-medium">Faktor</th>
            <th className="py-1 px-2 text-right font-medium">Kost</th><th className="py-1 px-2 text-right font-medium">Salg</th>
            <th className="py-1 pl-2 text-center font-medium">Aktiv</th>
          </tr></thead>
          <tbody className="divide-y">
            {rates.map((r) => (
              <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                <td className="py-1 pr-2 font-medium">{r.name}</td>
                <td className="py-1 px-2 text-right tabular-nums">{r.multiplier}×</td>
                <td className="py-1 px-2 text-right tabular-nums">{dkk(r.cost_rate)}</td>
                <td className="py-1 px-2 text-right tabular-nums">{dkk(r.sale_rate)}</td>
                <td className="py-1 pl-2 text-center">{r.is_active ? 'Ja' : 'Nej'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

// ---------------- Udstyr (read-only) ----------------
export function EmployeeEquipmentView({ employeeId }: { employeeId: string }) {
  const [items, setItems] = useState<EmployeeEquipment[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { listEquipment(employeeId).then((r) => { if (r.success && r.data) setItems(r.data); setLoaded(true) }) }, [employeeId])
  const statusTone = (s: string) => s === 'udleveret' ? 'text-emerald-700' : s === 'returneret' ? 'text-gray-500' : 'text-red-700'
  return (
    <Card icon={<Wrench className="w-4 h-4" />} title="Udstyr">
      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : items.length === 0 ? (
        <p className="text-sm text-gray-500">Intet udstyr registreret.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-gray-500 text-left border-b">
            <th className="py-1 pr-2 font-medium">Udstyr</th><th className="py-1 px-2 font-medium">Kategori</th>
            <th className="py-1 px-2 font-medium">Serienr.</th><th className="py-1 px-2 font-medium">Udleveret</th>
            <th className="py-1 pl-2 font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y">
            {items.map((e) => (
              <tr key={e.id}>
                <td className="py-1 pr-2 font-medium">{e.name}</td>
                <td className="py-1 px-2">{eqCat.get(e.category) ?? e.category}</td>
                <td className="py-1 px-2 font-mono text-xs">{e.serial_number ?? '—'}</td>
                <td className="py-1 px-2">{day(e.issued_date)}</td>
                <td className={`py-1 pl-2 ${statusTone(e.status)}`}>{eqStat.get(e.status) ?? e.status}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Card>
  )
}

// ---------------- Certifikater (read-only m. udløbs-fremhævning) ----------------
export function EmployeeCertificatesView({ employeeId }: { employeeId: string }) {
  const [items, setItems] = useState<EmployeeCertificate[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { listCertificates(employeeId).then((r) => { if (r.success && r.data) setItems(r.data); setLoaded(true) }) }, [employeeId])
  const active = items.filter((c) => !c.archived)
  return (
    <Card icon={<Award className="w-4 h-4" />} title="Certifikater & kompetencer">
      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : active.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen certifikater registreret.</p>
      ) : (
        <div className="space-y-1.5">
          {active.map((c) => {
            const st = certificateStatus(c.expires_date)
            const tone = st === 'expired' ? 'bg-red-50 ring-red-200' : st === 'expiring' ? 'bg-amber-50 ring-amber-200' : 'bg-gray-50 ring-gray-200'
            const badge = st === 'expired' ? <span className="text-red-700 font-medium">Udløbet</span>
              : st === 'expiring' ? <span className="text-amber-700 font-medium">Udløber snart</span>
              : st === 'valid' ? <span className="text-emerald-700">Gyldigt</span> : <span className="text-gray-500">Ingen udløb</span>
            return (
              <div key={c.id} className={`flex flex-wrap items-center justify-between gap-2 rounded ring-1 px-3 py-2 text-sm ${tone}`}>
                <div className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-500"> · {certCat.get(c.category) ?? c.category}{c.issuer ? ` · ${c.issuer}` : ''}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">Udløb: {day(c.expires_date)}</span>
                  {badge}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------------- Historik (read-only) ----------------
export function EmployeeHistoryView({ employeeId }: { employeeId: string }) {
  const [events, setEvents] = useState<EmployeeEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { listEmployeeEvents(employeeId).then((r) => { if (r.success && r.data) setEvents(r.data); setLoaded(true) }) }, [employeeId])
  return (
    <Card icon={<History className="w-4 h-4" />} title="Historik">
      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : events.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen registrerede hændelser endnu.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex gap-3 text-sm border-b last:border-b-0 pb-2">
              <span className="text-xs text-gray-400 whitespace-nowrap w-32 shrink-0">{dt(ev.created_at)}</span>
              <div className="min-w-0">
                <span className="font-medium text-gray-900">{ev.title}</span>
                {ev.description && <p className="text-xs text-gray-500">{ev.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
