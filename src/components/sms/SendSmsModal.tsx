'use client'

/**
 * SEND SMS MODAL
 *
 * Modal for previewing and sending SMS to customers
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  generateSmsPreview,
  getSmsTemplates,
  sendOfferSms,
} from '@/lib/actions/sms'
import type { SmsTemplate, SmsPreview } from '@/types/sms.types'
import {
  Send,
  Phone,
  MessageSquare,
  Loader2,
  AlertTriangle,
  Edit,
  RefreshCw,
  FileText,
} from 'lucide-react'

interface SendSmsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  offerId: string
  onSmsSent?: () => void
}

export function SendSmsModal({
  open,
  onOpenChange,
  offerId,
  onSmsSent,
}: SendSmsModalProps) {
  const toast = useToast()

  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('offer_send')
  const [preview, setPreview] = useState<SmsPreview | null>(null)

  const [message, setMessage] = useState('')
  const [phone, setPhone] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load templates
  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open])

  // Load preview when template changes
  useEffect(() => {
    if (open && selectedTemplate) {
      loadPreview()
    }
  }, [open, selectedTemplate, offerId])

  const loadTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const data = await getSmsTemplates({ active_only: true })
      setTemplates(data)
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  const loadPreview = async () => {
    setIsLoadingPreview(true)
    setError(null)
    try {
      const result = await generateSmsPreview({
        offer_id: offerId,
        template_code: selectedTemplate,
      })

      if (result.success && result.data) {
        setPreview(result.data)
        setMessage(result.data.message)
        setPhone(result.data.to_phone)
      } else {
        setError(result.error || 'Kunne ikke generere forhåndsvisning')
      }
    } catch (error) {
      console.error('Error loading preview:', error)
      setError('Uventet fejl ved indlæsning af forhåndsvisning')
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const handleSend = async () => {
    setIsSending(true)
    setError(null)

    try {
      const result = await sendOfferSms({
        offer_id: offerId,
        template_code: selectedTemplate,
        message: isEditing ? message : undefined,
        to_phone: phone !== preview?.to_phone ? phone : undefined,
      })

      if (result.success) {
        toast?.success('SMS sendt', 'Beskeden er sendt til kunden')
        onOpenChange(false)
        onSmsSent?.()
      } else {
        setError(result.error || 'Kunne ikke sende SMS')
        toast?.error('Fejl', result.error || 'Kunne ikke sende SMS')
      }
    } catch (error) {
      console.error('Error sending SMS:', error)
      setError('Uventet fejl ved afsendelse')
    } finally {
      setIsSending(false)
    }
  }

  const resetToTemplate = () => {
    if (preview) {
      setMessage(preview.message)
      setPhone(preview.to_phone)
      setIsEditing(false)
    }
  }

  // Calculate character count and parts
  const charCount = message.length
  const isUnicode = /[^\x00-\x7F]/.test(message) && !/^[\x20-\x7E\n\r]*$/.test(message)
  const maxCharsPerPart = isUnicode ? 67 : 153
  const singleSmsLimit = isUnicode ? 70 : 160
  const partsCount = charCount <= singleSmsLimit ? 1 : Math.ceil(charCount / maxCharsPerPart)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Send SMS til kunde
          </DialogTitle>
          <DialogDescription>
            Send en SMS besked om tilbuddet til kunden
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template selector */}
          <div className="space-y-2">
            <Label>SMS skabelon</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg skabelon" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.code} value={template.code}>
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {template.name}
                      {template.is_default && (
                        <Badge variant="secondary" className="text-xs">Standard</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Der opstod en fejl</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Genererer forhåndsvisning...
            </div>
          ) : preview ? (
            <>
              {/* Phone number */}
              <div className="space-y-2">
                <Label>Telefonnummer</Label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      setIsEditing(true)
                    }}
                    placeholder="+45 12 34 56 78"
                  />
                </div>
                {preview.to_name && (
                  <p className="text-xs text-muted-foreground">
                    {preview.to_name}
                  </p>
                )}
              </div>

              {/* Message */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Besked</Label>
                  {isEditing && (
                    <Button variant="ghost" size="sm" onClick={resetToTemplate}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Nulstil
                    </Button>
                  )}
                </div>
                <Textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value)
                    setIsEditing(true)
                  }}
                  rows={4}
                  className="resize-none"
                />

                {/* Character count & parts info */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {charCount} tegn
                    {isUnicode && ' (unicode)'}
                  </span>
                  <span className={partsCount > 1 ? 'text-yellow-600' : ''}>
                    {partsCount} SMS {partsCount > 1 ? 'dele' : 'del'}
                    {partsCount > 1 && ` (${maxCharsPerPart} tegn/del)`}
                  </span>
                </div>
              </div>

              {/* Sender info */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium">Afsender:</span>
                  <span>{preview.from_name}</span>
                </div>
              </div>

              {/* Editing notice */}
              {isEditing && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2 text-sm">
                  <Edit className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-700">
                    Du har foretaget ændringer.
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || isLoadingPreview || !preview || !phone}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sender...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send SMS
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
