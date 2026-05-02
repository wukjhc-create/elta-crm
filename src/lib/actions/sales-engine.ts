'use server'

/**
 * Sales engine — server actions.
 *
 * Read actions are open to any authenticated user.
 * Write actions (admin CRUD on packages / options / text blocks)
 * require role='admin'.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import {
  applyPackageWithOptionsToOffer,
  buildOfferText,
  getPackageWithOptions,
  listActivePackages,
  getTextBlock,
} from '@/lib/services/sales-engine'
import type {
  ApplyPackageWithOptionsResult,
  OfferTextResult,
  PackageOptionRow,
  SalesPackageRow,
  SalesPackageWithOptions,
  SalesTextBlockRow,
} from '@/types/sales-engine.types'

export interface ActionOutcome<T = unknown> {
  ok: boolean
  message: string
  data?: T
}

async function requireAdminCtx() {
  const { supabase, userId } = await getAuthenticatedClient()
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if ((prof?.role as string | null) !== 'admin') {
    return { ok: false as const, message: 'Kun administratorer kan redigere pakker.' }
  }
  return { ok: true as const, supabase, userId }
}

// =====================================================
// Read actions (all authenticated users)
// =====================================================

export async function listActivePackagesAction(): Promise<SalesPackageRow[]> {
  await getAuthenticatedClient()
  return listActivePackages()
}

export async function getPackageWithOptionsAction(packageId: string): Promise<SalesPackageWithOptions | null> {
  await getAuthenticatedClient()
  return getPackageWithOptions(packageId)
}

export async function getOfferTextAction(input: {
  packageId: string
  optionIds: string[]
  customerName?: string
}): Promise<OfferTextResult> {
  await getAuthenticatedClient()
  return buildOfferText(input)
}

export async function getTextBlockAction(slug: string): Promise<SalesTextBlockRow | null> {
  await getAuthenticatedClient()
  return getTextBlock(slug)
}

// =====================================================
// Apply package + options to a draft offer
// =====================================================

export async function applyPackageToDraftOfferAction(input: {
  offerId: string
  packageId: string
  customerId: string | null
  optionIds: string[]
  customerName?: string
  /** When true, also overwrite offers.description with the generated text. */
  writeOfferText?: boolean
}): Promise<ActionOutcome<ApplyPackageWithOptionsResult>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const result = await applyPackageWithOptionsToOffer({
      offerId: input.offerId,
      packageId: input.packageId,
      customerId: input.customerId,
      optionIds: input.optionIds,
    })

    if (input.writeOfferText) {
      const text = await buildOfferText({
        packageId: input.packageId,
        optionIds: input.optionIds,
        customerName: input.customerName,
      })
      await supabase
        .from('offers')
        .update({ description: text.full })
        .eq('id', input.offerId)
    }

    revalidatePath(`/dashboard/offers/${input.offerId}`)
    return {
      ok: true,
      message: `Pakke anvendt: ${result.totalAdded} linjer (${result.materialLinesAdded} materialer + ${result.optionLinesAdded} tilvalg + ${result.basePriceLineId ? 1 : 0} basis)`,
      data: result,
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// =====================================================
// Admin CRUD — packages
// =====================================================

export interface PackageInput {
  slug?: string
  name: string
  job_type: string
  description?: string | null
  short_summary?: string | null
  standard_text?: string | null
  base_price?: number
  is_active?: boolean
  sort_order?: number
}

export async function listAllPackagesAction(): Promise<SalesPackageRow[]> {
  await getAuthenticatedClient()
  const { supabase } = await getAuthenticatedClient()
  const { data } = await supabase
    .from('offer_packages')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data ?? []) as SalesPackageRow[]
}

