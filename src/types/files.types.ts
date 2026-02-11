/**
 * File upload type definitions
 */

export interface UploadedFile {
  id: string
  name: string
  original_name: string
  size: number
  mime_type: string
  path: string
  url: string
  bucket: string
  entity_type: 'lead' | 'customer' | 'offer' | 'project' | 'message' | 'portal'
  entity_id: string
  uploaded_by: string
  created_at: string
}
