'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Globe,
  Copy,
  Check,
  Plus,
  Trash2,
  Clock,
  ExternalLink,
} from 'lucide-react'
import {
  createPortalToken,
  deactivatePortalToken,
} from '@/lib/actions/portal'
import type { PortalAccessToken } from '@/types/portal.types'

interface PortalAccessProps {
  customerId: string
  customerEmail: string
  tokens: PortalAccessToken[]
}

export function PortalAccess({
  customerId,
  customerEmail,
  tokens,
}: PortalAccessProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  const handleCreateToken = async () => {
    setIsCreating(true)

    try {
      const result = await createPortalToken({
        customer_id: customerId,
        email: customerEmail,
      })

      if (!result.success) {
        alert(result.error || 'Kunne ikke oprette portal-adgang')
        return
      }

      router.refresh()
    } catch (err) {
      alert('Der opstod en fejl')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeactivate = async (tokenId: string) => {
    if (!confirm('Er du sikker på at du vil deaktivere denne adgang?')) {
      return
    }

    setDeactivatingId(tokenId)

    try {
      const result = await deactivatePortalToken(tokenId)

      if (!result.success) {
        alert(result.error || 'Kunne ikke deaktivere adgang')
        return
      }

      router.refresh()
    } catch (err) {
      alert('Der opstod en fejl')
    } finally {
      setDeactivatingId(null)
    }
  }

  const getPortalUrl = (token: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/portal/${token}`
  }

  const handleCopy = async (token: string) => {
    const url = getPortalUrl(token)
    await navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const activeTokens = tokens.filter((t) => t.is_active)

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Kundeportal</h2>
        </div>
        <button
          onClick={handleCreateToken}
          disabled={isCreating}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {isCreating ? 'Opretter...' : 'Opret adgang'}
        </button>
      </div>

      {activeTokens.length === 0 ? (
        <div className="text-center py-6">
          <Globe className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">
            Ingen aktiv portal-adgang
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Opret en adgang så kunden kan se tilbud og kommunikere med dig
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTokens.map((token) => (
            <div
              key={token.id}
              className="p-3 bg-gray-50 rounded-lg space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {token.email}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(token.token)}
                    className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                    title="Kopier link"
                  >
                    {copiedToken === token.token ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <a
                    href={getPortalUrl(token.token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                    title="Åbn portal"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => handleDeactivate(token.id)}
                    disabled={deactivatingId === token.id}
                    className="p-1.5 hover:bg-red-100 rounded text-red-500 disabled:opacity-50"
                    title="Deaktiver"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Oprettet: {formatDate(token.created_at)}
                </span>
                {token.last_accessed_at && (
                  <span>
                    Sidst brugt: {formatDate(token.last_accessed_at)}
                  </span>
                )}
              </div>

              {token.expires_at && (
                <div className="text-xs">
                  {new Date(token.expires_at) < new Date() ? (
                    <span className="text-red-500">Udløbet</span>
                  ) : (
                    <span className="text-gray-500">
                      Udløber: {formatDate(token.expires_at)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
