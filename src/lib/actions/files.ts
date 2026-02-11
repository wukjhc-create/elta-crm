'use server'

import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { revalidatePath } from 'next/cache'
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, FILE_SIGNED_URL_EXPIRY_SECONDS } from '@/lib/constants'
import type { ActionResult } from '@/types/common.types'
import type { UploadedFile } from '@/types/files.types'

// Validate file before upload
function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024))
    return { valid: false, error: `Filen er for stor. Maksimum er ${maxSizeMB}MB` }
  }

  // Check file extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_FILE_TYPES.includes(ext)) {
    return {
      valid: false,
      error: `Filtypen er ikke tilladt. Tilladte typer: ${ALLOWED_FILE_TYPES.join(', ')}`
    }
  }

  return { valid: true }
}

// Generate unique file name
function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || ''
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}.${ext}`
}

// Upload a file to Supabase Storage
export async function uploadFile(
  formData: FormData
): Promise<ActionResult<UploadedFile>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const file = formData.get('file') as File
    const entityType = formData.get('entityType') as UploadedFile['entity_type']
    const entityId = formData.get('entityId') as string

    if (!file || !entityType || !entityId) {
      return { success: false, error: 'Manglende påkrævede felter' }
    }

    // Validate file
    const validation = validateFile(file)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Generate unique file name
    const fileName = generateFileName(file.name)
    const filePath = `${entityType}/${entityId}/${fileName}`

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return { success: false, error: 'Kunne ikke uploade filen' }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath)

    // Create file record in database
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        name: fileName,
        original_name: file.name,
        size: file.size,
        mime_type: file.type,
        path: uploadData.path,
        url: urlData.publicUrl,
        bucket: 'attachments',
        entity_type: entityType,
        entity_id: entityId,
        uploaded_by: userId,
      })
      .select()
      .single()

    if (dbError) {
      // If DB insert fails, try to delete the uploaded file
      await supabase.storage.from('attachments').remove([filePath])
      console.error('Error creating file record:', dbError)
      return { success: false, error: 'Kunne ikke registrere filen' }
    }

    revalidatePath(`/dashboard/${entityType}s/${entityId}`)
    return { success: true, data: fileRecord as UploadedFile }
  } catch (error) {
    console.error('Error in uploadFile:', error)
    return { success: false, error: 'Der opstod en fejl ved upload' }
  }
}

// Get files for an entity
export async function getFiles(
  entityType: UploadedFile['entity_type'],
  entityId: string
): Promise<ActionResult<UploadedFile[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching files:', error)
      return { success: false, error: 'Kunne ikke hente filer' }
    }

    return { success: true, data: data as UploadedFile[] }
  } catch (error) {
    console.error('Error in getFiles:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete a file
export async function deleteFile(fileId: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get file record first
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fetchError || !file) {
      return { success: false, error: 'Filen blev ikke fundet' }
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(file.bucket)
      .remove([file.path])

    if (storageError) {
      console.error('Error deleting file from storage:', storageError)
      // Continue to delete from DB even if storage delete fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId)

    if (dbError) {
      console.error('Error deleting file record:', dbError)
      return { success: false, error: 'Kunne ikke slette filen' }
    }

    if (file.entity_type && file.entity_id) {
      revalidatePath(`/dashboard/${file.entity_type}s/${file.entity_id}`)
    }
    return { success: true }
  } catch (error) {
    console.error('Error in deleteFile:', error)
    return { success: false, error: 'Der opstod en fejl ved sletning' }
  }
}

// Get signed URL for private file access
export async function getSignedUrl(
  filePath: string,
  expiresIn: number = FILE_SIGNED_URL_EXPIRY_SECONDS
): Promise<ActionResult<string>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error('Error creating signed URL:', error)
      return { success: false, error: 'Kunne ikke oprette download-link' }
    }

    return { success: true, data: data.signedUrl }
  } catch (error) {
    console.error('Error in getSignedUrl:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
