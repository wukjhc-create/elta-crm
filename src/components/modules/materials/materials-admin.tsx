'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, Search, Link as LinkIcon, Unlink, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  bindMaterialToSupplier,
  unbindMaterialSupplier,
  listMaterialsForAdmin,
  listMaterialCategories,
  searchSupplierProductsForBinding,
  type MaterialAdminRow,
  type SupplierProductPickerRow,
} from '@/lib/actions/materials'
import { formatCurrency } from '@/lib/utils/format'

export function MaterialsAdmin() {
  const toast = useToast()
  const [rows, setRows] = useState<MaterialAdminRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterUnbound, setFilterUnbound] = useState(false)
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [bindingFor, setBindingFor] = useState<MaterialAdminRow | null>(null)

  const load = useMemo(
    () => async () => {
      setLoading(true)
      const [list, cats] = await Promise.all([
        listMaterialsForAdmin({
          category: filterCategory || null,
          unboundOnly: filterUnbound,
          search: search || null,
        }),
        listMaterialCategories(),
      ])
      setRows(list)
      setCategories(cats)
      setLoading(false)
    },
    [filterCategory, filterUnbound, search]
  )

  useEffect(() => {
    load()
  }, [load])

  const handleUnbind = (row: MaterialAdminRow) => {
    if (!row.slug) return
    if (!confirm(`Fjern leverandør-binding fra "${row.name}"?`)) return
    startTransition(async () => {
      const res = await unbindMaterialSupplier(row.slug as string)
      if (res.success) {
        toast.success('Binding fjernet')
        load()
      } else {
        toast.error('Kunne ikke fjerne', res.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg i material name eller slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border rounded px-3 py-2 text-sm bg-white"
        >
          <option value="">Alle kategorier</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filterUnbound}
            onChange={(e) => setFilterUnbound(e.target.checked)}
          />
          Vis kun ubundne
        </label>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={pending}>
          <RefreshCw className={`w-4 h-4 mr-1 ${pending ? 'animate-spin' : ''}`} />
          Opdater
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-sm text-gray-500">
          Ingen materialer matcher filteret.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2">Sektion</th>
                <th className="px-3 py-2">Standard</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Leverandør</th>
                <th className="px-3 py-2">Pris</th>
                <th className="px-3 py-2">Brug</th>
                <th className="px-3 py-2 text-right">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.category}</td>
                  <td className="px-3 py-2 text-gray-700">{r.section}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.default_quantity} {r.default_unit}
                  </td>
                  <td className="px-3 py-2">
                    {r.bound ? (
                      <Badge className="bg-green-100 text-green-700">Bundet</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700">Ubundet</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.bound ? (
                      <div>
                        <div className="font-medium">{r.supplier_name || '—'}</div>
                        <div className="text-xs text-gray-500">
                          {r.supplier_sku || '—'} ·{' '}
                          {r.is_available ? (
                            <span className="text-green-700">På lager</span>
                          ) : (
                            <span className="text-gray-400">Ikke ledig</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.cost_price !== null ? formatCurrency(r.cost_price) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.usage_count > 0
                          ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium'
                          : 'text-xs text-gray-400'
                      }
                    >
                      {r.usage_count}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBindingFor(r)}
                        disabled={pending}
                      >
                        <LinkIcon className="w-3.5 h-3.5 mr-1" />
                        {r.bound ? 'Skift' : 'Bind'}
                      </Button>
                      {r.bound && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnbind(r)}
                          disabled={pending}
                        >
                          <Unlink className="w-3.5 h-3.5 mr-1" />
                          Fjern
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bindingFor && (
        <BindDialog
          material={bindingFor}
          onClose={() => setBindingFor(null)}
          onBound={() => {
            setBindingFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

// =====================================================
// Bind dialog
// =====================================================

function BindDialog({
  material,
  onClose,
  onBound,
}: {
  material: MaterialAdminRow
  onClose: () => void
  onBound: () => void
}) {
  const toast = useToast()
  const [query, setQuery] = useState(material.name)
  const [results, setResults] = useState<SupplierProductPickerRow[]>([])
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()
  const [force, setForce] = useState(false)

  // Debounced search
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const handle = setTimeout(async () => {
      setSearching(true)
      const data = await searchSupplierProductsForBinding(term, { limit: 25 })
      setResults(data)
      setSearching(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  const handleBind = (sp: SupplierProductPickerRow) => {
    if (!material.slug) {
      toast.error('Material mangler slug')
      return
    }
    startTransition(async () => {
      const res = await bindMaterialToSupplier(material.slug as string, sp.id, { force })
      if (res.success) {
        toast.success(`Bundet: ${material.name} → ${sp.supplier_sku}`)
        onBound()
      } else {
        toast.error('Kunne ikke binde', res.error)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="material-bind-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-[680px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 id="material-bind-title" className="text-lg font-semibold">
              Bind material til leverandørprodukt
            </h3>
            <p className="text-sm text-gray-500">
              {material.name} · {material.category} · {material.default_quantity} {material.default_unit}
            </p>
          </div>
          <button
            type="button"
            aria-label="Luk"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søg i supplier_products (navn eller SKU)…"
              className="pl-9"
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Force bind (overstyr kategori-validering)
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searching ? (
            <div className="p-8 flex items-center justify-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Søger…
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              {query.trim().length < 2 ? 'Skriv mindst 2 tegn for at søge.' : 'Ingen resultater.'}
            </div>
          ) : (
            <ul className="divide-y">
              {results.map((sp) => (
                <li key={sp.id} className="p-3 hover:bg-gray-50 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{sp.supplier_name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {sp.supplier_label} · {sp.supplier_sku}
                      {sp.category ? ` · ${sp.category}` : ''}
                      {sp.sub_category ? ` / ${sp.sub_category}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatCurrency(sp.cost_price)}</div>
                    <div className="text-xs text-gray-500">
                      {sp.is_available ? 'På lager' : 'Ikke ledig'}
                    </div>
                  </div>
                  <Button size="sm" disabled={pending} onClick={() => handleBind(sp)}>
                    Bind
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