export async function upsertPackageAction(
  input: PackageInput & { id?: string }
): Promise<ActionOutcome<SalesPackageRow>> {
  const ctx = await requireAdminCtx()
  if (!ctx.ok) return ctx
  try {
    const slug = input.slug || (input.name || 'pkg').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60)
    const payload = {
      name: input.name,
      job_type: input.job_type,
      slug,
      description: input.description ?? null,
      short_summary: input.short_summary ?? null,
      standard_text: input.standard_text ?? null,
      base_price: Number(input.base_price ?? 0),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    }
    const q = input.id
      ? ctx.supabase.from('offer_packages').update(payload).eq('id', input.id)
      : ctx.supabase.from('offer_packages').insert(payload)
    const { data, error } = await q.select('*').single()
    if (error || !data) return { ok: false, message: error?.message ?? 'insert failed' }
    revalidatePath('/dashboard/settings/packages')
    return { ok: true, message: input.id ? 'Pakke opdateret' : 'Pakke oprettet', data: data as SalesPackageRow }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deletePackageAction(packageId: string): Promise<ActionOutcome> {
  const ctx = await requireAdminCtx()
  if (!ctx.ok) return ctx
  const { error } = await ctx.supabase.from('offer_packages').delete().eq('id', packageId)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/dashboard/settings/packages')
  return { ok: true, message: 'Pakke slettet' }
}

// =====================================================
// Admin CRUD — options
// =====================================================

export interface OptionInput {
  package_id: string
  name: string
  description?: string | null
  offer_text?: string | null
  price?: number
  affects_materials?: boolean
  material_id?: string | null
  quantity_multiplier?: number
  is_active?: boolean
  sort_order?: number
}

export async function listOptionsForPackageAction(packageId: string): Promise<PackageOptionRow[]> {
  await getAuthenticatedClient()
  const { supabase } = await getAuthenticatedClient()
  const { data } = await supabase
    .from('package_options')
    .select('*')
    .eq('package_id', packageId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data ?? []) as PackageOptionRow[]
}

export async function upsertOptionAction(
  input: OptionInput & { id?: string }
): Promise<ActionOutcome<PackageOptionRow>> {
  const ctx = await requireAdminCtx()
  if (!ctx.ok) return ctx
  try {
    const payload = {
      package_id: input.package_id,
      name: input.name,
      description: input.description ?? null,
      offer_text: input.offer_text ?? null,
      price: Number(input.price ?? 0),
      affects_materials: input.affects_materials ?? false,
      material_id: input.material_id ?? null,
      quantity_multiplier: Number(input.quantity_multiplier ?? 1),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    }
    const q = input.id
      ? ctx.supabase.from('package_options').update(payload).eq('id', input.id)
      : ctx.supabase.from('package_options').insert(payload)
    const { data, error } = await q.select('*').single()
    if (error || !data) return { ok: false, message: error?.message ?? 'insert failed' }
    revalidatePath('/dashboard/settings/packages')
    return { ok: true, message: input.id ? 'Tilvalg opdateret' : 'Tilvalg oprettet', data: data as PackageOptionRow }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteOptionAction(optionId: string): Promise<ActionOutcome> {
  const ctx = await requireAdminCtx()
  if (!ctx.ok) return ctx
  const { error } = await ctx.supabase.from('package_options').delete().eq('id', optionId)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/dashboard/settings/packages')
  return { ok: true, message: 'Tilvalg slettet' }
}

// =====================================================
// Admin — text blocks
// =====================================================

export async function listTextBlocksAction(): Promise<SalesTextBlockRow[]> {
  await getAuthenticatedClient()
  const { supabase } = await getAuthenticatedClient()
  const { data } = await supabase
    .from('sales_text_blocks')
    .select('*')
    .order('slug', { ascending: true })
  return (data ?? []) as SalesTextBlockRow[]
}

export async function upsertTextBlockAction(input: {
  slug: string
  name: string
  content: string
  is_active?: boolean
}): Promise<ActionOutcome<SalesTextBlockRow>> {
  const ctx = await requireAdminCtx()
  if (!ctx.ok) return ctx
  try {
    const { data, error } = await ctx.supabase
      .from('sales_text_blocks')
      .upsert(
        {
          slug: input.slug,
          name: input.name,
          content: input.content,
          is_active: input.is_active ?? true,
        },
        { onConflict: 'slug' }
      )
      .select('*')
      .single()
    if (error || !data) return { ok: false, message: error?.message ?? 'upsert failed' }
    revalidatePath('/dashboard/settings/packages')
    return { ok: true, message: 'Tekstblok gemt', data: data as SalesTextBlockRow }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}
