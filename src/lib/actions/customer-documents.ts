'use server'
import { safeDocumentDescription } from '@/lib/documents/safe-description'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * RBAC app-lag (P-006, runde 3): modul-paritet — skrivende actions kraever samme rettighed som modulets side.
 */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}
import { getStorageSignedUrls, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import type { ActionResult } from '@/types/common.types'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Storage-review 2026-10-08 (S1): fil-adgang går via service-klienten bag action-gaten — så bucket-politikkerne kan
 * låses for direkte REST-adgang (authenticated kunne læse/overskrive alle filer i 'attachments').
 */
function storageClient() {
  return createAdminClient()
}

export interface CustomerDocument {
  id: string
  customer_id: string
  title: string
  description: string | null
  document_type: string
  file_url: string
  storage_path: string | null
  file_name: string
  mime_type: string
  file_size: number | null
  created_at: string
  // Parsed from description for fuldmagt
  fuldmagt_status?: 'pending' | 'signed'
  fuldmagt_signed_at?: string | null
  // Sprint 8D-1: kobling til sag + mail
  service_case_id?: string | null
  source_email_id?: string | null
  service_case?: {
    id: string
    case_number: string
    title: string
    status: string
  } | null
}

export interface CustomerImage {
  name: string
  path: string
  url: string
  category: string
}

/**
 * Get all documents for a customer (besigtigelse reports, fuldmagter, etc.)
 */
export async function getCustomerDocuments(
  customerId: string
): Promise<ActionResult<CustomerDocument[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // Kunde-review: før uden gate. Mail-vedhæftninger (fx leverandørers ordrebekræftelser med kostpriser) arkiveres
    // på kunden — kun for roller der må se kundemails (montør må ikke, jf. G9/D28)
    if (!hasPermission('customers.view')) return { success: false, error: 'Manglende tilladelse: customers.view' }

    // Sprint 8D-1: select også service_case_id + source_email_id
    // og join service_cases for at vise sag-label uden ekstra fetch
    let docsQuery = supabase
      .from('customer_documents')
      .select(`
        *,
        service_case:service_cases (id, case_number, title, status)
      `)
      .eq('customer_id', customerId)
    if (!hasPermission('customers.emails.view')) docsQuery = docsQuery.is('source_email_id', null)
    const { data: docs, error } = await docsQuery
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    // Phase β.2.3: refresh file_url via signed-URL helper hvis storage_path
    // findes. DB-lagrede URLs (mix af legacy public + ny signed) erstattes
    // af friske signed URLs ved hver fetch, saa de virker baade foer og
    // efter bucket-privatisering (beta.2.5).
    const paths = (docs ?? []).map((d) => (d.storage_path as string | null) ?? '')
    const freshUrls = await getStorageSignedUrls('attachments', paths.filter((p) => p), SIGNED_URL_TTL.SHORT)
    // Build idx-map for paths-with-storage to fresh-URL
    const urlByIdx: Record<number, string | null> = {}
    let freshIdx = 0
    for (let i = 0; i < paths.length; i++) {
      if (paths[i]) {
        urlByIdx[i] = freshUrls[freshIdx]
        freshIdx++
      }
    }

    const documents: CustomerDocument[] = (docs || []).map((doc, idx) => {
      let fuldmagt_status: 'pending' | 'signed' | undefined
      let fuldmagt_signed_at: string | null | undefined
      try {
        const desc = JSON.parse(doc.description || '{}')
        if (desc.type === 'fuldmagt') {
          fuldmagt_status = desc.status === 'signed' ? 'signed' : 'pending' // 'signing' = igangværende krav
          fuldmagt_signed_at = desc.signed_at || null
        }
      } catch { /* not JSON */ }

      // Supabase nested-select: kan returnere objekt eller array
      const sagJoinRaw = (doc as Record<string, unknown>).service_case
      const sagJoin = Array.isArray(sagJoinRaw) ? sagJoinRaw[0] : sagJoinRaw

      // Brug lazy-refreshet URL hvis storage_path findes, ellers fald
      // tilbage paa lagret file_url (legacy/fallback).
      const fileUrl = urlByIdx[idx] ?? doc.file_url ?? ''

      return {
        id: doc.id,
        customer_id: doc.customer_id,
        title: doc.title,
        // IDOR-sweep 2026-10-09 (#2): en underskrevet fuldmagts description indeholder fødselsdato/CVR, underskrift og
        // underskriverens e-mail — kun ufølsomme felter sendes til klienten (status/tidspunkt står i fuldmagt_status)
        description: safeDocumentDescription(doc.description as string | null),
        document_type: doc.document_type,
        file_url: fileUrl,
        storage_path: doc.storage_path,
        file_name: doc.file_name,
        mime_type: doc.mime_type || 'application/pdf',
        file_size: doc.file_size,
        created_at: doc.created_at,
        fuldmagt_status,
        fuldmagt_signed_at,
        service_case_id: (doc as Record<string, unknown>).service_case_id as string | null,
        source_email_id: (doc as Record<string, unknown>).source_email_id as string | null,
        service_case: sagJoin
          ? {
              id: (sagJoin as Record<string, unknown>).id as string,
              case_number: (sagJoin as Record<string, unknown>).case_number as string,
              title: (sagJoin as Record<string, unknown>).title as string,
              status: (sagJoin as Record<string, unknown>).status as string,
            }
          : null,
      }
    })

    return { success: true, data: documents }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

/**
 * Get all besigtigelse images stored for a customer
 */
export async function getCustomerImages(
  customerId: string
): Promise<ActionResult<CustomerImage[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) return { success: false, error: 'Manglende tilladelse: customers.view' }

    const folderPath = `customer-documents/${customerId}/besigtigelse-images`

    const { data: files, error } = await storageClient().storage
      .from('attachments')
      .list(folderPath, { limit: 200 })

    if (error || !files) {
      return { success: true, data: [] }
    }

    const images: CustomerImage[] = []
    for (const file of files) {
      if (!file.name || file.name === '.emptyFolderPlaceholder') continue

      const filePath = `${folderPath}/${file.name}`
      const { data: urlData } = await storageClient().storage
        .from('attachments')
        .createSignedUrl(filePath, 3600)

      if (urlData?.signedUrl) {
        // Parse category from filename: besigtigelse-{category}-{timestamp}.ext
        const match = file.name.match(/^besigtigelse-([^-]+)-/)
        const category = match ? match[1] : 'andet'

        images.push({
          name: file.name,
          path: filePath,
          url: urlData.signedUrl,
          category,
        })
      }
    }

    return { success: true, data: images }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

/**
 * Get signed download URLs for multiple storage paths (for zip download)
 */
export async function getDocumentDownloadUrls(
  storagePaths: string[]
): Promise<ActionResult<{ path: string; url: string; name: string }[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // Kunde-review: signerede før ENHVER sti i attachments-bucket'en for enhver indlogget bruger. Nu kun stier der
    // hører til kundedokumenter brugeren må se (mail-vedhæftninger kræver customers.emails.view) eller
    // besigtigelsesbilleder (customer-documents/<kunde>/besigtigelse-images/…).
    if (!hasPermission('customers.view')) return { success: false, error: 'Manglende tilladelse: customers.view' }
    const requested = Array.from(new Set((storagePaths ?? []).filter((p) => typeof p === 'string' && p && !p.includes('..'))))
    const allowed = new Set(requested.filter((p) => /^customer-documents\/[0-9a-f-]{36}\/besigtigelse-images\/[^/]+$/i.test(p)))
    const docPaths = requested.filter((p) => !allowed.has(p))
    for (let i = 0; i < docPaths.length; i += 200) {
      let q = supabase.from('customer_documents').select('storage_path').in('storage_path', docPaths.slice(i, i + 200))
      if (!hasPermission('customers.emails.view')) q = q.is('source_email_id', null)
      const { data: rows } = await q
      for (const r of (rows ?? []) as Array<{ storage_path: string | null }>) if (r.storage_path) allowed.add(r.storage_path)
    }

    const urls: { path: string; url: string; name: string }[] = []
    for (const path of requested.filter((p) => allowed.has(p))) {
      const { data } = await storageClient().storage
        .from('attachments')
        .createSignedUrl(path, 3600)

      if (data?.signedUrl) {
        const name = path.split('/').pop() || 'file'
        urls.push({ path, url: data.signedUrl, name })
      }
    }

    return { success: true, data: urls }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

/**
 * Upload a file as a customer document (manual upload from CRM)
 */
export async function uploadCustomerDocument(
  customerId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    // Kunde-review 2026-10-09 (#2): upload på kundens dokumentfane kræver kunderelationen (customers.edit) — dokumenter
    // her vises i kundeportalen; montør/bogholderi (customers.view) kunne uploade til enhver kunde
    const { supabase, userId } = await requireGate('customers.edit')

    const file = formData.get('file') as File
    if (!file || file.size === 0) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    const maxSize = 20 * 1024 * 1024 // 20MB
    if (file.size > maxSize) {
      return { success: false, error: 'Filen er for stor (max 20 MB)' }
    }

    // Storage-review 2026-10-08 (#5): gyldigt kunde-id, kun kendte dokument-/billedtyper (ingen HTML/SVG der vises i
    // portalen), renset filendelse, ingen overskrivning; ingen 1-årige signerede links i DB (#4 — signeres ved visning)
    validateUUID(customerId, 'kunde ID')
    const rawExt = (file.name.split('.').pop() || '').toLowerCase()
    const ext = CUSTOMER_UPLOAD_EXT[rawExt] && CUSTOMER_UPLOAD_EXT[rawExt].test(file.type || '') ? rawExt : null
    if (!ext) {
      return { success: false, error: 'Filtypen er ikke tilladt (PDF, billeder, Word, Excel)' }
    }
    const safeFileName = `upload-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
    const storagePath = `customer-documents/${customerId}/${safeFileName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await storageClient().storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      return { success: false, error: 'Upload fejlede' }
    }

    const fileUrl = ''

    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .insert({
        customer_id: customerId,
        title: file.name,
        document_type: 'other',
        file_url: fileUrl,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        shared_by: userId,
      })
      .select('id')
      .single()

    if (docErr || !doc) {
      await storageClient().storage.from('attachments').remove([storagePath]) // ingen forældreløs fil
      return { success: false, error: 'Kunne ikke gemme dokument' }
    }

    revalidatePath(`/dashboard/customers/${customerId}`)
    return { success: true, data: { id: doc.id } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

const CASE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
/** Tilladte kundedokumenter: filendelse → forventet MIME (klientens filtype skal matche) */
const CUSTOMER_UPLOAD_EXT: Record<string, RegExp> = {
  pdf: /^application\/pdf$/i,
  jpg: /^image\/jpe?g$/i, jpeg: /^image\/jpe?g$/i, png: /^image\/png$/i, webp: /^image\/webp$/i, heic: /^image\/hei[cf]$/i,
  doc: /^application\/msword$/i,
  docx: /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i,
  xls: /^application\/vnd\.ms-excel$/i,
  xlsx: /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/i,
}

const CASE_UPLOAD_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i

/**
 * Upload foto/dokument direkte på en sag (fanen Dokumenter på /dashboard/orders/[id]).
 * Montøren skal kunne dokumentere sit arbejde: cases.edit (kontor) eller cases.edit.own + sagen er i brugerens
 * scope (samme scope som ordrelisten). Kun billeder/PDF ≤ 20 MB. RLS: customer_documents INSERT og
 * attachments-bucket tillader de samme roller.
 */
export async function uploadCaseDocument(caseId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    validateUUID(caseId, 'sags-ID')
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('cases.edit')) {
      if (!hasPermission('cases.edit.own')) return { success: false, error: 'Manglende tilladelse: cases.edit' }
      const { userCanViewCase } = await import('@/lib/auth/case-scope')
      if (!(await userCanViewCase(caseId, { supabase, userId, role }))) return { success: false, error: 'Sagen er ikke tildelt dig' }
    }

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return { success: false, error: 'Ingen fil valgt' }
    if (file.size > CASE_UPLOAD_MAX_BYTES) return { success: false, error: 'Filen er for stor (max 20 MB)' }
    if (!CASE_UPLOAD_MIME.test(file.type || '')) return { success: false, error: 'Kun billeder (JPG, PNG, WEBP, HEIC) og PDF' }

    const { data: sc } = await supabase.from('service_cases').select('id, customer_id').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    if (!sc.customer_id) return { success: false, error: 'Sagen har ingen kunde — kan ikke gemme dokument' }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
    const storagePath = `customer-documents/${sc.customer_id}/case-${caseId}-${Date.now()}.${ext}`
    const { error: uploadErr } = await storageClient().storage.from('attachments')
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (uploadErr) {
      logger.error('uploadCaseDocument: storage upload failed', { error: uploadErr, entityId: caseId })
      return { success: false, error: 'Upload fejlede' }
    }

    // file_url er NOT NULL; visning henter altid friske signerede URL'er via storage_path (getDocumentsForCase)
    const { data: signed } = await storageClient().storage.from('attachments').createSignedUrl(storagePath, 3600)
    const { data: doc, error: docErr } = await supabase.from('customer_documents').insert({
      customer_id: sc.customer_id,
      service_case_id: caseId,
      title: file.name,
      document_type: 'other',
      file_url: signed?.signedUrl ?? '',
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      shared_by: userId,
    }).select('id').single()
    if (docErr || !doc) {
      logger.error('uploadCaseDocument: insert failed', { error: docErr, entityId: caseId })
      return { success: false, error: 'Kunne ikke gemme dokument' }
    }

    revalidatePath(`/dashboard/orders/${caseId}`)
    return { success: true, data: { id: doc.id as string } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}
