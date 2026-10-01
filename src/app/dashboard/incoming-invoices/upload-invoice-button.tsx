'use client'

/**
 * Upload af leverandørfaktura (papir/PDF der ikke kommer på mail). Efter upload åbnes fakturaen direkte, hvor
 * parse-resultat, sagsmatch og fakturakontrol vises. Kun roller med incoming_invoices.edit.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { uploadIncomingInvoiceAction } from '@/lib/actions/incoming-invoices'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'

export function UploadInvoiceButton() {
  const router = useRouter()
  const { role } = useUserRole()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (!hasPermission(role, 'incoming_invoices.edit')) return null

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.append('file', f)
    const res = await uploadIncomingInvoiceAction(fd)
    setBusy(false)
    if (ref.current) ref.current.value = ''
    if (res.ok && res.invoiceId) {
      router.push(`/dashboard/incoming-invoices/${res.invoiceId}${res.duplicate ? '?dublet=1' : ''}`)
      return
    }
    setMsg(res.message ?? 'Upload fejlede')
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])} data-testid="invoice-upload-input" />
      <Button type="button" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
        {busy ? 'Læser faktura…' : 'Upload faktura'}
      </Button>
      {msg && <span className="text-xs text-red-600" data-testid="invoice-upload-msg">{msg}</span>}
    </div>
  )
}
