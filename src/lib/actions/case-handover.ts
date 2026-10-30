'use server'

/**
 * Aflevering på sagen (N9a): afslutnings-tjekliste, fotos pr. punkt og kundens underskrift — på ordresiden, hvor
 * montøren arbejder. Samme datamodel som Service-modulet (service_cases.checklist, service_case_attachments med
 * category = punktets key, customer_signature*), så eksisterende data vises begge steder.
 *
 * Adgang: kontor (cases.edit) eller montør på EGNE sager (cases.edit.own + case-scope). RLS tillader ikke montør at
 * rette service_cases/indsætte bilag → skrivninger sker med service-role EFTER tjekket og kun på de konkrete kolonner.
 * Klienten sender aldrig hele tjeklisten — kun "punkt X er/er ikke udført". Underskriften lukker IKKE sagen.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { DEFAULT_CHECKLIST, canCloseCase, type ChecklistItem, type ServiceCaseAttachment } from '@/types/service-cases.types'
import type { ActionResult } from '@/types/common.types'
import { trackActionResult } from '@/lib/pilot/action-failure-log'

const PHOTO_MAX_BYTES = 15 * 1024 * 1024
const PHOTO_MIME = /^image\/(jpeg|png|webp|heic|heif)$/i
const SIGNATURE_MAX_CHARS = 600_000 // ~450 KB PNG som data-URL

export interface CaseHandover {
  checklist: ChecklistItem[]
  attachments: ServiceCaseAttachment[]
  signature: { image: string | null; name: string | null; signed_at: string | null }
  canEdit: boolean
  canClose: boolean
  /** MB-3: alle påkrævede punkter udfyldt (uanset om brugeren må lukke sagen) */
  checklistComplete: boolean
}

/** Læse- og skriveadgang til sagens aflevering for den aktuelle bruger. */
type Ctx = Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
async function handoverAccess(ctx: Ctx, caseId: string) {
  validateUUID(caseId, 'sags-ID')
  const { userCanViewCase } = await import('@/lib/auth/case-scope')
  const all = ctx.hasPermission('cases.view.all')
  const inScope = all || (ctx.hasPermission('cases.view.assigned') && (await userCanViewCase(caseId, { supabase: ctx.supabase, userId: ctx.userId, role: ctx.role })))
  const canEdit = ctx.hasPermission('cases.edit') || (ctx.hasPermission('cases.edit.own') && inScope)
  return { ctx, canView: inScope, canEdit }
}

/** FW-2 (montør-review 2026-10-17): afleveringen er frosset på en lukket sag (før kunne fotos slettes/afkrydsning fjernes
 *  efter lukning/fakturering — ingen spor). Returnerer en fejltekst eller null. */
async function closedCaseBlock(caseId: string): Promise<string | null> {
  // 00240: fail-closed — ulæselig/manglende sag afviser
  const { caseWriteBlock } = await import('@/lib/cases/case-write-guard')
  return caseWriteBlock(caseId)
}

async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

function revalidateCase(caseId: string) {
  revalidatePath(`/dashboard/orders/${caseId}`)
  revalidatePath(`/dashboard/service-cases/${caseId}`)
}

export async function getCaseHandoverAction(caseId: string): Promise<ActionResult<CaseHandover>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canView, canEdit } = await handoverAccess(ctx, caseId)
    if (!canView) return { success: false, error: 'Ingen adgang til sagen' }
    const db = await admin()
    const { data: sc } = await db.from('service_cases').select('checklist, customer_signature, customer_signature_name, signed_at').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    const { data: rows } = await db.from('service_case_attachments').select('*').eq('service_case_id', caseId).order('created_at', { ascending: true })
    // MB-10 (mobil-review 2026-10-17): markér hvilke fotos brugeren må slette (kontor: alle; ellers egne) — samme regel
    // som deleteHandoverPhotoAction; før blev slet-knappen vist på kollegaers fotos og afvist af serveren
    const canDeleteAll = ctx.hasPermission('cases.edit')
    const atts = ((rows ?? []) as ServiceCaseAttachment[]).map((a) => ({
      ...a,
      deletable_by_me: canDeleteAll || (a as { uploaded_by?: string | null }).uploaded_by === ctx.userId,
    })) as ServiceCaseAttachment[]
    const paths = atts.map((a) => a.storage_path ?? '').filter(Boolean)
    if (paths.length) {
      const { getStorageSignedUrls, SIGNED_URL_TTL } = await import('@/lib/storage/signed-url')
      const fresh = await getStorageSignedUrls('service-case-files', paths, SIGNED_URL_TTL.SHORT)
      let k = 0
      for (const a of atts) if (a.storage_path) { a.file_url = fresh[k] ?? a.file_url; k++ }
    }
    const checklist = (Array.isArray(sc.checklist) ? sc.checklist : []) as ChecklistItem[]
    return {
      success: true,
      data: {
        checklist, attachments: atts, canEdit,
        canClose: canCloseCase(checklist) && ctx.hasPermission('cases.close'),
        // MB-3 (mobil-review 2026-10-17): banneret skal følge tjeklisten — før så montøren (uden cases.close) altid
        // "Alle påkrævede punkter skal udfyldes", også ved 5/5
        checklistComplete: canCloseCase(checklist),
        signature: { image: (sc.customer_signature as string | null) ?? null, name: (sc.customer_signature_name as string | null) ?? null, signed_at: (sc.signed_at as string | null) ?? null },
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente aflevering') }
  }
}

