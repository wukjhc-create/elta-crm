import type { Metadata } from 'next'
import Link from 'next/link'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { findVisibleCaseByNumber, searchKnownCatalogue } from '@/lib/actions/supplier-catalogue-lookup'
import { AddCatalogueToCase } from './add-to-case'

export const metadata: Metadata = { title: 'Varekatalog' }
export const dynamic = 'force-dynamic'

const MODES = ['sku', 'ean', 'name'] as const

function dkk(value: number): string {
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(value)
}

export default async function CatalogueLookupPage({ searchParams }: { searchParams: Promise<{ q?: string; mode?: string; sag?: string }> }) {
  if (!(await pageHasPermission('materials.view'))) return <NoAccess permission="materials.view" />
  const params = await searchParams
  const mode = MODES.includes(params.mode as typeof MODES[number]) ? params.mode as typeof MODES[number] : 'sku'
  const q = params.q ?? ''
  const sag = params.sag ?? ''
  const [result, caseLink] = await Promise.all([
    q.trim() ? searchKnownCatalogue(mode, q) : Promise.resolve(null),
    findVisibleCaseByNumber(sag),
  ])

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Varekatalog</h1>
        <p className="text-sm text-gray-600">Kendte grossistvarer. Prisen er katalogets senest kendte indkøbspris. En manglende pris er ukendt. Der hentes ingen live-pris, og der afgives ingen ordre.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" action="/dashboard/materials/lookup">
        <label className="text-sm">
          <span className="block font-medium">Søg</span>
          <select name="mode" defaultValue={mode} className="mt-1 rounded-md border px-2 py-2">
            <option value="sku">Varenummer</option>
            <option value="ean">EAN</option>
            <option value="name">Navn</option>
          </select>
        </label>
        <label className="text-sm flex-1 min-w-48">
          <span className="block font-medium">Tekst</span>
          <input name="q" defaultValue={q} className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Sagsnummer</span>
          <input name="sag" defaultValue={sag} className="mt-1 w-32 rounded-md border px-3 py-2" />
        </label>
        <button type="submit" className="min-h-11 rounded-md bg-gray-900 px-4 text-sm text-white">Slå op</button>
      </form>

      {caseLink.state === 'one' && caseLink.id && (
        <p className="text-sm">Sagen er <Link className="text-blue-700 hover:underline" href={`/dashboard/orders/${caseLink.id}?tab=materialer`}>{caseLink.label}</Link>. En vare med kendt pris kan lægges på sagen her. En ukendt pris oprettes ikke som 0. Uden adgang til indkøbspriser bruges sagens egen Tilføj materiale — den vej kan stadig gemme kost som 0, fordi kolonnen ikke kan være tom.</p>
      )}
      {caseLink.state === 'many' && <p className="text-sm text-amber-800">Flere sager har nummeret. Der er ikke valgt en.</p>}
      {caseLink.state === 'none' && sag.trim() && <p className="text-sm text-gray-600">Ingen sag med det nummer, som du kan tilføje materiale på.</p>}
      {caseLink.state === 'error' && <p className="text-sm text-red-700">Sagen kunne ikke læses. Det betyder ikke, at den mangler.</p>}

      {result && !result.ok && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.error}</p>}
      {result?.ok && result.error && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{result.error}</p>}
      {result?.ok && result.priceVisibility === 'hidden' && <p className="text-sm text-gray-600">Indkøbspriser vises ikke med din adgang.</p>}
      {result?.ok && result.priceVisibility === 'unreadable' && <p className="text-sm text-amber-800">Indkøbspriserne kunne ikke læses. De vises ikke som 0.</p>}
      {result?.ok && result.rows.length === 0 && !result.error && <p className="text-sm text-gray-600">Ingen kendte varer matcher.</p>}
      {result?.ok && result.lowestKnownLabel && (
        <p className="text-sm text-gray-800">{result.lowestKnownLabel}{result.unknownPriceCount > 0 ? `. ${result.unknownPriceCount} uden kendt pris.` : ''}</p>
      )}
      {result?.ok && result.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Leverandør</th>
                <th className="px-3 py-2 font-medium">Varenummer</th>
                <th className="px-3 py-2 font-medium">Navn</th>
                <th className="px-3 py-2 font-medium">EAN</th>
                <th className="px-3 py-2 font-medium">Indkøbspris</th>
                <th className="px-3 py-2 font-medium">Kilde</th>
                <th className="px-3 py-2 font-medium">Sag</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.supplierName ?? 'Leverandør ukendt'}</td>
                  <td className="px-3 py-2">{row.sku}</td>
                  <td className="px-3 py-2">{row.productName}</td>
                  <td className="px-3 py-2">{row.ean ?? '—'}</td>
                  <td className="px-3 py-2">{result.priceVisibility === 'hidden' ? 'Skjult' : result.priceVisibility === 'unreadable' ? 'Kunne ikke læses' : row.priceKnown && row.purchasePrice != null ? dkk(row.purchasePrice) : 'Ukendt'}</td>
                  <td className="px-3 py-2">{row.syncedAt ? `Kendt katalog · ${new Date(row.syncedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}` : 'Kendt katalog · tidspunkt ukendt'}</td>
                  <td className="px-3 py-2">
                    {caseLink.state === 'one' && caseLink.id && result.priceVisibility === 'visible' && row.priceKnown
                      ? <AddCatalogueToCase caseId={caseLink.id} productId={row.id} />
                      : caseLink.state === 'one' && result.priceVisibility === 'visible'
                        ? 'Ukendt pris — oprettes ikke'
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
