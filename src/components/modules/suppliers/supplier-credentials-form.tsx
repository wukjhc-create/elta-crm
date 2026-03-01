'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Shield,
  Upload,
  Info,
} from 'lucide-react'
import Link from 'next/link'
import {
  getSupplierCredentials,
  createSupplierCredential,
  updateSupplierCredential,
  deleteSupplierCredential,
  testSupplierConnection,
  type SupplierCredential,
  type CredentialType,
  type CredentialEnvironment,
} from '@/lib/actions/credentials'

interface SupplierCredentialsFormProps {
  supplierId: string
  supplierCode: string | null
}

interface CredentialFormData {
  credential_type: CredentialType
  api_endpoint: string
  environment: CredentialEnvironment
  username: string
  password: string
  api_key: string
  client_id: string
  client_secret: string
  customer_number: string
  price_list_code: string
  notes: string
}

const EMPTY_FORM: CredentialFormData = {
  credential_type: 'api',
  api_endpoint: '',
  environment: 'production',
  username: '',
  password: '',
  api_key: '',
  client_id: '',
  client_secret: '',
  customer_number: '',
  price_list_code: '',
  notes: '',
}

export function SupplierCredentialsForm({ supplierId, supplierCode }: SupplierCredentialsFormProps) {
  const toast = useToast()
  const [credentials, setCredentials] = useState<SupplierCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [formData, setFormData] = useState<CredentialFormData>(EMPTY_FORM)

  // Determine which fields to show based on supplier
  const supplierFields = getSupplierFields(supplierCode)

  useEffect(() => {
    loadCredentials()
  }, [supplierId])

  async function loadCredentials() {
    setLoading(true)
    const result = await getSupplierCredentials(supplierId)
    if (result.success && result.data) {
      setCredentials(result.data)
    }
    setLoading(false)
  }

  async function handleCreate() {
    setSaving(true)
    const result = await createSupplierCredential({
      supplier_id: supplierId,
      credential_type: formData.credential_type,
      api_endpoint: formData.api_endpoint || undefined,
      environment: formData.environment,
      notes: formData.notes || undefined,
      credentials: {
        username: formData.username || undefined,
        password: formData.password || undefined,
        api_key: formData.api_key || undefined,
        client_id: formData.client_id || undefined,
        client_secret: formData.client_secret || undefined,
        customer_number: formData.customer_number || undefined,
        price_list_code: formData.price_list_code || undefined,
      },
    })

    setSaving(false)
    if (result.success) {
      toast.success('Loginoplysninger gemt')
      setFormData(EMPTY_FORM)
      setShowAddForm(false)
      loadCredentials()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Er du sikker på at du vil slette disse loginoplysninger?')) return

    const result = await deleteSupplierCredential(id)
    if (result.success) {
      toast.success('Loginoplysninger slettet')
      loadCredentials()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  async function handleTest(id: string) {
    setTesting(id)
    const result = await testSupplierConnection(id)
    setTesting(null)

    if (result.success && result.data) {
      if (result.data.status === 'success') {
        toast.success('Test lykkedes', result.data.message)
      } else {
        toast.error('Test fejlede', result.data.message)
      }
      loadCredentials()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  async function handleToggleActive(credential: SupplierCredential) {
    const result = await updateSupplierCredential(credential.id, {
      is_active: !credential.is_active,
    })

    if (result.success) {
      toast.success(credential.is_active ? 'Deaktiveret' : 'Aktiveret')
      loadCredentials()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // LM uses CSV import only — show info panel instead of credential form
  if (supplierFields.isCSVOnly) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            CSV-import fra Classic Portal
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Lemvigh-Müller bruger CSV-import fra Classic Portal. Ingen API-login nødvendig.
          </p>
        </div>
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Sådan opdaterer du priser fra Lemvigh-Müller</p>
            <ol className="mt-2 space-y-1 list-decimal list-inside text-blue-700">
              <li>Log ind på <a href="https://classic.lemu.dk" target="_blank" rel="noopener noreferrer" className="underline font-medium">classic.lemu.dk</a></li>
              <li>Eksporter din prisliste som CSV-fil</li>
              <li>Upload filen under <strong>Importhistorik</strong>-fanen</li>
            </ol>
            <div className="mt-3">
              <Link href={`/dashboard/settings/suppliers/${supplierId}/import`}>
                <Button size="sm" variant="outline">
                  <Upload className="w-4 h-4 mr-2" />
                  Gå til import
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            API Loginoplysninger
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Gem loginoplysninger til leverandørens API for automatisk prissynkronisering
          </p>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Tilføj login
          </Button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="border rounded-lg p-6 bg-blue-50/50">
          <h4 className="font-medium mb-4">Tilføj nye loginoplysninger</h4>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <Label>Type</Label>
              <select
                className="w-full mt-1 rounded-md border border-gray-200 p-2"
                value={formData.credential_type}
                onChange={(e) => setFormData({ ...formData, credential_type: e.target.value as CredentialType })}
              >
                <option value="api">API</option>
                <option value="ftp">FTP</option>
                <option value="web">Web Login</option>
              </select>
            </div>

            {/* Environment */}
            <div>
              <Label>Miljø</Label>
              <select
                className="w-full mt-1 rounded-md border border-gray-200 p-2"
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value as CredentialEnvironment })}
              >
                <option value="production">Produktion</option>
                <option value="sandbox">Sandbox</option>
                <option value="test">Test</option>
              </select>
            </div>

            {/* API Endpoint */}
            {supplierFields.showEndpoint && (
              <div className="col-span-2">
                <Label>API Endpoint URL</Label>
                <Input
                  className="mt-1"
                  placeholder={supplierFields.endpointPlaceholder}
                  value={formData.api_endpoint}
                  onChange={(e) => setFormData({ ...formData, api_endpoint: e.target.value })}
                />
              </div>
            )}

            {/* Username */}
            {supplierFields.showUsername && (
              <div>
                <Label>Brugernavn</Label>
                <Input
                  className="mt-1"
                  placeholder="Indtast brugernavn"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            )}

            {/* Password */}
            {supplierFields.showPassword && (
              <div>
                <Label>Adgangskode</Label>
                <div className="relative">
                  <Input
                    className="mt-1 pr-10"
                    type={showPasswords['new'] ? 'text' : 'password'}
                    placeholder="Indtast adgangskode"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords['new'] })}
                  >
                    {showPasswords['new'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Customer Number (for LM) */}
            {supplierFields.showCustomerNumber && (
              <div>
                <Label>Kundenummer</Label>
                <Input
                  className="mt-1"
                  placeholder="Dit kundenummer hos leverandøren"
                  value={formData.customer_number}
                  onChange={(e) => setFormData({ ...formData, customer_number: e.target.value })}
                />
              </div>
            )}

            {/* Price List Code */}
            {supplierFields.showPriceListCode && (
              <div>
                <Label>Prisliste kode</Label>
                <Input
                  className="mt-1"
                  placeholder="F.eks. STANDARD eller din aftale-kode"
                  value={formData.price_list_code}
                  onChange={(e) => setFormData({ ...formData, price_list_code: e.target.value })}
                />
              </div>
            )}

            {/* API Key */}
            {supplierFields.showApiKey && (
              <div className="col-span-2">
                <Label>API Nøgle</Label>
                <Input
                  className="mt-1"
                  type="password"
                  placeholder="Indtast API nøgle"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                />
              </div>
            )}

            {/* Notes */}
            <div className="col-span-2">
              <Label>Noter (valgfrit)</Label>
              <Input
                className="mt-1"
                placeholder="F.eks. 'Hovedkonto' eller 'Test-bruger'"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => { setShowAddForm(false); setFormData(EMPTY_FORM) }}>
              Annuller
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
              Gem krypteret
            </Button>
          </div>
        </div>
      )}

      {/* Existing Credentials */}
      {credentials.length === 0 && !showAddForm ? (
        <div className="text-center py-8 border rounded-lg bg-gray-50">
          <Key className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Ingen loginoplysninger tilføjet endnu</p>
          <p className="text-sm text-gray-400 mt-1">
            Tilføj API login for at aktivere automatisk prissynkronisering
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {credentials.map((cred) => (
            <div key={cred.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cred.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Key className={`w-5 h-5 ${cred.is_active ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {cred.credential_type.toUpperCase()} Login
                      </span>
                      <Badge variant={cred.is_active ? 'default' : 'secondary'}>
                        {cred.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                      <Badge variant="outline">
                        {cred.environment === 'production' ? 'Produktion' : cred.environment === 'sandbox' ? 'Sandbox' : 'Test'}
                      </Badge>
                    </div>

                    {cred.api_endpoint && (
                      <p className="text-sm text-gray-500 mt-1">
                        Endpoint: {cred.api_endpoint}
                      </p>
                    )}

                    {cred.notes && (
                      <p className="text-sm text-gray-400 mt-1">
                        {cred.notes}
                      </p>
                    )}

                    {/* Test Status */}
                    {cred.last_test_at && (
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        {cred.last_test_status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : cred.last_test_status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className={cred.last_test_status === 'success' ? 'text-green-600' : cred.last_test_status === 'failed' ? 'text-red-600' : 'text-yellow-600'}>
                          {cred.last_test_status === 'success' ? 'Forbindelse OK' :
                           cred.last_test_status === 'failed' ? 'Forbindelse fejlet' :
                           cred.last_test_status === 'invalid_credentials' ? 'Ugyldige loginoplysninger' :
                           'Timeout'}
                        </span>
                        <span className="text-gray-400">
                          · Testet {new Date(cred.last_test_at).toLocaleDateString('da-DK')}
                        </span>
                      </div>
                    )}

                    {cred.last_test_error && (
                      <p className="text-xs text-red-500 mt-1">{cred.last_test_error}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(cred.id)}
                    disabled={testing === cred.id}
                  >
                    {testing === cred.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span className="ml-2">Test</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(cred)}
                  >
                    {cred.is_active ? 'Deaktiver' : 'Aktiver'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    onClick={() => handleDelete(cred.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security Notice */}
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border">
        <Shield className="w-5 h-5 text-gray-400 mt-0.5" />
        <div className="text-sm text-gray-600">
          <p className="font-medium">Sikker opbevaring</p>
          <p className="mt-1">
            Alle loginoplysninger krypteres med AES-256-GCM før de gemmes.
            Krypteringsnøglen opbevares separat fra databasen.
          </p>
        </div>
      </div>
    </div>
  )
}

// Helper function to determine which fields to show based on supplier
function getSupplierFields(supplierCode: string | null) {
  const code = supplierCode?.toUpperCase()

  if (code === 'AO') {
    return {
      showEndpoint: true,
      endpointPlaceholder: 'https://api.ao.dk/v1',
      showUsername: true,
      showPassword: true,
      showCustomerNumber: false,
      showPriceListCode: true,
      showApiKey: false,
      showClientId: false,
      showClientSecret: false,
      isCSVOnly: false,
    }
  }

  if (code === 'LM') {
    return {
      showEndpoint: false,
      endpointPlaceholder: '',
      showUsername: false,
      showPassword: false,
      showCustomerNumber: false,
      showPriceListCode: false,
      showApiKey: false,
      showClientId: false,
      showClientSecret: false,
      isCSVOnly: true,
    }
  }

  // Default: show all
  return {
    showEndpoint: true,
    endpointPlaceholder: 'https://api.example.com',
    showUsername: true,
    showPassword: true,
    showCustomerNumber: true,
    showPriceListCode: true,
    showApiKey: true,
    showClientId: true,
    showClientSecret: true,
    isCSVOnly: false,
  }
}