/** Opret standard-tjeklisten hvis sagen ingen har. */
/** Pilot 2026-10-30: mislykkede forsøg spores (lib/pilot/action-failure-log) — selve handlingen er startCaseHandoverActionImpl */
export async function startCaseHandoverAction(caseId: string) {
  return trackActionResult('handover.start', await startCaseHandoverActionImpl(caseId), caseId)
}

async function startCaseHandoverActionImpl(caseId: string): Promise<ActionResult<ChecklistItem[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    // PR4-6 (pilot-review 4): som afkrydsning/upload/sletning (FW-2) — ingen ny tjekliste på en lukket sag
    { const closed = await closedCaseBlock(caseId); if (closed) return { success: false, error: closed } }
    const db = await admin()
    const { data: sc } = await db.from('service_cases').select('checklist, updated_at').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    if (Array.isArray(sc.checklist) && sc.checklist.length) return { success: true, data: sc.checklist as ChecklistItem[] }
    // RC-8 (samtidigheds-review 2026-10-18): compare-and-set som setItem — en samtidig start overskrev et netop afkrydset punkt
    const prevUpdated = (sc as { updated_at?: string | null }).updated_at ?? null
    const q = db.from('service_cases').update({ checklist: DEFAULT_CHECKLIST, updated_at: new Date().toISOString() }).eq('id', caseId)
    const { data: started, error } = await (prevUpdated ? q.eq('updated_at', prevUpdated) : q.is('updated_at', null)).select('id')
    if (error) return { success: false, error: 'Kunne ikke oprette tjekliste' }
    if ((started ?? []).length === 0) {
      const { data: now } = await db.from('service_cases').select('checklist').eq('id', caseId).maybeSingle()
      return { success: true, data: (Array.isArray(now?.checklist) ? now!.checklist : DEFAULT_CHECKLIST) as ChecklistItem[] }
    }
    revalidateCase(caseId)
    return { success: true, data: DEFAULT_CHECKLIST }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

async function setItem(caseId: string, key: string, completed: boolean, attachmentId?: string | null) {
  const db = await admin()
  // Sags-review 2026-10-09 (#9): læs-ændr-skriv af hele JSON'en — to hurtige klik (eller foto-upload + klik) overskrev
  // hinanden. Nu optimistisk: kun hvis updated_at er uændret siden læsningen; ellers læs igen (op til 3 forsøg).
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: sc } = await db.from('service_cases').select('checklist, updated_at').eq('id', caseId).maybeSingle()
    const list = (Array.isArray(sc?.checklist) ? sc!.checklist : []) as ChecklistItem[]
    const idx = list.findIndex((i) => i.key === key)
    if (idx < 0) return { ok: false as const, error: 'Ukendt tjeklistepunkt' }
    const next = list.map((i, n) => (n === idx ? { ...i, completed, completed_at: completed ? new Date().toISOString() : null, ...(attachmentId !== undefined ? { attachment_id: attachmentId } : {}) } : i))
    const prevUpdated = (sc as { updated_at?: string | null } | null)?.updated_at ?? null
    const q = db.from('service_cases').update({ checklist: next, updated_at: new Date().toISOString() }).eq('id', caseId)
    const { data: done, error } = await (prevUpdated ? q.eq('updated_at', prevUpdated) : q.is('updated_at', null)).select('id')
    if (error) return { ok: false as const, error: 'Kunne ikke gemme tjeklisten' }
    if ((done ?? []).length === 1) return { ok: true as const, checklist: next }
  }
  return { ok: false as const, error: 'Tjeklisten blev ændret samtidig — prøv igen' }
}

