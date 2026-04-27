'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import type { ActionResult } from '@/types/common.types'

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

    const { data: docs, error } = await supabase
      .from('customer_documents')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    const documents: CustomerDocument[] = (docs || []).map((doc) => {
      let fuldmagt_status: 'pending' | 'signed' | undefined
      let fuldmagt_signed_at: string | null | undefined
      try {
        const desc = JSON.parse(doc.description || '{}')
        if (desc.type === 'fuldmagt') {
          fuldmagt_status = desc.status || 'pending'
          fuldmagt_signed_at = desc.signed_at || null
        }
      } catch { /* not JSON */ }

      return {
        id: doc.id,
        customer_id: doc.customer_id,
        title: doc.title,
        description: doc.description,
        document_type: doc.document_type,
        file_url: doc.file_url,
        storage_path: doc.storage_path,
        file_name: doc.file_name,
        mime_type: doc.mime_type || 'application/pdf',
        file_size: doc.file_size,
        created_at: doc.created_at,
        fuldmagt_status,
        fuldmagt_signed_at,
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
    const { supabase, userId } = await getAuthenticatedClient()

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
