'use server'

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
import { insertAuditRow } from '@/lib/audit/insert-audit-row'

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
    const { supabase } = await getAuthenticatedClient()

    // Sprint 8D-1: select også service_case_id + source_email_id
    // og join service_cases for at vise sag-label uden ekstra fetch
    const { data: docs, error } = await supabase
      .from('customer_documents')
      .select(`
        *,
        service_case:service_cases (id, case_number, title, status)
      `)
      .eq('customer_id', customerId)
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
          fuldmagt_status = desc.status || 'pending'
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
        description: doc.description,
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
    const { supabase } = await getAuthenticatedClient()

    const folderPath = `customer-documents/${customerId}/besigtigelse-images`

    const { data: files, error } = await supabase.storage
      .from('attachments')
      .list(folderPath, { limit: 200 })

    if (error || !files) {
      return { success: true, data: [] }
    }

    const images: CustomerImage[] = []
    for (const file of files) {
      if (!file.name || file.name === '.emptyFolderPlaceholder') continue

      const filePath = `${folderPath}/${file.name}`
      const { data: urlData } = await supabase.storage
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
    const { supabase } = await getAuthenticatedClient()

    const urls: { path: string; url: string; name: string }[] = []
    for (const path of storagePaths) {
      const { data } = await supabase.storage
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
    const { supabase, userId } = await requireGate('customers.view')

    const file = formData.get('file') as File
    if (!file || file.size === 0) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    const maxSize = 20 * 1024 * 1024 // 20MB
    if (file.size > maxSize) {
      return { success: false, error: 'Filen er for stor (max 20 MB)' }
    }

    const ext = file.name.split('.').pop() || 'pdf'
    const safeFileName = `upload-${Date.now()}.${ext}`
    const storagePath = `customer-documents/${customerId}/${safeFileName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (uploadErr) {
      return { success: false, error: 'Upload fejlede' }
    }

    const { data: urlData } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 86400 * 365)

    const fileUrl = urlData?.signedUrl || ''

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
      return { success: false, error: 'Kunne ikke gemme dokument' }
    }

    revalidatePath(`/dashboard/customers/${customerId}`)
    return { success: true, data: { id: doc.id } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

const CASE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
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
    const { error: uploadErr } = await supabase.storage.from('attachments')
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (uploadErr) {
      logger.error('uploadCaseDocument: storage upload failed', { error: uploadErr, entityId: caseId })
      return { success: false, error: 'Upload fejlede' }
    }

    // file_url er NOT NULL; visning henter altid friske signerede URL'er via storage_path (getDocumentsForCase)
    const { data: signed } = await supabase.storage.from('attachments').createSignedUrl(storagePath, 3600)
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
      // D26 (Henrik 2026-10-02): interne som standard — kun delt når brugeren aktivt har valgt "Del med kunde"
      visible_to_customer: formData.get('share_with_customer') === 'true',
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

/**
 * D26: del/skjul et sagsdokument for kunden (kunde- og partnerportal). Samme adgang som upload: cases.edit,
 * eller cases.edit.own på en sag brugeren må se. Kun dokumenter der hører til en sag.
 */
export async function setCaseDocumentVisibilityAction(documentId: string, visible: boolean): Promise<ActionResult<{ visible: boolean }>> {
  try {
    validateUUID(documentId, 'dokument-ID')
    const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
    const { data: doc } = await supabase.from('customer_documents').select('id, service_case_id').eq('id', documentId).maybeSingle()
    const caseId = (doc as { service_case_id?: string | null } | null)?.service_case_id ?? null
    if (!doc || !caseId) return { success: false, error: 'Dokument ikke fundet' }
    if (!hasPermission('cases.edit')) {
      if (!hasPermission('cases.edit.own')) return { success: false, error: 'Manglende tilladelse: cases.edit' }
      const { userCanViewCase } = await import('@/lib/auth/case-scope')
      if (!(await userCanViewCase(caseId, { supabase, userId, role }))) return { success: false, error: 'Sagen er ikke tildelt dig' }
    }
    // Service-role efter gaten (montør har ikke UPDATE på customer_documents i RLS); kun synligheds-feltet skrives.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data: upd, error } = await createAdminClient()
      .from('customer_documents')
      .update({ visible_to_customer: !!visible })
      .eq('id', documentId)
      .select('id')
    if (error || !upd || upd.length !== 1) {
      logger.error('setCaseDocumentVisibility failed', { error, entityId: documentId })
      return { success: false, error: 'Kunne ikke ændre deling' }
    }
    await insertAuditRow({
      user_id: userId, entity_type: 'customer_document', entity_id: documentId, entity_name: null,
      action: visible ? 'document_shared_with_customer' : 'document_made_internal',
      action_description: visible ? 'Dokument delt med kunden (portal)' : 'Dokument gjort internt',
      changes: { visible_to_customer: { old: !visible, new: !!visible } }, metadata: { service_case_id: caseId },
    })
    revalidatePath(`/dashboard/orders/${caseId}`)
    return { success: true, data: { visible: !!visible } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}
