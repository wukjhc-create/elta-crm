'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plug,
  Plus,
  Settings,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  Loader2,
  Webhook,
  Link2,
  Activity,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Clock,
  ArrowRight,
} from 'lucide-react'
import {
  getIntegrations,
  getIntegration,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  toggleIntegration,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getEndpoints,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  getIntegrationLogs,
  testIntegrationConnection,
} from '@/lib/actions/integrations'
import {
  ENDPOINT_OPERATION_LABELS,
  type Integration,
  type IntegrationWithRelations,
  type IntegrationWebhook,
  type IntegrationEndpoint,
  type IntegrationLogWithRelations,
  type IntegrationType,
  type AuthType,
  type WebhookEventType,
  type EndpointOperation,
} from '@/types/integrations.types'

// Labels
const TYPE_LABELS: Record<IntegrationType, string> = {
  generic: 'Generisk API',
  economic: 'e-conomic',
  dinero: 'Dinero',
  billy: 'Billy',
  webhook: 'Kun webhooks',
}

const AUTH_LABELS: Record<AuthType, string> = {
  none: 'Ingen',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  api_key: 'API Nøgle',
  oauth2: 'OAuth 2.0',
}

const EVENT_LABELS: Record<WebhookEventType, string> = {
  'offer.created': 'Tilbud oprettet',
  'offer.updated': 'Tilbud opdateret',
  'offer.sent': 'Tilbud sendt',
  'offer.viewed': 'Tilbud set',
  'offer.accepted': 'Tilbud accepteret',
  'offer.rejected': 'Tilbud afvist',
  'offer.expired': 'Tilbud udløbet',
  'project.created': 'Projekt oprettet',
  'project.updated': 'Projekt opdateret',
  'project.status_changed': 'Projekt status ændret',
  'project.completed': 'Projekt afsluttet',
  'project.cancelled': 'Projekt annulleret',
  'customer.created': 'Kunde oprettet',
  'customer.updated': 'Kunde opdateret',
  'custom': 'Brugerdefineret',
}

