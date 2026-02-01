'use client'

/**
 * SEND EMAIL MODAL
 *
 * Modal for previewing and sending offer emails:
 * - Template selection
 * - Subject/body editing
 * - Preview rendering
 * - Send confirmation
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  generateEmailPreview,
  getEmailTemplates,
  sendOfferEmail,
} from '@/lib/actions/email'
import type { EmailTemplate, EmailPreview } from '@/types/email.types'
import {
  Send,
  Eye,
  Edit,
  Loader2,
  Mail,
  AlertTriangle,
  CheckCircle,
  FileText,
  RefreshCw,
} from 'lucide-react'

interface SendEmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  offerId: string
  onEmailSent?: () => void
}

export function SendEmailModal({
  open,
  onOpenChange,
  offerId,
  onEmailSent,
}: SendEmailModalProps) {
  const toast = useToast()

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('offer_send')
  const [preview, setPreview] = useState<EmailPreview | null>(null)

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
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
      const data = await getEmailTemplates({ type: 'offer', active_only: true })
      setTemplates(data)

      // Also get reminder templates
      const reminders = await getEmailTemplates({ type: 'reminder', active_only: true })
      setTemplates([...data, ...reminders])
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
      const result = await generateEmailPreview({
        offer_id: offerId,
        template_code: selectedTemplate,
      })

      if (result.success && result.data) {
        setPreview(result.data)
        setSubject(result.data.subject)
        setBodyHtml(result.data.body_html)
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
      const result = await sendOfferEmail({
        offer_id: offerId,
        template_code: selectedTemplate,
        subject: isEditing ? subject : undefined,
        body_html: isEditing ? bodyHtml : undefined,
      })

      if (result.success) {
        toast?.success('E-mail sendt', 'Tilbuddet er sendt til kunden')
        onOpenChange(false)
        onEmailSent?.()
      } else {
        setError(result.error || 'Kunne ikke sende e-mail')
        toast?.error('Fejl', result.error || 'Kunne ikke sende e-mail')
      }
    } catch (error) {
      console.error('Error sending email:', error)
      setError('Uventet fejl ved afsendelse')
    } finally {
      setIsSending(false)
    }
  }

  const resetToTemplate = () => {
    if (preview) {
      setSubject(preview.subject)
      setBodyHtml(preview.body_html)
      setIsEditing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send tilbud via e-mail
          </DialogTitle>
          <DialogDescription>
            Forhåndsvis og tilpas e-mailen før afsendelse
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Template selector */}
          <div className="space-y-2">
            <Label>E-mail skabelon</Label>
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
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Genererer forhåndsvisning...
            </div>
          ) : preview ? (
            <>
              {/* Recipient info */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-xs text-muted-foreground">Fra</Label>
                  <p className="text-sm">{preview.from_name} &lt;{preview.from_email}&gt;</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Til</Label>
                  <p className="text-sm">{preview.to_name} &lt;{preview.to_email}&gt;</p>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Emne</Label>
                  {!isEditing && (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                      <Edit className="h-3 w-3 mr-1" />
                      Rediger
                    </Button>
                  )}
                </div>
                <Input
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value)
                    setIsEditing(true)
                  }}
                  disabled={!isEditing}
                />
              </div>

              {/* Email content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Indhold</Label>
                  {isEditing && (
                    <Button variant="ghost" size="sm" onClick={resetToTemplate}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Nulstil til skabelon
                    </Button>
                  )}
                </div>

                <Tabs defaultValue="preview">
                  <TabsList>
                    <TabsTrigger value="preview">
                      <Eye className="h-4 w-4 mr-1" />
                      Forhåndsvisning
                    </TabsTrigger>
                    <TabsTrigger value="edit">
                      <Edit className="h-4 w-4 mr-1" />
                      HTML
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="mt-2">
                    <div className="border rounded-lg bg-white overflow-hidden">
                      <iframe
                        srcDoc={bodyHtml}
                        className="w-full h-[400px]"
                        title="E-mail forhåndsvisning"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="edit" className="mt-2">
                    <Textarea
                      value={bodyHtml}
                      onChange={(e) => {
                        setBodyHtml(e.target.value)
                        setIsEditing(true)
                      }}
                      className="font-mono text-xs h-[400px]"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Editing notice */}
              {isEditing && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2 text-sm">
                  <Edit className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-700">
                    Du har foretaget ændringer. E-mailen sendes med dit tilpassede indhold.
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || isLoadingPreview || !preview}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sender...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send e-mail
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
