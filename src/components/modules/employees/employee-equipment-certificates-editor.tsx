'use client'

/**
 * Sprint Ø2 ERP — interaktive editorer (Rediger medarbejder-siden).
 * Udstyr + certifikater: opret/rediger/status/slet.
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import { Plus, Trash2, Check, Wrench, Award } from 'lucide-react'
import {
  listEquipment, createEquipment, updateEquipment, setEquipmentStatus, deleteEquipment,
} from '@/lib/actions/employee-equipment'
import {
  listCertificates, createCertificate, updateCertificate, deleteCertificate,
} from '@/lib/actions/employee-certificates'
import {
  EQUIPMENT_CATEGORY_OPTIONS, EQUIPMENT_STATUS_OPTIONS, CERTIFICATE_CATEGORY_OPTIONS,
  certificateStatus,
  type EmployeeEquipment, type EmployeeCertificate,
  type EquipmentCategory, type EquipmentStatus, type CertificateCategory,
} from '@/types/employees.types'

const inp = 'w-full border rounded px-2 py-1 text-sm'
type Res = { success: boolean; error?: string }

function useRunner(reload: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = useCallback((fn: () => Promise<Res>) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.success) setError(r.error ?? 'Handlingen fejlede')
      await reload()
    })
  }, [reload])
  return { error, pending, run }
}

// ============================ UDSTYR ============================
export function EmployeeEquipmentEditor({ employeeId }: { employeeId: string }) {
  const [items, setItems] = useState<EmployeeEquipment[]>([])
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    const r = await listEquipment(employeeId)
    if (r.success && r.data) setItems(r.data)
    setLoaded(true)
  }, [employeeId])
  useEffect(() => { reload() }, [reload])
  const { error, pending, run } = useRunner(reload)

  const [name, setName] = useState('')
  const [cat, setCat] = useState<EquipmentCategory>('værktøj')
  const [serial, setSerial] = useState('')
  const [issued, setIssued] = useState('')

  return (
    <section className="bg-white rounded-lg border p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-gray-500" /><h2 className="text-base font-semibold">Udstyr</h2></div>
      {error && <div className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded p-2">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end bg-gray-50 rounded p-2">
        <label className="block"><span className="text-[11px] text-gray-500">Navn *</span><input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-gray-500">Kategori</span>
          <select className={inp} value={cat} onChange={(e) => setCat(e.target.value as EquipmentCategory)}>
            {EQUIPMENT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></label>
        <label className="block"><span className="text-[11px] text-gray-500">Serienr.</span><input className={inp} value={serial} onChange={(e) => setSerial(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-gray-500">Udleveret</span><input type="date" className={inp} value={issued} onChange={(e) => setIssued(e.target.value)} /></label>
        <button disabled={pending || !name.trim()} onClick={() => run(async () => {
          const r = await createEquipment(employeeId, { name, category: cat, serial_number: serial || null, issued_date: issued || null })
          if (r.success) { setName(''); setSerial(''); setIssued('') }
          return r
        })} className="h-8 inline-flex items-center justify-center gap-1 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="w-4 h-4" />Tilføj</button>
      </div>

      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : items.length === 0 ? (
        <p className="text-sm text-gray-500">Intet udstyr endnu.</p>
      ) : (
        <div className="space-y-2">{items.map((e) => <EquipRow key={e.id} item={e} pending={pending} run={run} />)}</div>
      )}
    </section>
  )
}

function EquipRow({ item, pending, run }: { item: EmployeeEquipment; pending: boolean; run: (fn: () => Promise<Res>) => void }) {
  const [serial, setSerial] = useState(item.serial_number ?? '')
  const [asset, setAsset] = useState(item.asset_number ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const dirty = serial !== (item.serial_number ?? '') || asset !== (item.asset_number ?? '') || note !== (item.note ?? '')
  return (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center border rounded p-2 text-sm">
      <div className="font-medium">{item.name}<div className="text-[11px] text-gray-500">{EQUIPMENT_CATEGORY_OPTIONS.find((o) => o.value === item.category)?.label}</div></div>
      <input className={inp} placeholder="Serienr." value={serial} onChange={(e) => setSerial(e.target.value)} />
      <input className={inp} placeholder="Assetnr." value={asset} onChange={(e) => setAsset(e.target.value)} />
      <input className={inp} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <select className={inp} value={item.status} disabled={pending}
        onChange={(e) => run(() => setEquipmentStatus(item.id, e.target.value as EquipmentStatus))}>
        {EQUIPMENT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="flex items-center gap-1 justify-end">
        <button disabled={pending || !dirty} onClick={() => run(() => updateEquipment(item.id, { serial_number: serial || null, asset_number: asset || null, note: note || null }))}
          className="text-xs px-2 py-1 rounded bg-gray-900 text-white disabled:opacity-30"><Check className="w-3.5 h-3.5" /></button>
        <button disabled={pending} onClick={() => { if (window.confirm('Slet udstyr?')) run(() => deleteEquipment(item.id)) }}
          className="text-xs px-2 py-1 rounded border text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

// ============================ CERTIFIKATER ============================
export function EmployeeCertificatesEditor({ employeeId }: { employeeId: string }) {
  const [items, setItems] = useState<EmployeeCertificate[]>([])
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    const r = await listCertificates(employeeId)
    if (r.success && r.data) setItems(r.data)
    setLoaded(true)
  }, [employeeId])
  useEffect(() => { reload() }, [reload])
  const { error, pending, run } = useRunner(reload)

  const [name, setName] = useState('')
  const [cat, setCat] = useState<CertificateCategory>('kursus')
  const [issuer, setIssuer] = useState('')
  const [issued, setIssued] = useState('')
  const [expires, setExpires] = useState('')

  return (
    <section className="bg-white rounded-lg border p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-2"><Award className="w-4 h-4 text-gray-500" /><h2 className="text-base font-semibold">Certifikater & kompetencer</h2></div>
      {error && <div className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded p-2">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end bg-gray-50 rounded p-2">
        <label className="block"><span className="text-[11px] text-gray-500">Navn *</span><input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-gray-500">Kategori</span>
          <select className={inp} value={cat} onChange={(e) => setCat(e.target.value as CertificateCategory)}>
            {CERTIFICATE_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></label>
        <label className="block"><span className="text-[11px] text-gray-500">Udsteder</span><input className={inp} value={issuer} onChange={(e) => setIssuer(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-gray-500">Udstedt</span><input type="date" className={inp} value={issued} onChange={(e) => setIssued(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-gray-500">Udløber</span><input type="date" className={inp} value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <button disabled={pending || !name.trim()} onClick={() => run(async () => {
          const r = await createCertificate(employeeId, { name, category: cat, issuer: issuer || null, issued_date: issued || null, expires_date: expires || null })
          if (r.success) { setName(''); setIssuer(''); setIssued(''); setExpires('') }
          return r
        })} className="h-8 inline-flex items-center justify-center gap-1 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="w-4 h-4" />Tilføj</button>
      </div>

      {!loaded ? <p className="text-sm text-gray-400">Henter…</p> : items.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen certifikater endnu.</p>
      ) : (
        <div className="space-y-2">{items.map((c) => <CertRow key={c.id} item={c} pending={pending} run={run} />)}</div>
      )}
    </section>
  )
}

function CertRow({ item, pending, run }: { item: EmployeeCertificate; pending: boolean; run: (fn: () => Promise<Res>) => void }) {
  const [issuer, setIssuer] = useState(item.issuer ?? '')
  const [issued, setIssued] = useState(item.issued_date?.slice(0, 10) ?? '')
  const [expires, setExpires] = useState(item.expires_date?.slice(0, 10) ?? '')
  const dirty = issuer !== (item.issuer ?? '') || issued !== (item.issued_date?.slice(0, 10) ?? '') || expires !== (item.expires_date?.slice(0, 10) ?? '')
  const st = certificateStatus(item.expires_date)
  const tone = st === 'expired' ? 'text-red-700' : st === 'expiring' ? 'text-amber-700' : 'text-gray-500'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center border rounded p-2 text-sm">
      <div className="font-medium">{item.name}<div className="text-[11px] text-gray-500">{CERTIFICATE_CATEGORY_OPTIONS.find((o) => o.value === item.category)?.label}</div></div>
      <input className={inp} placeholder="Udsteder" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
      <input type="date" className={inp} value={issued} onChange={(e) => setIssued(e.target.value)} />
      <input type="date" className={inp} value={expires} onChange={(e) => setExpires(e.target.value)} />
      <div className={`text-xs ${tone}`}>{st === 'expired' ? 'Udløbet' : st === 'expiring' ? 'Udløber snart' : st === 'valid' ? 'Gyldigt' : 'Ingen udløb'}</div>
      <div className="flex items-center gap-1 justify-end">
        <button disabled={pending || !dirty} onClick={() => run(() => updateCertificate(item.id, { issuer: issuer || null, issued_date: issued || null, expires_date: expires || null }))}
          className="text-xs px-2 py-1 rounded bg-gray-900 text-white disabled:opacity-30"><Check className="w-3.5 h-3.5" /></button>
        <button disabled={pending} onClick={() => { if (window.confirm('Slet certifikat?')) run(() => deleteCertificate(item.id)) }}
          className="text-xs px-2 py-1 rounded border text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}
