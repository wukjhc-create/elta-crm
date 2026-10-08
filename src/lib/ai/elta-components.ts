/**
 * S2 — AI-projektmotoren bruger ELTAs egne komponenter (calc_components) i stedet for indbyggede standardværdier.
 *
 * Bag flaget AI_PROJECT_ELTA_COMPONENTS='true' (default fra = uændret adfærd: motoren har hidtil ALTID brugt de
 * indbyggede værdier, fordi den læste kolonner der ikke findes). Kun entydige koblinger er med; motor-koder uden et
 * klart ELTA-modstykke (udendørs lampeudtag, kraftstik 16A/32A, ny tavle) bruger fortsat standardværdier
 * og vises som "standard" i resultatet. Prisen påvirkes via tiden (timer × timesats); stykprisen er visning.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export type EltaComponentLink = {
  /** ELTA-kode for hver enhed (eller enhed 2+ når firstCode er sat) */
  code: string
  /** ELTA-kode for den første enhed, når første og efterfølgende prissættes forskelligt (spots) */
  firstCode?: string
}

/** Motor-kode → ELTA-kode (nyinstallation, "-NY"-varianter). Ændres kun efter aftale med ELTA. */
export const ELTA_COMPONENT_MAP: Record<string, EltaComponentLink> = {
  outlet_single: { code: 'STIK-1-NY' },
  outlet_double: { code: 'STIK-2-NY' },
  switch_single: { code: 'AFB-1P-NY' },
  switch_multi: { code: 'AFB-KORR-NY' },
  dimmer: { code: 'DIM-NY' },
  spot_light: { code: 'SPOT-IND-X', firstCode: 'SPOT-IND-1' },
  ceiling_light: { code: 'LOFT-NY' },
  data_outlet: { code: 'NET-CAT6-NY' },
  tv_outlet: { code: 'STIK-ANTENNE' },
  panel_group: { code: 'TAVLE-GRP' },
  // Motorens elbillader-komponent er selve montagen (kabel 6 mm² og tavlegruppe beregnes separat i motoren) →
  // ELTAs eneste ladestander-komponent "Montering ladestander" dækker samme omfang (afklaret 2026-10-07)
  ev_charger: { code: 'MONT-LADESTAND' },
}

/**
 * Motor-koder der bevidst IKKE kobles (gennemgået mod prod-kataloget 2026-10-07, 70 aktive komponenter):
 *   outdoor_light — intet udendørs lampeudtag (VAEG-LAMPE-NY er indendørs vægudtag; STIK-UD* er stikkontakter)
 *   power_16a / power_32a — ingen kraftstik/CEE-komponent
 *   panel_new — flere kandidater (TAVLE-NY, TAVLE-S, TAVLE-L, TAVLE-LILLE) → tvetydigt
 * De bruger motorens standardværdier og vises som "standard" i resultatet.
 */
export const ELTA_UNMAPPED = ['outdoor_light', 'power_16a', 'power_32a', 'panel_new'] as const

export function isEltaComponentsEnabled(): boolean {
  return process.env.AI_PROJECT_ELTA_COMPONENTS === 'true'
}

export type EltaComponentRow = {
  id: string
  code: string
  name: string
  default_sale_price: number | null
  /** ELTAs kostpris for komponentens materiel (bruges kun hvor motoren ikke selv modellerer materialet — tavlegrupper) */
  default_cost_price: number | null
  base_time_minutes: number | null
  category: string | null
}

/** Nøgle i komponent-kortet for "første enhed"-varianten */
export const firstKey = (engineCode: string) => `${engineCode}__first`

/**
 * Hent de koblede ELTA-komponenter (kun aktive) og returnér dem nøglet på motor-kode (+ firstKey for første enhed).
 * Komponenter med 0 minutter springes over (en kobling uden tid ville gøre timeprisen 0).
 */
/** Aktive ELTA-komponenter nøglet på ELTA-kode (katalogdata via admin-klienten). */
export async function loadComponentRowsByCode(codes: string[]): Promise<Map<string, EltaComponentRow>> {
  if (!codes.length) return new Map()
  const admin = createAdminClient() // katalogdata; motoren kører også fra server-handlinger uden kost-adgang
  const { data, error } = await admin
    .from('calc_components')
    .select('id, code, name, default_sale_price, default_cost_price, base_time_minutes, category:calc_component_categories(name)')
    .in('code', codes)
    .eq('is_active', true)
  if (error) throw error
  const byCode = new Map<string, EltaComponentRow>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const cat = r.category as { name?: string } | Array<{ name?: string }> | null
    byCode.set(String(r.code), {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      default_sale_price: r.default_sale_price == null ? null : Number(r.default_sale_price),
      default_cost_price: r.default_cost_price == null ? null : Number(r.default_cost_price),
      base_time_minutes: r.base_time_minutes == null ? null : Number(r.base_time_minutes),
      category: (Array.isArray(cat) ? cat[0]?.name : cat?.name) ?? null,
    })
  }
  return byCode
}

export async function loadEltaComponents(): Promise<Map<string, { row: EltaComponentRow; engineCode: string }>> {
  const codes = Array.from(new Set(Object.values(ELTA_COMPONENT_MAP).flatMap((l) => [l.code, l.firstCode]).filter(Boolean) as string[]))
  const byCode = await loadComponentRowsByCode(codes)
  const out = new Map<string, { row: EltaComponentRow; engineCode: string }>()
  for (const [engineCode, link] of Object.entries(ELTA_COMPONENT_MAP)) {
    const main = byCode.get(link.code)
    if (main && (main.base_time_minutes ?? 0) > 0) out.set(engineCode, { row: main, engineCode })
    if (link.firstCode) {
      const first = byCode.get(link.firstCode)
      if (main && first && (first.base_time_minutes ?? 0) > 0) out.set(firstKey(engineCode), { row: first, engineCode })
    }
  }
  return out
}
