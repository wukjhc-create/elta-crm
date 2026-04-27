'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Image as ImageIcon,
  Download,
  Loader2,
  CheckCircle,
  Clock,
  FileSignature,
  ClipboardCheck,
  FolderOpen,
  Archive,
  Upload,
  Plus,
} from 'lucide-react'
import {
  getCustomerDocuments,
  getCustomerImages,
  getDocumentDownloadUrls,
  uploadCustomerDocument,
} from '@/lib/actions/customer-documents'
import type { CustomerDocument, CustomerImage } from '@/lib/actions/customer-documents'
import { useToast } from '@/components/ui/toast'

interface CustomerDocumentsTabProps {
  customerId: string
}

const CATEGORY_LABELS: Record<string, string> = {
  eltavle: 'Eltavle',
  tag: 'Tag',
  ac: 'AC Kabelføring',
  dc: 'DC Kabelføring',
  inverter: 'Inverter',
  andet: 'Andet',
}

export function CustomerDocumentsTab({ customerId }: CustomerDocumentsTabProps) {
  const router = useRouter()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [images, setImages] = useState<CustomerImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const load = async () => {
    setIsLoading(true)
    const [docsResult, imgsResult] = await Promise.all([
      getCustomerDocuments(customerId),
      getCustomerImages(customerId),
    ])
    if (docsResult.success) setDocuments(docsResult.data || [])
    if (imgsResult.success) setImages(imgsResult.data || [])
    setIsLoading(false)
  }

  useEffect(() => { load() }, [customerId])

  const besigtigelseReports = documents.filter(
    (d) => d.document_type === 'other' && d.title.includes('Besigtigelse')
  )
  const fuldmagter = documents.filter((d) => {
    try {
      const desc = JSON.parse(d.description || '{}')
      return desc.type === 'fuldmagt'
    } catch { return false }
  })
  const otherDocs = documents.filter(
    (d) => !besigtigelseReports.includes(d) && !fuldmagter.includes(d) && d.file_url
  )

  const imagesByCategory: Record<string, CustomerImage[]> = {}
  for (const img of images) {
    const cat = img.category
    if (!imagesByCategory[cat]) imagesByCategory[cat] = []
    imagesByCategory[cat].push(img)
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    let uploadedCount = 0
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      const result = await uploadCustomerDocument(customerId, formData)
      if (result.success) uploadedCount++
    }
    setIsUploading(false)
    if (uploadedCount > 0) {
      toast.success(`${uploadedCount} fil${uploadedCount > 1 ? 'er' : ''} uploadet`)
      load()
      router.refresh()
    } else {
      toast.error('Upload fejlede')
    }
  }

  const handleDownloadAll = async () => {
    setIsDownloading(true)
    try {
      const paths: string[] = []
      for (const doc of documents) {
        if (doc.storage_path) paths.push(doc.storage_path)
      }
      for (const img of images) {
        paths.push(img.path)
      }
      if (paths.length === 0) { setIsDownloading(false); return }

      const urlResult = await getDocumentDownloadUrls(paths)
      if (!urlResult.success || !urlResult.data) { setIsDownloading(false); return }

      const { default: JSZip } = await import('jszip').catch(() => ({ default: null }))

      if (JSZip) {
        const zip = new JSZip()
        for (const item of urlResult.data) {
          try {
            const res = await fetch(item.url)
            const blob = await res.blob()
            zip.file(item.name, blob)
          } catch { /* skip */ }
        }
        const content = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(content)
        const a = document.createElement('a')
        a.href = url
        a.download = `dokumenter-${customerId.slice(0, 8)}.zip`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        for (const item of urlResult.data) {
          window.open(item.url, '_blank')
        }
      }
    } catch { /* silent */ } finally {
      setIsDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const hasContent = documents.length > 0 || images.length > 0

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {documents.length} dokument{documents.length !== 1 ? 'er' : ''} &bull; {images.length} billede{images.length !== 1 ? 'r' : ''}
        </p>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform"
          >
            {isUploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploader...</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload fil</>
            )}
          </button>
          {hasContent && (
            <button
              onClick={handleDownloadAll}
              disabled={isDownloading}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform"
            >
              {isDownloading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Pakker...</>
              ) : (
                <><Archive className="w-4 h-4" /> Download ZIP</>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Fuldmagter */}
      {fuldmagter.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-3 sm:p-4 border-b flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-sm">Fuldmagter</h3>
          </div>
          <div className="divide-y">
            {fuldmagter.map((doc) => (
              <div key={doc.id} className="p-3 sm:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                    doc.fuldmagt_status === 'signed' ? 'bg-green-100' : 'bg-amber-100'
                  }`}>
                    {doc.fuldmagt_status === 'signed' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500">
                      {doc.fuldmagt_status === 'signed'
                        ? `Underskrevet ${doc.fuldmagt_signed_at ? new Date(doc.fuldmagt_signed_at).toLocaleDateString('da-DK') : ''}`
                        : 'Afventer kundens underskrift'}
                    </p>
                  </div>
                </div>
                {doc.file_url && doc.fuldmagt_status === 'signed' && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:scale-95 transition-transform">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Besigtigelsesrapporter */}
      {besigtigelseReports.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-3 sm:p-4 border-b flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-green-600" />
            <h3 className="font-semibold text-sm">Besigtigelsesrapporter</h3>
          </div>
          <div className="divide-y">
            {besigtigelseReports.map((doc) => (
              <div key={doc.id} className="p-3 sm:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 shrink-0 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString('da-DK')}
                      {doc.file_size ? ` — ${Math.round(doc.file_size / 1024)} KB` : ''}
                    </p>
                  </div>
                </div>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:scale-95 transition-transform">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billeder fra besigtigelse */}
      {images.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-3 sm:p-4 border-b flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-sm">Billeder fra besigtigelse</h3>
            <span className="text-xs text-gray-400 ml-1">({images.length})</span>
          </div>
          <div className="p-3 sm:p-4 space-y-4">
            {Object.entries(imagesByCategory).map(([cat, imgs]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {CATEGORY_LABELS[cat] || cat}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {imgs.map((img) => (
                    <a key={img.path} href={img.url} target="_blank" rel="noopener noreferrer"
                      className="group relative aspect-square rounded-lg overflow-hidden border bg-gray-50 hover:ring-2 hover:ring-green-500 transition-all active:scale-95">
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Download className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Andre dokumenter */}
      {otherDocs.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-3 sm:p-4 border-b flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-600" />
            <h3 className="font-semibold text-sm">Andre dokumenter</h3>
          </div>
          <div className="divide-y">
            {otherDocs.map((doc) => (
              <div key={doc.id} className="p-3 sm:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 shrink-0 bg-gray-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString('da-DK')}</p>
                  </div>
                </div>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:scale-95 transition-transform">
                    <Download className="w-3.5 h-3.5" /> Åbn
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasContent && (
        <div className="bg-white rounded-lg border p-8 sm:p-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 font-medium">Ingen dokumenter eller billeder endnu</p>
          <p className="text-sm text-gray-400 mt-1">Upload filer eller opret en besigtigelse for at komme i gang</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" /> Upload din første fil
          </button>
        </div>
      )}
    </div>
  )
}
