'use client'

/**
 * EMAIL SETTINGS CLIENT
 *
 * Settings page for:
 * - SMTP configuration
 * - Email templates management
 * - Test email functionality
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
import { updateCompanySettings } from '@/lib/actions/settings'
import {
  updateEmailTemplate,
  createEmailTemplate,
  deleteEmailTemplate,
  testSmtpConnectionAction,
  sendTestEmailAction,
  getEmailStats,
} from '@/lib/actions/email'
import type { EmailTemplate, EmailTemplateCreate, EmailTemplateUpdate } from '@/types/email.types'
import type { CompanySettings } from '@/types/company-settings.types'
import {
  Mail,
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
  Eye,
  AlertTriangle,
  BarChart3,
  MailOpen,
  MousePointerClick,
  AlertCircle,
} from 'lucide-react'

interface EmailSettingsClientProps {
  initialSmtpSettings: {
    host: string | null
    port: number | null
    user: string | null
    password: string | null
    fromEmail: string | null
    fromName: string | null
  } | null
  initialCompanySettings: CompanySettings | null
  initialTemplates: EmailTemplate[]
}

export function EmailSettingsClient({
  initialSmtpSettings,
  initialCompanySettings,
  initialTemplates,
}: EmailSettingsClientProps) {
  const toast = useToast()

  // SMTP Settings state
  const [smtpHost, setSmtpHost] = useState(initialSmtpSettings?.host || '')
  const [smtpPort, setSmtpPort] = useState(initialSmtpSettings?.port?.toString() || '587')
  const [smtpUser, setSmtpUser] = useState(initialSmtpSettings?.user || '')
  const [smtpPassword, setSmtpPassword] = useState(initialSmtpSettings?.password || '')
  const [smtpFromEmail, setSmtpFromEmail] = useState(initialSmtpSettings?.fromEmail || '')
  const [smtpFromName, setSmtpFromName] = useState(initialSmtpSettings?.fromName || '')

  const [isSavingSmtp, setIsSavingSmtp] = useState(false)
  const [isTestingSmtp, setIsTestingSmtp] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // Test email state
  const [testEmailAddress, setTestEmailAddress] = useState('')
  const [isSendingTest, setIsSendingTest] = useState(false)

  // Stats state
  const [emailStats, setEmailStats] = useState<{
    total_sent: number
    total_opened: number
    total_clicked: number
    total_bounced: number
    open_rate: number
    click_rate: number
  } | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  const loadStats = async (days?: number) => {
    setIsLoadingStats(true)
    try {
      const stats = await getEmailStats({ days: days || 30 })
      setEmailStats(stats)
    } catch {
      toast?.error('Fejl', 'Kunne ikke hente statistik')
    } finally {
      setIsLoadingStats(false)
    }
  }

  // =====================================================
  // SMTP HANDLERS
  // =====================================================

  const handleSaveSmtp = async () => {
    setIsSavingSmtp(true)
    try {
      const result = await updateCompanySettings({
        smtp_host: smtpHost || null,
        smtp_port: smtpPort ? parseInt(smtpPort) : null,
        smtp_user: smtpUser || null,
        smtp_password: smtpPassword || null,
        smtp_from_email: smtpFromEmail || null,
        smtp_from_name: smtpFromName || null,
      })

      if (result.success) {
        toast?.success('Gemt', 'SMTP indstillinger er opdateret')
      } else {
        toast?.error('Fejl', result.error || 'Kunne ikke gemme indstillinger')
      }
    } catch (error) {
      toast?.error('Fejl', 'Uventet fejl')
    } finally {
      setIsSavingSmtp(false)
    }
  }

  const handleTestSmtp = async () => {
    setIsTestingSmtp(true)
    setSmtpTestResult(null)

    try {
      const result = await testSmtpConnectionAction({
        host: smtpHost,
        port: parseInt(smtpPort) || 587,
        user: smtpUser,
        password: smtpPassword,
        fromEmail: smtpFromEmail,
        fromName: smtpFromName,
      })

      setSmtpTestResult({
        success: result.success,
        message: result.success
          ? 'Forbindelse til SMTP server lykkedes!'
          : result.error || 'Kunne ikke oprette forbindelse',
      })
    } catch (error) {
      setSmtpTestResult({
        success: false,
        message: 'Uventet fejl ved test af forbindelse',
      })
    } finally {
      setIsTestingSmtp(false)
    }
  }

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      toast?.error('Mangler e-mail', 'Indtast en e-mail adresse')
      return
    }

    setIsSendingTest(true)
    try {
      const result = await sendTestEmailAction(
        testEmailAddress,
        {
          host: smtpHost,
          port: parseInt(smtpPort) || 587,
          user: smtpUser,
          password: smtpPassword,
          fromEmail: smtpFromEmail,
          fromName: smtpFromName,
        }
      )

      if (result.success) {
        toast?.success('Sendt', `Test e-mail sendt til ${testEmailAddress}`)
      } else {
        toast?.error('Fejl', result.error || 'Kunne ikke sende test e-mail')
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

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setIsTemplateDialogOpen(true)
  }

  const handleNewTemplate = () => {
    setEditingTemplate(null)
    setIsTemplateDialogOpen(true)
  }

  const handleSaveTemplate = async (data: EmailTemplateCreate | EmailTemplateUpdate) => {
    setIsSavingTemplate(true)
    try {
      if (editingTemplate) {
        // Update existing
        const result = await updateEmailTemplate(editingTemplate.id, data as EmailTemplateUpdate)
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
        // Create new
        const result = await createEmailTemplate(data as EmailTemplateCreate)
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
      const result = await deleteEmailTemplate(id)
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
      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp">
            <Server className="h-4 w-4 mr-2" />
            SMTP Konfiguration
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="h-4 w-4 mr-2" />
            E-mail skabeloner
          </TabsTrigger>
          <TabsTrigger value="stats" onClick={() => !emailStats && loadStats()}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Statistik
          </TabsTrigger>
        </TabsList>

        {/* SMTP Tab */}
        <TabsContent value="smtp" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                SMTP Server
              </CardTitle>
              <CardDescription>
                Konfigurer din udgående e-mail server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input
                    id="smtp-host"
                    placeholder="smtp.example.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Brugernavn</Label>
                  <Input
                    id="smtp-user"
                    placeholder="user@example.com"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">Adgangskode</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    placeholder="••••••••"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-email">Afsender e-mail</Label>
                  <Input
                    id="smtp-from-email"
                    placeholder="noreply@example.com"
                    value={smtpFromEmail}
                    onChange={(e) => setSmtpFromEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">Afsender navn</Label>
                  <Input
                    id="smtp-from-name"
                    placeholder="Elta Solar"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                  />
                </div>
              </div>

              {/* Test result */}
              {smtpTestResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  smtpTestResult.success
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {smtpTestResult.success ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  {smtpTestResult.message}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveSmtp} disabled={isSavingSmtp}>
                  {isSavingSmtp ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Gem indstillinger
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestSmtp}
                  disabled={isTestingSmtp || !smtpHost}
                >
                  {isTestingSmtp ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Test forbindelse
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Test Email */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send test e-mail
              </CardTitle>
              <CardDescription>
                Verificer at e-mails sendes korrekt
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="test@example.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest || !smtpHost || !testEmailAddress}
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
                    E-mail skabeloner
                  </CardTitle>
                  <CardDescription>
                    Administrer skabeloner til tilbuds-e-mails
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

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    E-mail statistik
                  </CardTitle>
                  <CardDescription>
                    Overblik over sendte e-mails og engagement
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadStats(7)}
                  >
                    7 dage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadStats(30)}
                  >
                    30 dage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadStats(90)}
                  >
                    90 dage
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : emailStats ? (
                <div className="space-y-6">
                  {/* Main stats grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-blue-600 mb-1">
                        <Send className="h-4 w-4" />
                        <span className="text-sm font-medium">Sendt</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-700">
                        {emailStats.total_sent}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-green-600 mb-1">
                        <MailOpen className="h-4 w-4" />
                        <span className="text-sm font-medium">Åbnet</span>
                      </div>
                      <p className="text-2xl font-bold text-green-700">
                        {emailStats.total_opened}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {emailStats.open_rate.toFixed(1)}% åbningsrate
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-purple-600 mb-1">
                        <MousePointerClick className="h-4 w-4" />
                        <span className="text-sm font-medium">Klikket</span>
                      </div>
                      <p className="text-2xl font-bold text-purple-700">
                        {emailStats.total_clicked}
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        {emailStats.click_rate.toFixed(1)}% klikrate
                      </p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-red-600 mb-1">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Fejlet</span>
                      </div>
                      <p className="text-2xl font-bold text-red-700">
                        {emailStats.total_bounced}
                      </p>
                    </div>
                  </div>

                  {/* Rate bars */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Åbningsrate</span>
                        <span className="font-medium">{emailStats.open_rate.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${Math.min(emailStats.open_rate, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Klikrate</span>
                        <span className="font-medium">{emailStats.click_rate.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${Math.min(emailStats.click_rate, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Leveringsrate</span>
                        <span className="font-medium">
                          {emailStats.total_sent > 0
                            ? (((emailStats.total_sent - emailStats.total_bounced) / emailStats.total_sent) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{
                            width: `${emailStats.total_sent > 0
                              ? Math.min(((emailStats.total_sent - emailStats.total_bounced) / emailStats.total_sent) * 100, 100)
                              : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Vælg en tidsperiode for at se statistik</p>
                </div>
              )}
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
  template: EmailTemplate | null
  onSave: (data: EmailTemplateCreate | EmailTemplateUpdate) => void
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
  const [subjectTemplate, setSubjectTemplate] = useState('')
  const [bodyHtmlTemplate, setBodyHtmlTemplate] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)

  // Reset form when template changes
  useState(() => {
    if (template) {
      setCode(template.code)
      setName(template.name)
      setDescription(template.description || '')
      setSubjectTemplate(template.subject_template)
      setBodyHtmlTemplate(template.body_html_template)
      setIsActive(template.is_active)
      setIsDefault(template.is_default)
    } else {
      setCode('')
      setName('')
      setDescription('')
      setSubjectTemplate('')
      setBodyHtmlTemplate('')
      setIsActive(true)
      setIsDefault(false)
    }
  })

  const handleSubmit = () => {
    if (template) {
      onSave({
        name,
        description: description || undefined,
        subject_template: subjectTemplate,
        body_html_template: bodyHtmlTemplate,
        is_active: isActive,
        is_default: isDefault,
      })
    } else {
      onSave({
        code,
        name,
        description: description || undefined,
        template_type: 'offer',
        subject_template: subjectTemplate,
        body_html_template: bodyHtmlTemplate,
        is_active: isActive,
        is_default: isDefault,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Rediger skabelon' : 'Ny skabelon'}
          </DialogTitle>
          <DialogDescription>
            Tilpas e-mail skabelonen. Brug {`{{variabel}}`} for dynamiske værdier.
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
                placeholder="offer_custom"
              />
            </div>
            <div className="space-y-2">
              <Label>Navn</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tilpasset tilbud"
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
            <Label>Emne</Label>
            <Input
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              placeholder="Tilbud {{offer_number}} fra {{company_name}}"
            />
          </div>

          <div className="space-y-2">
            <Label>Indhold (HTML)</Label>
            <Textarea
              value={bodyHtmlTemplate}
              onChange={(e) => setBodyHtmlTemplate(e.target.value)}
              className="font-mono text-xs h-64"
              placeholder="<h1>Kære {{customer_name}}</h1>..."
            />
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
              {`{{customer_name}}, {{offer_number}}, {{offer_title}}, {{total_amount}}, {{valid_until}}, {{portal_link}}, {{company_name}}, {{company_email}}, {{sender_name}}, {{tracking_pixel}}`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuller
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !name || !subjectTemplate}>
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
