'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, File, Loader2, Trash2, Download, AlertCircle } from 'lucide-react'
import { uploadFile, deleteFile, getFiles } from '@/lib/actions/files'
import type { UploadedFile } from '@/types/files.types'
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '@/lib/constants'
import { formatBytes } from '@/lib/utils/format'

interface FileUploadProps {
  entityType: UploadedFile['entity_type']
  entityId: string
  files?: UploadedFile[]
  onFilesChange?: (files: UploadedFile[]) => void
  maxFiles?: number
  disabled?: boolean
  className?: string
}

export function FileUpload({
  entityType,
  entityId,
  files: initialFiles = [],
  onFilesChange,
  maxFiles = 10,
  disabled = false,
  className = '',
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFilesSelected = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0 || disabled) return

      setUploadError(null)
      setIsUploading(true)

      const newFiles: UploadedFile[] = []

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]

        // Check max files limit
        if (files.length + newFiles.length >= maxFiles) {
          setUploadError(`Maksimalt ${maxFiles} filer tilladt`)
          break
        }

        const formData = new FormData()
        formData.append('file', file)
        formData.append('entityType', entityType)
        formData.append('entityId', entityId)

        const result = await uploadFile(formData)

        if (result.success && result.data) {
          newFiles.push(result.data)
        } else {
          setUploadError(result.error || 'Upload fejlede')
        }
      }

      if (newFiles.length > 0) {
        const updatedFiles = [...files, ...newFiles]
        setFiles(updatedFiles)
        onFilesChange?.(updatedFiles)
      }

      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [files, entityType, entityId, maxFiles, disabled, onFilesChange]
  )

  const handleDelete = async (fileId: string) => {
    if (disabled) return

    setDeletingId(fileId)
    const result = await deleteFile(fileId)

    if (result.success) {
      const updatedFiles = files.filter((f) => f.id !== fileId)
      setFiles(updatedFiles)
      onFilesChange?.(updatedFiles)
    } else {
      setUploadError(result.error || 'Kunne ikke slette filen')
    }

    setDeletingId(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (!disabled) {
      handleFilesSelected(e.dataTransfer.files)
    }
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return '🖼️'
    }
    if (mimeType.includes('pdf')) {
      return '📄'
    }
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return '📝'
    }
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return '📊'
    }
    return '📁'
  }

  const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024))

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload area */}
      {files.length < maxFiles && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary hover:bg-gray-50'}
          `}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_FILE_TYPES.join(',')}
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="hidden"
            disabled={disabled}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-gray-600">Uploader...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className={`w-8 h-8 ${isDragOver ? 'text-primary' : 'text-gray-400'}`} />
              <div>
                <span className="text-sm text-gray-600">
                  Træk filer hertil eller{' '}
                  <span className="text-primary font-medium">klik for at vælge</span>
                </span>
              </div>
              <span className="text-xs text-gray-400">
                Maks {maxSizeMB}MB pr. fil. Tilladte typer: {ALLOWED_FILE_TYPES.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
          <button
            onClick={() => setUploadError(null)}
            className="ml-auto hover:text-red-800"
            aria-label="Luk fejlmeddelelse"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">
            Filer ({files.length}/{maxFiles})
          </div>
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border"
              >
                <span className="text-xl">{getFileIcon(file.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {file.original_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatBytes(file.size)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-gray-400 hover:text-primary hover:bg-white rounded"
                    title="Download"
                    aria-label="Download fil"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  {!disabled && (
                    <button
                      onClick={() => handleDelete(file.id)}
                      disabled={deletingId === file.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded disabled:opacity-50"
                      title="Slet"
                      aria-label="Slet fil"
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Simple file list display (read-only)
export function FileList({
  files,
  className = '',
}: {
  files: UploadedFile[]
  className?: string
}) {
  if (files.length === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        Ingen filer vedhæftet
      </div>
    )
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️'
    if (mimeType.includes('pdf')) return '📄'
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊'
    return '📁'
  }

  return (
    <ul className={`space-y-2 ${className}`}>
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-2 p-2 bg-gray-50 rounded border text-sm"
        >
          <span>{getFileIcon(file.mime_type)}</span>
          <span className="flex-1 truncate">{file.original_name}</span>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-xs"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  )
}