export function IntegrationsSettingsClient() {
  const router = useRouter()
  const toast = useToast()

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationWithRelations | null>(null)
  const [logs, setLogs] = useState<IntegrationLogWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showWebhookDialog, setShowWebhookDialog] = useState(false)
  const [showEndpointDialog, setShowEndpointDialog] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<IntegrationWebhook | null>(null)
  const [editingEndpoint, setEditingEndpoint] = useState<IntegrationEndpoint | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    integration_type: 'generic' as IntegrationType,
    base_url: '',
    api_key: '',
    api_secret: '',
    auth_type: 'bearer' as AuthType,
  })

  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    event_type: 'offer.accepted' as WebhookEventType,
    http_method: 'POST',
  })

  const [endpointForm, setEndpointForm] = useState({
    name: '',
    endpoint_path: '',
    http_method: 'POST',
    operation: 'create_order' as EndpointOperation,
    description: '',
  })

  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  // Load integrations
  useEffect(() => {
    loadIntegrations()
  }, [])

  // Load logs when integration selected
  useEffect(() => {
    if (selectedIntegration) {
      loadLogs(selectedIntegration.id)
    }
  }, [selectedIntegration])

  const loadIntegrations = async () => {
    setLoading(true)
    const result = await getIntegrations()
    if (result.success && result.data) {
      setIntegrations(result.data)
    }
    setLoading(false)
  }

  const loadIntegrationDetails = async (id: string) => {
    const result = await getIntegration(id)
    if (result.success && result.data) {
      setSelectedIntegration(result.data)
    }
  }

  const loadLogs = async (integrationId: string) => {
    setLoadingLogs(true)
    const result = await getIntegrationLogs({ integrationId, limit: 50 })
    if (result.success && result.data) {
      setLogs(result.data)
    }
    setLoadingLogs(false)
  }

  const handleCreateIntegration = async () => {
    setIsSaving(true)
    const result = await createIntegration(formData)
    if (result.success) {
      toast.success('Integration oprettet')
      setShowCreateDialog(false)
      loadIntegrations()
      resetForm()
    } else {
      toast.error('Fejl', result.error)
    }
    setIsSaving(false)
  }

  const handleUpdateIntegration = async () => {
    if (!selectedIntegration) return
    setIsSaving(true)
    const result = await updateIntegration({
      id: selectedIntegration.id,
      ...formData,
    })
    if (result.success) {
      toast.success('Integration opdateret')
      setShowEditDialog(false)
      loadIntegrations()
      loadIntegrationDetails(selectedIntegration.id)
    } else {
      toast.error('Fejl', result.error)
    }
    setIsSaving(false)
  }

  const handleDeleteIntegration = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne integration?')) return
    const result = await deleteIntegration(id)
    if (result.success) {
      toast.success('Integration slettet')
      setSelectedIntegration(null)
      loadIntegrations()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleToggleIntegration = async (id: string, isActive: boolean) => {
    const result = await toggleIntegration(id, isActive)
    if (result.success) {
      loadIntegrations()
      if (selectedIntegration?.id === id) {
        loadIntegrationDetails(id)
      }
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleTestConnection = async () => {
    if (!selectedIntegration) return
    setIsTesting(true)
    const result = await testIntegrationConnection(selectedIntegration.id)
    if (result.success && result.data) {
      if (result.data.status >= 200 && result.data.status < 300) {
        toast.success('Forbindelse OK', result.data.message)
      } else {
        toast.warning('Forbindelse fejlede', result.data.message)
      }
    } else {
      toast.error('Test fejlede', result.error)
    }
    setIsTesting(false)
  }

  const handleCreateWebhook = async () => {
    if (!selectedIntegration) return
    setIsSaving(true)
    const result = await createWebhook({
      integration_id: selectedIntegration.id,
      ...webhookForm,
    })
    if (result.success) {
      toast.success('Webhook oprettet')
      setShowWebhookDialog(false)
      loadIntegrationDetails(selectedIntegration.id)
      resetWebhookForm()
    } else {
      toast.error('Fejl', result.error)
    }
    setIsSaving(false)
  }

  const handleUpdateWebhook = async () => {
    if (!editingWebhook) return
    setIsSaving(true)
    const result = await updateWebhook({
      id: editingWebhook.id,
      ...webhookForm,
    })
    if (result.success) {
      toast.success('Webhook opdateret')
      setShowWebhookDialog(false)
      setEditingWebhook(null)
      if (selectedIntegration) {
        loadIntegrationDetails(selectedIntegration.id)
      }
      resetWebhookForm()
    } else {
      toast.error('Fejl', result.error)
    }
    setIsSaving(false)
  }

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne webhook?')) return
    const result = await deleteWebhook(id)
    if (result.success) {
      toast.success('Webhook slettet')
      if (selectedIntegration) {
        loadIntegrationDetails(selectedIntegration.id)
      }
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleCreateEndpoint = async () => {
    if (!selectedIntegration) return
    setIsSaving(true)
    const result = await createEndpoint({
      integration_id: selectedIntegration.id,
      ...endpointForm,
    })
    if (result.success) {
      toast.success('Endpoint oprettet')
      setShowEndpointDialog(false)
      loadIntegrationDetails(selectedIntegration.id)
      resetEndpointForm()
    } else {
      toast.error('Fejl', result.error)
    }
    setIsSaving(false)
  }

  const handleUpdateEndpoint = async () => {
    if (!editingEndpoint) return
    setIsSaving(true)
    const result = await updateEndpoint({
      id: editingEndpoint.id,
      ...endpointForm,
    })
    if (result.success) {
      toast.success('Endpoint opdateret')
      setShowEndpointDialog(false)
      setEditingEndpoint(null)
      if (selectedIntegration) {
        loadIntegrationDetails(selectedIntegration.id)
      }
      resetEndpointForm()
    } else {
      toast.error('Fejl', result.error)
    }
    setIsSaving(false)
  }

  const handleDeleteEndpoint = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette dette endpoint?')) return
    const result = await deleteEndpoint(id)
    if (result.success) {
      toast.success('Endpoint slettet')
      if (selectedIntegration) {
        loadIntegrationDetails(selectedIntegration.id)
      }
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      integration_type: 'generic',
      base_url: '',
      api_key: '',
      api_secret: '',
      auth_type: 'bearer',
    })
  }

  const resetWebhookForm = () => {
    setWebhookForm({
      name: '',
      url: '',
      event_type: 'offer.accepted',
      http_method: 'POST',
    })
  }

  const resetEndpointForm = () => {
    setEndpointForm({
      name: '',
      endpoint_path: '',
      http_method: 'POST',
      operation: 'create_order',
      description: '',
    })
  }

  const openEditEndpoint = (endpoint: IntegrationEndpoint) => {
    setEditingEndpoint(endpoint)
    setEndpointForm({
      name: endpoint.name,
      endpoint_path: endpoint.endpoint_path,
      http_method: endpoint.http_method,
      operation: endpoint.operation,
      description: endpoint.description || '',
    })
    setShowEndpointDialog(true)
  }

  const openEditDialog = () => {
    if (!selectedIntegration) return
    setFormData({
      name: selectedIntegration.name,
      description: selectedIntegration.description || '',
      integration_type: selectedIntegration.integration_type,
      base_url: selectedIntegration.base_url || '',
      api_key: selectedIntegration.api_key || '',
      api_secret: selectedIntegration.api_secret || '',
      auth_type: selectedIntegration.auth_type,
    })
    setShowEditDialog(true)
  }

  const openEditWebhook = (webhook: IntegrationWebhook) => {
    setEditingWebhook(webhook)
    setWebhookForm({
      name: webhook.name,
      url: webhook.url,
      event_type: webhook.event_type,
      http_method: webhook.http_method,
    })
    setShowWebhookDialog(true)
  }

  const copyWebhookUrl = () => {
    if (!selectedIntegration) return
    const url = `${window.location.origin}/api/integrations/webhook/${selectedIntegration.id}`
    navigator.clipboard.writeText(url)
    toast.success('URL kopieret')
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('da-DK', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Eksterne Integrationer</h2>
          <p className="text-sm text-gray-500">
            Forbind dit system med eksterne ordre- og ERP-systemer
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Ny integration
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Integration List */}
        <div className="lg:col-span-1 space-y-4">
          {integrations.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center">
              <Plug className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">Ingen integrationer endnu</p>
              <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Opret din første integration
              </Button>
            </div>
          ) : (
            integrations.map((integration) => (
              <button
                key={integration.id}
                onClick={() => loadIntegrationDetails(integration.id)}
                className={`w-full text-left bg-white rounded-lg border p-4 hover:border-blue-300 transition-colors ${
                  selectedIntegration?.id === integration.id ? 'border-blue-500 ring-1 ring-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      integration.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Plug className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium">{integration.name}</div>
                      <div className="text-xs text-gray-500">
                        {TYPE_LABELS[integration.integration_type]}
                      </div>
                    </div>
                  </div>
                  <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                    {integration.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Integration Details */}
        <div className="lg:col-span-2">
          {selectedIntegration ? (
            <div className="bg-white rounded-lg border">
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    selectedIntegration.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <Plug className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{selectedIntegration.name}</h3>
                    <p className="text-sm text-gray-500">{selectedIntegration.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedIntegration.is_active}
                    onCheckedChange={(checked) => handleToggleIntegration(selectedIntegration.id, checked)}
                  />
                  <Button variant="outline" size="sm" onClick={openEditDialog}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    onClick={() => handleDeleteIntegration(selectedIntegration.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="config" className="p-4">
                <TabsList>
                  <TabsTrigger value="config">
                    <Settings className="w-4 h-4 mr-2" />
                    Konfiguration
                  </TabsTrigger>
                  <TabsTrigger value="webhooks">
                    <Webhook className="w-4 h-4 mr-2" />
                    Webhooks ({selectedIntegration.webhooks?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="endpoints">
                    <Link2 className="w-4 h-4 mr-2" />
                    Endpoints ({selectedIntegration.endpoints?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="logs">
                    <Activity className="w-4 h-4 mr-2" />
                    Aktivitet
                  </TabsTrigger>
                </TabsList>

                {/* Config Tab */}
                <TabsContent value="config" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-500 text-xs">Type</Label>
                      <p className="font-medium">{TYPE_LABELS[selectedIntegration.integration_type]}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 text-xs">Autentificering</Label>
                      <p className="font-medium">{AUTH_LABELS[selectedIntegration.auth_type]}</p>
                    </div>
                    {selectedIntegration.base_url && (
                      <div className="col-span-2">
                        <Label className="text-gray-500 text-xs">Base URL</Label>
                        <p className="font-mono text-sm">{selectedIntegration.base_url}</p>
                      </div>
                    )}
                    {selectedIntegration.last_sync_at && (
                      <div>
                        <Label className="text-gray-500 text-xs">Sidst synkroniseret</Label>
                        <p className="font-medium">{formatDate(selectedIntegration.last_sync_at)}</p>
                      </div>
                    )}
                  </div>

                  {/* Inbound Webhook URL */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <Label className="text-blue-700 text-xs font-medium">Indgående Webhook URL</Label>
                    <p className="text-xs text-blue-600 mb-2">
                      Brug denne URL til at modtage opdateringer fra eksterne systemer
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded text-sm font-mono truncate">
                        {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/webhook/${selectedIntegration.id}`}
                      </code>
                      <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Test Connection */}
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={isTesting || !selectedIntegration.base_url}
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Test forbindelse
                    </Button>
                    {selectedIntegration.last_error && (
                      <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        {selectedIntegration.last_error}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Webhooks Tab */}
                <TabsContent value="webhooks" className="space-y-4 mt-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">
                      Udgående webhooks notificerer eksterne systemer når hændelser sker
                    </p>
                    <Button size="sm" onClick={() => setShowWebhookDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Ny webhook
                    </Button>
                  </div>

                  {!selectedIntegration.webhooks || selectedIntegration.webhooks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Webhook className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>Ingen webhooks konfigureret</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedIntegration.webhooks.map((webhook) => (
                        <div
                          key={webhook.id}
                          className="border rounded-lg p-3 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${webhook.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <div>
                              <div className="font-medium text-sm">{webhook.name}</div>
                              <div className="text-xs text-gray-500">
                                {EVENT_LABELS[webhook.event_type]} → {webhook.url.substring(0, 40)}...
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-gray-500">
                              {webhook.success_count} OK / {webhook.failure_count} fejl
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditWebhook(webhook)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => handleDeleteWebhook(webhook.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Endpoints Tab */}
                <TabsContent value="endpoints" className="space-y-4 mt-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">
                      API endpoints til at sende data til det eksterne system
                    </p>
                    <Button size="sm" onClick={() => setShowEndpointDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Nyt endpoint
                    </Button>
                  </div>

                  {!selectedIntegration.endpoints || selectedIntegration.endpoints.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Link2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>Ingen endpoints konfigureret</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedIntegration.endpoints.map((endpoint) => (
                        <div
                          key={endpoint.id}
                          className="border rounded-lg p-3 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${endpoint.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <div>
                              <div className="font-medium text-sm">{endpoint.name}</div>
                              <div className="text-xs text-gray-500 font-mono">
                                {endpoint.http_method} {endpoint.endpoint_path}
                              </div>
                              {endpoint.description && (
                                <div className="text-xs text-gray-400">{endpoint.description}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {ENDPOINT_OPERATION_LABELS[endpoint.operation] || endpoint.operation}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditEndpoint(endpoint)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => handleDeleteEndpoint(endpoint.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Logs Tab */}
                <TabsContent value="logs" className="space-y-4 mt-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">Seneste aktivitet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadLogs(selectedIntegration.id)}
                      disabled={loadingLogs}
                    >
                      {loadingLogs ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>Ingen aktivitet endnu</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className="border rounded-lg p-3 text-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {log.success ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="font-medium">{log.event_type || log.log_type}</span>
                              {log.response_status && (
                                <Badge
                                  variant="default"
                                  className={log.success ? '' : 'bg-red-500 text-white'}
                                >
                                  {log.response_status}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatDate(log.created_at)}
                            </span>
                          </div>
                          {log.request_url && (
                            <div className="text-xs text-gray-500 truncate">
                              {log.request_method} {log.request_url}
                            </div>
                          )}
                          {log.error_message && (
                            <div className="text-xs text-red-600 mt-1">
                              {log.error_message}
                            </div>
                          )}
                          {log.duration_ms && (
                            <div className="text-xs text-gray-400 mt-1">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {log.duration_ms}ms
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-12 text-center">
              <Plug className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Vælg en integration for at se detaljer</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Integration Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny Integration</DialogTitle>
            <DialogDescription>
              Opret forbindelse til et eksternt system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Navn *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="F.eks. e-conomic, Dinero, etc."
              />
            </div>

            <div className="space-y-2">
              <Label>Beskrivelse</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Valgfri beskrivelse..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.integration_type}
                  onValueChange={(value) => setFormData({ ...formData, integration_type: value as IntegrationType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Autentificering</Label>
                <Select
                  value={formData.auth_type}
                  onValueChange={(value) => setFormData({ ...formData, auth_type: value as AuthType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUTH_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="https://api.example.com"
              />
            </div>

            {formData.auth_type !== 'none' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Nøgle / Token</Label>
                  <Input
                    type="password"
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
                {formData.auth_type === 'basic' && (
                  <div className="space-y-2">
                    <Label>Secret / Password</Label>
                    <Input
                      type="password"
                      value={formData.api_secret}
                      onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuller
            </Button>
            <Button onClick={handleCreateIntegration} disabled={isSaving || !formData.name}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Opret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Integration Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rediger Integration</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Navn *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Beskrivelse</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>API Nøgle / Token</Label>
              <Input
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Lad tom for at beholde eksisterende"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuller
            </Button>
            <Button onClick={handleUpdateIntegration} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Gem ændringer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Endpoint Dialog */}
      <Dialog open={showEndpointDialog} onOpenChange={(open) => {
        setShowEndpointDialog(open)
        if (!open) {
          setEditingEndpoint(null)
          resetEndpointForm()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEndpoint ? 'Rediger Endpoint' : 'Nyt Endpoint'}</DialogTitle>
            <DialogDescription>
              Konfigurer API endpoint til eksternt system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Navn *</Label>
              <Input
                value={endpointForm.name}
                onChange={(e) => setEndpointForm({ ...endpointForm, name: e.target.value })}
                placeholder="F.eks. Opret ordre"
              />
            </div>

            <div className="space-y-2">
              <Label>Sti *</Label>
              <Input
                value={endpointForm.endpoint_path}
                onChange={(e) => setEndpointForm({ ...endpointForm, endpoint_path: e.target.value })}
                placeholder="/api/v1/orders"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>HTTP Metode</Label>
                <Select
                  value={endpointForm.http_method}
                  onValueChange={(value) => setEndpointForm({ ...endpointForm, http_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Operation</Label>
                <Select
                  value={endpointForm.operation}
                  onValueChange={(value) => setEndpointForm({ ...endpointForm, operation: value as EndpointOperation })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ENDPOINT_OPERATION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Beskrivelse</Label>
              <Textarea
                value={endpointForm.description}
                onChange={(e) => setEndpointForm({ ...endpointForm, description: e.target.value })}
                placeholder="Valgfri beskrivelse..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndpointDialog(false)}>
              Annuller
            </Button>
            <Button
              onClick={editingEndpoint ? handleUpdateEndpoint : handleCreateEndpoint}
              disabled={isSaving || !endpointForm.name || !endpointForm.endpoint_path}
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingEndpoint ? 'Gem ændringer' : 'Opret endpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook Dialog */}
      <Dialog open={showWebhookDialog} onOpenChange={(open) => {
        setShowWebhookDialog(open)
        if (!open) {
          setEditingWebhook(null)
          resetWebhookForm()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWebhook ? 'Rediger Webhook' : 'Ny Webhook'}</DialogTitle>
            <DialogDescription>
              Konfigurer udgående notifikation til eksternt system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Navn *</Label>
              <Input
                value={webhookForm.name}
                onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                placeholder="F.eks. Send til ordresystem"
              />
            </div>

            <div className="space-y-2">
              <Label>URL *</Label>
              <Input
                value={webhookForm.url}
                onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                placeholder="https://example.com/webhook"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hændelse</Label>
                <Select
                  value={webhookForm.event_type}
                  onValueChange={(value) => setWebhookForm({ ...webhookForm, event_type: value as WebhookEventType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>HTTP Metode</Label>
                <Select
                  value={webhookForm.http_method}
                  onValueChange={(value) => setWebhookForm({ ...webhookForm, http_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookDialog(false)}>
              Annuller
            </Button>
            <Button
              onClick={editingWebhook ? handleUpdateWebhook : handleCreateWebhook}
              disabled={isSaving || !webhookForm.name || !webhookForm.url}
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingWebhook ? 'Gem ændringer' : 'Opret webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