/** Pilot 2026-10-30: mislykkede forsøg spores (lib/pilot/action-failure-log) — selve handlingen er toggleHandoverItemActionImpl */
export async function toggleHandoverItemAction(caseId: string, key: string, completed: boolean) {
  return trackActionResult('handover.toggle', await toggleHandoverItemActionImpl(caseId, key, completed), caseId)
}

async function toggleHandoverItemActionImpl(caseId: string, key: string, completed: boolean): Promise<ActionResult<ChecklistItem[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    if (typeof key !== 'string' || !/^[a-z0-9_]{1,40}$/.test(key)) return { success: false, error: 'Ugyldigt punkt' }
    const closed = await closedCaseBlock(caseId)
    if (closed) return { success: false, error: closed }
    // FW-3 (montør-review 2026-10-17): et fotopunkt kan kun afkrydses med mindst ét foto (før kun håndhævet i UI'et)
    if (completed && key.endsWith('_photo')) {
      const { count } = await (await admin()).from('service_case_attachments').select('id', { count: 'exact', head: true })
        .eq('service_case_id', caseId).eq('category', key)
      if ((count ?? 0) === 0) return { success: false, error: 'Tilføj et foto for at afkrydse punktet' }
    }
    const r = await setItem(caseId, key, !!completed)
    if (!r.ok) return { success: false, error: r.error }
    revalidateCase(caseId)
    return { success: true, data: r.checklist }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

/** Pilot 2026-10-30: mislykkede forsøg spores (lib/pilot/action-failure-log) — selve handlingen er uploadHandoverPhotoActionImpl */
export async function uploadHandoverPhotoAction(caseId: string, formData: FormData) {
  return trackActionResult('handover.photo', await uploadHandoverPhotoActionImpl(caseId, formData), caseId)
}

async function uploadHandoverPhotoActionImpl(caseId: string, formData: FormData): Promise<ActionResult<ServiceCaseAttachment>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    const file = formData.get('file') as File | null
    const key = String(formData.get('category') ?? '')
    if (!/^[a-z0-9_]{1,40}$/.test(key)) return { success: false, error: 'Ugyldigt punkt' }
    if (!file || file.size === 0) return { success: false, error: 'Ingen fil valgt' }
    if (file.size > PHOTO_MAX_BYTES) return { success: false, error: 'Billedet er for stort (max 15 MB)' }
    if (!PHOTO_MIME.test(file.type || '')) return { success: false, error: 'Kun billeder (JPG, PNG, WEBP, HEIC)' }
    const closed = await closedCaseBlock(caseId)
    if (closed) return { success: false, error: closed }

    const db = await admin()
    const { data: sc } = await db.from('service_cases').select('checklist').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    if (!(Array.isArray(sc.checklist) && (sc.checklist as ChecklistItem[]).some((i) => i.key === key))) return { success: false, error: 'Ukendt tjeklistepunkt' }

    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '').slice(0, 5)
    const storagePath = `service-cases/${caseId}/${key}_${Date.now()}.${ext}`
    const { error: upErr } = await db.storage.from('service-case-files').upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upErr) {
      logger.error('uploadHandoverPhoto: storage', { error: upErr, entityId: caseId })
      return { success: false, error: 'Upload fejlede' }
    }
    const { data: att, error } = await db.from('service_case_attachments').insert({
      service_case_id: caseId, file_name: file.name.slice(0, 200), file_url: '', storage_path: storagePath, mime_type: file.type,
      file_size: file.size, category: key, uploaded_by: ctx.userId,
    }).select('*').single()
    if (error || !att) {
      await db.storage.from('service-case-files').remove([storagePath])
      return { success: false, error: 'Kunne ikke gemme billedet' }
    }
    // FW-13: resultatet tjekkes — før "gemt" selv om punktet ikke blev afkrydset
    const ticked = await setItem(caseId, key, true, (att as { id: string }).id)
    revalidateCase(caseId)
    if (!ticked.ok) return { success: false, error: `Billedet er gemt, men punktet blev ikke afkrydset: ${ticked.error} — afkryds det igen` }
    return { success: true, data: att as ServiceCaseAttachment }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

