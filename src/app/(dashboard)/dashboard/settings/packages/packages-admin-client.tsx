'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  deleteOptionAction,
  deletePackageAction,
  listAllPackagesAction,
  listOptionsForPackageAction,
  listTextBlocksAction,
  upsertOptionAction,
  upsertPackageAction,
  upsertTextBlockAction,
} from '@/lib/actions/sales-engine'
import type {
  PackageOptionRow,
  SalesPackageRow,
  SalesTextBlockRow,
} from '@/types/sales-engine.types'

const fmtAmount = (n: number) =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n)

const JOB_TYPES = ['solar', 'service', 'installation', 'project', 'general']

export function PackagesAdminClient({
  initialPackages,
  initialBlocks,
}: {
  initialPackages: SalesPackageRow[]
  initialBlocks: SalesTextBlockRow[]
}) {
  const [packages, setPackages] = useState<SalesPackageRow[]>(initialPackages)
  const [blocks, setBlocks] = useState<SalesTextBlockRow[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(initialPackages[0]?.id ?? null)
  const [busy, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const refreshPackages = async () => setPackages(await listAllPackagesAction())
  const refreshBlocks = async () => setBlocks(await listTextBlocksAction())

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 4000)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pakker & tilvalg</h1>
        <p className="text-xs text-gray-500">Admin-only. Ændringer gemmes direkte i DB.</p>
      </div>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 ${
          msg.ok ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                 : 'bg-red-50 text-red-900 ring-1 ring-red-200'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <div className="bg-white rounded-lg ring-1 ring-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Pakker</h2>
            <Button size="sm" variant="outline" onClick={() =>
              startTransition(async () => {
                const r = await upsertPackageAction({
                  name: 'Ny pakke',
                  job_type: 'solar',
                  base_price: 0,
                  is_active: false,
                })
                if (r.ok && r.data) { await refreshPackages(); setSelectedId(r.data.id); flash(true, r.message) }
                else flash(false, r.message)
              })
            } disabled={busy}>+ Ny</Button>
          </div>
          <ul className="space-y-1">
            {packages.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                    selectedId === p.id ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">{p.name}</span>
                  <div className="text-xs text-gray-500">
                    {p.job_type} · {fmtAmount(Number(p.base_price))} {p.is_active ? '' : '· inaktiv'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {selectedId ? (
            <PackageEditor
              key={selectedId}
              pkg={packages.find((p) => p.id === selectedId)!}
              busy={busy}
              startTransition={startTransition}
              flash={flash}
              onChanged={refreshPackages}
              onDeleted={() => { setSelectedId(null); refreshPackages() }}
            />
          ) : (
            <div className="bg-white rounded-lg ring-1 ring-gray-200 p-6 text-sm text-gray-500">
              Vælg en pakke i listen til venstre.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <h2 className="text-sm font-semibold mb-2">Standardtekster (intro / afslutning)</h2>
        <div className="space-y-3">
          {blocks.map((b) => (
            <BlockEditor
              key={b.id}
              block={b}
              busy={busy}
              startTransition={startTransition}
              flash={flash}
              onChanged={refreshBlocks}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Package editor (name, prices, text + options)
// =====================================================

function PackageEditor({
  pkg, busy, startTransition, flash, onChanged, onDeleted,
}: {
  pkg: SalesPackageRow
  busy: boolean
  startTransition: (cb: () => void) => void
  flash: (ok: boolean, text: string) => void
  onChanged: () => Promise<void>
  onDeleted: () => void
}) {
  const [name, setName] = useState(pkg.name)
  const [jobType, setJobType] = useState(pkg.job_type)
  const [basePrice, setBasePrice] = useState(String(pkg.base_price ?? 0))
  const [shortSummary, setShortSummary] = useState(pkg.short_summary ?? '')
  const [description, setDescription] = useState(pkg.description ?? '')
  const [standardText, setStandardText] = useState(pkg.standard_text ?? '')
  const [isActive, setIsActive] = useState(pkg.is_active)
  const [sortOrder, setSortOrder] = useState(String(pkg.sort_order ?? 0))
  const [options, setOptions] = useState<PackageOptionRow[]>([])

  useEffect(() => {
    listOptionsForPackageAction(pkg.id).then(setOptions).catch(() => setOptions([]))
  }, [pkg.id])

  const save = () => startTransition(async () => {
    const r = await upsertPackageAction({
      id: pkg.id,
      name,
      job_type: jobType,
      base_price: Number(basePrice) || 0,
      short_summary: shortSummary || null,
      description: description || null,
      standard_text: standardText || null,
      is_active: isActive,
      sort_order: Number(sortOrder) || 0,
    })
    if (r.ok) { await onChanged(); flash(true, r.message) } else flash(false, r.message)
  })

  const remove = () => startTransition(async () => {
    if (!confirm(`Slet pakke "${pkg.name}"? Tilknyttede tilvalg slettes også.`)) return
    const r = await deletePackageAction(pkg.id)
    if (r.ok) { onDeleted(); flash(true, r.message) } else flash(false, r.message)
  })

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Navn">
          <input className="w-full border rounded px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Job-type">
          <select className="w-full border rounded px-2 py-1.5 text-sm" value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {JOB_TYPES.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </Field>
        <Field label="Basispris (DKK)">
          <input type="number" min="0" className="w-full border rounded px-2 py-1.5 text-sm" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        </Field>
        <Field label="Sortering">
          <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        <Field label="Kort beskrivelse (vises i package picker)">
          <input className="w-full border rounded px-2 py-1.5 text-sm" value={shortSummary} onChange={(e) => setShortSummary(e.target.value)} />
        </Field>
        <Field label="Aktiv">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        </Field>
      </div>

      <Field label="Beskrivelse (intern note)">
        <textarea rows={2} className="w-full border rounded px-2 py-1.5 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Field label="Standardtekst (indsættes i tilbud)">
        <textarea rows={5} className="w-full border rounded px-2 py-1.5 text-sm font-sans" value={standardText} onChange={(e) => setStandardText(e.target.value)} />
      </Field>

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>Gem pakke</Button>
        <Button variant="outline" onClick={remove} disabled={busy}>Slet pakke</Button>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Tilvalg</h3>
          <Button size="sm" variant="outline"
            onClick={() => startTransition(async () => {
              const r = await upsertOptionAction({
                package_id: pkg.id,
                name: 'Nyt tilvalg',
                price: 0,
                affects_materials: false,
                is_active: true,
              })
              if (r.ok) {
                setOptions(await listOptionsForPackageAction(pkg.id))
                flash(true, r.message)
              } else flash(false, r.message)
            })}
            disabled={busy}>+ Nyt tilvalg</Button>
        </div>
        <div className="space-y-2">
          {options.length === 0 && <p className="text-xs text-gray-400">Ingen tilvalg endnu.</p>}
          {options.map((o) => (
            <OptionRow key={o.id} option={o} busy={busy}
              startTransition={startTransition}
              flash={flash}
              onChanged={async () => setOptions(await listOptionsForPackageAction(pkg.id))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function OptionRow({
  option, busy, startTransition, flash, onChanged,
}: {
  option: PackageOptionRow
  busy: boolean
  startTransition: (cb: () => void) => void
  flash: (ok: boolean, text: string) => void
  onChanged: () => Promise<void>
}) {
  const [name, setName] = useState(option.name)
  const [price, setPrice] = useState(String(option.price))
  const [description, setDescription] = useState(option.description ?? '')
  const [offerText, setOfferText] = useState(option.offer_text ?? '')
  const [affects, setAffects] = useState(option.affects_materials)
  const [isActive, setIsActive] = useState(option.is_active)

  return (
    <div className="border rounded p-2 grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-start">
      <input className="border rounded px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" className="border rounded px-2 py-1 text-sm" value={price} onChange={(e) => setPrice(e.target.value)} />
      <input className="border rounded px-2 py-1 text-sm" placeholder="Tekst i tilbud" value={offerText} onChange={(e) => setOfferText(e.target.value)} />
      <div className="flex flex-col gap-1 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={affects} onChange={(e) => setAffects(e.target.checked)} /> BOM</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktiv</label>
      </div>
      <input className="md:col-span-3 border rounded px-2 py-1 text-sm" placeholder="Note (intern)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="md:col-span-1 flex gap-2">
        <Button size="sm"
          onClick={() => startTransition(async () => {
            const r = await upsertOptionAction({
              id: option.id,
              package_id: option.package_id,
              name,
              price: Number(price) || 0,
              description: description || null,
              offer_text: offerText || null,
              affects_materials: affects,
              is_active: isActive,
            })
            if (r.ok) { await onChanged(); flash(true, r.message) } else flash(false, r.message)
          })}
          disabled={busy}>Gem</Button>
        <Button size="sm" variant="outline"
          onClick={() => startTransition(async () => {
            if (!confirm(`Slet tilvalg "${option.name}"?`)) return
            const r = await deleteOptionAction(option.id)
            if (r.ok) { await onChanged(); flash(true, r.message) } else flash(false, r.message)
          })}
          disabled={busy}>Slet</Button>
      </div>
    </div>
  )
}

function BlockEditor({
  block, busy, startTransition, flash, onChanged,
}: {
  block: SalesTextBlockRow
  busy: boolean
  startTransition: (cb: () => void) => void
  flash: (ok: boolean, text: string) => void
  onChanged: () => Promise<void>
}) {
  const [content, setContent] = useState(block.content)
  return (
    <div className="border rounded p-3">
      <div className="text-xs font-medium mb-1">{block.name} <code className="text-gray-500">({block.slug})</code></div>
      <textarea rows={4} className="w-full border rounded px-2 py-1.5 text-sm" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="mt-2 flex justify-end">
        <Button size="sm"
          onClick={() => startTransition(async () => {
            const r = await upsertTextBlockAction({ slug: block.slug, name: block.name, content })
            if (r.ok) { await onChanged(); flash(true, r.message) } else flash(false, r.message)
          })}
          disabled={busy}>Gem tekst</Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children}
    </label>
  )
}
