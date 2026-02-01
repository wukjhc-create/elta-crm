'use client'

/**
 * SMS SETTINGS CLIENT
 *
 * Settings page for:
 * - GatewayAPI configuration
 * - SMS templates management
 * - Test SMS functionality
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import {
  updateSmsSettings,
  updateSmsTemplate,
  createSmsTemplate,
  deleteSmsTemplate,
  testGatewayApiConnection,
  sendTestSms,
} from '@/lib/actions/sms'
import type { SmsTemplate, SmsTemplateCreate, SmsTemplateUpdate, SmsSettings } from '@/types/sms.types'
import {
  MessageSquare,
  Server,
  FileText,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  Plus,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react'

interface SmsSettingsClientProps {
  initialSettings: SmsSettings | null
  initialTemplates: SmsTemplate[]
}

export function SmsSettingsClient({
  initialSettings,
  initialTemplates,
}: SmsSettingsClientProps) {
  const toast = useToast()

  // GatewayAPI Settings state
  const [apiKey, setApiKey] = useState(initialSettings?.apiKey || '')
  const [secret, setSecret] = useState(initialSettings?.secret || '')
  const [senderName, setSenderName] = useState(initialSettings?.senderName || 'Elta Solar')
  const [enabled, setEnabled] = useState(initialSettings?.enabled || false)

  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    balance?: number
    currency?: string
  } | null>(null)

  // Templates state
  const [templates, setTemplates] = useState<SmsTemplate[]>(initialTemplates)
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // Test SMS state
  const [testPhone, setTestPhone] = useState('')
  const [isSendingTest, setIsSendingTest] = useState(false)

  // =====================================================
  // SETTINGS HANDLERS
  // =====================================================

  const handleSaveSettings = async () => {
    setIsSaving(true)
    try {
      const result = await updateSmsSettings({
        apiKey: apiKey || null,
        secret: secret || null,
        senderName: senderName || null,
        enabled,
      })

      if (result.success) {
        toast?.success('Gemt', 'SMS indstillinger er opdateret')
      } else {
        toast?.error('Fejl', result.error || 'Kunne ikke gemme indstillinger')
      }
    } catch (error) {
      toast?.error('Fejl', 'Uventet fejl')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testGatewayApiConnection({
        apiKey,
        secret,
      })

      if (result.success && result.data) {
        setTestResult({
          success: true,
          message: 'Forbindelse til GatewayAPI lykkedes!',
          balance: result.data.balance,
          currency: result.data.currency,
        })
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Kunne ikke oprette forbindelse',
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Uventet fejl ved test af forbindelse',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSendTestSms = async () => {
    if (!testPhone) {
      toast?.error('Mangler telefon', 'Indtast et telefonnummer')
      return
    }

    setIsSendingTest(true)
    try {
      const result = await sendTestSms(testPhone, {
        apiKey,
        secret,
        senderName,
      })

      if (result.success) {
        toast?.success('Sendt', `Test SMS sendt til ${testPhone}`)
      } else {
        toast?.error('Fejl', result.error || 'Kunne ikke sende test SMS')
      }
    } catch (error) {
      toast?.error('Fejl', 'Uventet fejl ved afsendelse')
    } finally {
      setIsSendingTest(false)
    }
  }

  // =====================================================
  // TEMPLATE HANDLERS
  // =====================================================

  const handleEditTemplate = (template: SmsTemplate) => {
    setEditingTemplate(template)
    setIsTemplateDialogOpen(true)
  }

  const handleNewTemplate = () => {
    setEditingTemplate(null)
    setIsTemplateDialogOpen(true)
  }

  const handleSaveTemplate = async (data: SmsTemplateCreate | SmsTemplateUpdate) => {
    setIsSavingTemplate(true)
    try {
      if (editingTemplate) {
        const result = await updateSmsTemplate(editingTemplate.id, data as SmsTemplateUpdate)
        if (result.success) {
          setTemplates(prev =>
            prev.map(t =>
              t.id === editingTemplate.id ? { ...t, ...data } : t
            )
          )
          toast?.success('Gemt', 'Skabelon opdateret')
          setIsTemplateDialogOpen(false)
        } else {
          toast?.error('Fejl', result.error || 'Fejl ved opdatering')
        }
      } else {
        const result = await createSmsTemplate(data as SmsTemplateCreate)
        if (result.success && result.data) {
          setTemplates(prev => [...prev, result.data!])
          toast?.success('Oprettet', 'Skabelon oprettet')
          setIsTemplateDialogOpen(false)
        } else {
          toast?.error('Fejl', result.error || 'Fejl ved oprettelse')
        }
      }
    } catch (error) {
      toast?.error('Fejl', 'Uventet fejl')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne skabelon?')) return

    try {
      const result = await deleteSmsTemplate(id)
      if (result.success) {
        setTemplates(prev => prev.filter(t => t.id !== id))
        toast?.success('Slettet', 'Skabelon slettet')
      } else {
        toast?.error('Fejl', result.error || 'Fejl ved sletning')
      }
    } catch (error) {
      toast?.error('Fejl', 'Uventet fejl')
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="gateway">
        <TabsList>
          <TabsTrigger value="gateway">
            <Server className="h-4 w-4 mr-2" />
            GatewayAPI
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="h-4 w-4 mr-2" />
            SMS skabeloner
          </TabsTrigger>
        </TabsList>

        {/* GatewayAPI Tab */}
        <TabsContent value="gateway" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                GatewayAPI Konfiguration
              </CardTitle>
              <CardDescription>
                Opret en konto på{' '}
                <a
                  href="https://gatewayapi.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  gatewayapi.com
                </a>
                {' '}for at få API credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label htmlFor="sms-enabled" className="font-medium">SMS aktiveret</Label>
                  <p className="text-sm text-muted-foreground">
                    Aktiver eller deaktiver SMS funktionen
                  </p>
                </div>
                <Switch
                  id="sms-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    placeholder="Din API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret">Secret</Label>
                  <Input
                    id="secret"
                    type="password"
                    placeholder="Din API secret"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sender-name">Afsendernavn</Label>
                <Input
                  id="sender-name"
                  placeholder="Elta Solar"
                  maxLength={11}
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Max 11 tegn. Vises som afsender på SMS.
                </p>
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {testResult.success ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      <div>
                        <p>{testResult.message}</p>
                        {testResult.balance !== undefined && (
                          <p className="text-sm flex items-center gap-1 mt-1">
                            <Wallet className="h-4 w-4" />
                            Saldo: {(testResult.balance / 100).toFixed(2)} {testResult.currency}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5" />
                      {testResult.message}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Gem indstillinger
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !apiKey || !secret}
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Test forbindelse
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Test SMS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send test SMS
              </CardTitle>
              <CardDescription>
                Verificer at SMS sendes korrekt
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="+45 12 34 56 78"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  onClick={handleSendTestSms}
                  disabled={isSendingTest || !apiKey || !secret || !testPhone}
                >
                  {isSendingTest ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send test
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    SMS skabeloner
                  </CardTitle>
                  <CardDescription>
                    Administrer skabeloner til SMS beskeder
                  </CardDescription>
                </div>
                <Button onClick={handleNewTemplate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ny skabelon
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Navn</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Handlinger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-muted-foreground">
                              {template.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {template.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{template.template_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {template.is_active ? (
                            <Badge className="bg-green-100 text-green-700">Aktiv</Badge>
                          ) : (
                            <Badge variant="secondary">Inaktiv</Badge>
                          )}
                          {template.is_default && (
                            <Badge variant="outline">Standard</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTemplate(template)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Edit Dialog */}
      <TemplateDialog
        open={isTemplateDialogOpen}
        onOpenChange={setIsTemplateDialogOpen}
        template={editingTemplate}
        onSave={handleSaveTemplate}
        isSaving={isSavingTemplate}
      />
    </div>
  )
}

// =====================================================
// TEMPLATE DIALOG COMPONENT
// =====================================================

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: SmsTemplate | null
  onSave: (data: SmsTemplateCreate | SmsTemplateUpdate) => void
  isSaving: boolean
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSave,
  isSaving,
}: TemplateDialogProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [messageTemplate, setMessageTemplate] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)

  // Reset form when template changes
  useState(() => {
    if (template) {
      setCode(template.code)
      setName(template.name)
      setDescription(template.description || '')
      setMessageTemplate(template.message_template)
      setIsActive(template.is_active)
      setIsDefault(template.is_default)
    } else {
      setCode('')
      setName('')
      setDescription('')
      setMessageTemplate('')
      setIsActive(true)
      setIsDefault(false)
    }
  })

  // Calculate character count
  const charCount = messageTemplate.length
  const isUnicode = /[^\x00-\x7F]/.test(messageTemplate) && !/^[\x20-\x7E\n\r]*$/.test(messageTemplate)
  const singleSmsLimit = isUnicode ? 70 : 160

  const handleSubmit = () => {
    if (template) {
      onSave({
        name,
        description: description || undefined,
        message_template: messageTemplate,
        is_active: isActive,
        is_default: isDefault,
      })
    } else {
      onSave({
        code,
        name,
        description: description || undefined,
        template_type: 'custom',
        message_template: messageTemplate,
        is_active: isActive,
        is_default: isDefault,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Rediger skabelon' : 'Ny skabelon'}
          </DialogTitle>
          <DialogDescription>
            Brug {`{{variabel}}`} for dynamiske værdier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kode</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!!template}
                placeholder="custom_sms"
              />
            </div>
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tilpasset SMS"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Beskrivelse</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kort beskrivelse af skabelonen"
            />
          </div>

          <div className="space-y-2">
            <Label>Besked</Label>
            <Textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
              placeholder="Hej {{customer_name}}! ..."
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {charCount} tegn
                {isUnicode && ' (unicode)'}
              </span>
              <span className={charCount > singleSmsLimit ? 'text-yellow-600' : ''}>
                {charCount > singleSmsLimit
                  ? `${Math.ceil(charCount / (isUnicode ? 67 : 153))} SMS dele`
                  : '1 SMS'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktiv</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <Label>Standard skabelon</Label>
            </div>
          </div>

          {/* Available variables hint */}
          <div className="bg-muted/50 p-3 rounded-lg text-sm">
            <p className="font-medium mb-1">Tilgængelige variabler:</p>
            <p className="text-muted-foreground text-xs">
              {`{{customer_name}}, {{offer_number}}, {{portal_link}}, {{company_name}}, {{valid_until}}`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !name || !messageTemplate}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