/** Slet et afleveringsfoto: kontor (cases.edit) eller den der uploadede det (på egen sag). */
export async function deleteHandoverPhotoAction(caseId: string, attachmentId: string): Promise<ActionResult> {
  try {
    validateUUID(attachmentId, 'bilags-ID')
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    const db = await admin()
    const { data: att } = await db.from('service_case_attachments').select('id, storage_path, uploaded_by, category').eq('id', attachmentId).eq('service_case_id', caseId).maybeSingle()
    if (!att) return { success: false, error: 'Billedet findes ikke på sagen' }
    if (!ctx.hasPermission('cases.edit') && att.uploaded_by !== ctx.userId) return { success: false, error: 'Du kan kun slette dine egne billeder' }
    const closed = await closedCaseBlock(caseId)
    if (closed) return { success: false, error: closed }
    // FW-13: rækken først, derefter filen (før: filen fjernet og rækken stod tilbage ved fejl)
    const { error } = await db.from('service_case_attachments').delete().eq('id', attachmentId)
    if (error) return { success: false, error: 'Kunne ikke slette billedet' }
    if (att.storage_path) await db.storage.from('service-case-files').remove([att.storage_path as string])
    // FW-2: sletning af dokumentation auditeres
    try {
      const { logDelete } = await import('@/lib/audit/audit-log-writer')
      await logDelete('service_case', caseId, `Afleveringsfoto (${String(att.category ?? '')})`, { attachment_id: attachmentId, category: att.category })
    } catch { /* audit er best-effort */ }
    // Punktet er ikke længere dokumenteret, hvis det var det eneste billede
    const { count } = await db.from('service_case_attachments').select('id', { count: 'exact', head: true }).eq('service_case_id', caseId).eq('category', att.category as string)
    if ((count ?? 0) === 0 && typeof att.category === 'string' && att.category.endsWith('_photo')) {
      // PR4-8 (pilot-review 4): før ignoreret — fejlede afkrydsningen, stod punktet som dokumenteret uden foto
      const r = await setItem(caseId, att.category, false, null)
      if (!r.ok) {
        revalidateCase(caseId)
        return { success: false, error: 'Billedet er slettet, men punktet blev ikke fjernet fra tjeklisten — fjern fluebenet manuelt' }
      }
    }
    revalidateCase(caseId)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

/** Kundens underskrift ved aflevering (lukker IKKE sagen). Kontor (cases.close) eller montør på egen sag. */
/** Pilot 2026-10-30: mislykkede forsøg spores (lib/pilot/action-failure-log) — selve handlingen er signCaseHandoverActionImpl */
export async function signCaseHandoverAction(caseId: string, signature: string, signerName: string) {
  return trackActionResult('handover.sign', await signCaseHandoverActionImpl(caseId, signature, signerName), caseId)
}

async function signCaseHandoverActionImpl(caseId: string, signature: string, signerName: string): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!(ctx.hasPermission('cases.close') || canEdit)) return { success: false, error: 'Manglende tilladelse' }
    const name = String(signerName ?? '').trim()
    if (!name || name.length > 120) return { success: false, error: 'Skriv kundens navn' }
    if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,') || signature.length > SIGNATURE_MAX_CHARS) {
      return { success: false, error: 'Ugyldig underskrift' }
    }
    const db = await admin()
    // Sags-review 2026-10-09 (#7): kundens underskrift kunne overskrives når som helst (også efter lukning/fakturering)
    // uden spor. Nu: kun første underskrift — en eksisterende kan kun erstattes af cases.edit, aldrig på en lukket sag,
    // og en erstatning audit-logges.
    const { data: cur } = await db.from('service_cases').select('status, signed_at').eq('id', caseId).maybeSingle()
    const c = cur as { status: string; signed_at: string | null } | null
    if (!c) return { success: false, error: 'Sag ikke fundet' }
    if (c.status === 'closed') return { success: false, error: 'Sagen er lukket — underskriften kan ikke ændres' }
    if (c.signed_at && !ctx.hasPermission('cases.edit')) return { success: false, error: 'Kunden har allerede underskrevet' }
    const q = db.from('service_cases').update({
      customer_signature: signature, customer_signature_name: name, signed_at: new Date().toISOString(),
    }).eq('id', caseId)
    const { data, error } = await (c.signed_at ? q.eq('signed_at', c.signed_at) : q.is('signed_at', null)).select('id')
    if (error || !(data ?? []).length) return { success: false, error: 'Kunne ikke gemme underskrift (ændret samtidig?)' }
    if (c.signed_at) {
      await db.from('audit_logs').insert({
        user_id: ctx.userId, entity_type: 'service_case', entity_id: caseId, action: 'handover_signature_replaced',
        action_description: 'Kundens overleveringsunderskrift erstattet', metadata: { previous_signed_at: c.signed_at },
      })
    }
    revalidateCase(caseId)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}
