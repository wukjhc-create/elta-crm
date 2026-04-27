'use client'

import { User, Clock, Shield, ShieldCheck, Phone, Mail } from 'lucide-react'
import type { UserActivityEntry } from '@/lib/actions/user-activity'

function formatLastActive(iso: string | null): { text: string; color: string } {
  if (!iso) return { text: 'Aldrig logget ind', color: 'text-gray-400' }

  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 5) return { text: 'Online nu', color: 'text-green-600' }
  if (diffMin < 60) return { text: `${diffMin} min siden`, color: 'text-green-600' }
  if (diffHours < 24) return { text: `${diffHours} timer siden`, color: 'text-blue-600' }
  if (diffDays < 7) return { text: `${diffDays} dage siden`, color: 'text-amber-600' }
  if (diffDays < 30) return { text: `${diffDays} dage siden`, color: 'text-orange-600' }

  return {
    text: new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }),
    color: 'text-red-500',
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'admin':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
          <ShieldCheck className="w-3 h-3" /> Admin
        </span>
      )
    case 'serviceleder':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
          <Shield className="w-3 h-3" /> Serviceleder
        </span>
      )
    case 'montør':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
          <User className="w-3 h-3" /> Montør
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
          {role}
        </span>
      )
  }
}

function getOnlineIndicator(iso: string | null): string {
  if (!iso) return 'bg-gray-300'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 5 * 60000) return 'bg-green-500 animate-pulse' // Online
  if (diffMs < 3600000) return 'bg-green-400' // Active last hour
  if (diffMs < 86400000) return 'bg-amber-400' // Active today
  return 'bg-gray-300' // Inactive
}

interface UserActivityPanelProps {
  users: UserActivityEntry[]
}

export function UserActivityPanel({ users }: UserActivityPanelProps) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          Sidst aktiv
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Oversigt over hvornår brugere sidst var logget ind
        </p>
      </div>

      <div className="divide-y">
        {users.map((user) => {
          const lastActive = formatLastActive(user.last_sign_in_at)

          return (
            <div
              key={user.id}
              className={`p-4 flex items-center gap-4 ${!user.is_active ? 'opacity-50' : ''}`}
            >
              {/* Avatar with online indicator */}
              <div className="relative">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.full_name || ''}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${getOnlineIndicator(user.last_sign_in_at)}`}
                />
              </div>

              {/* Name and role */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">
                    {user.full_name || 'Ikke angivet'}
                  </span>
                  {getRoleBadge(user.role)}
                  {!user.is_active && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                      Deaktiveret
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  {user.email && (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </span>
                  )}
                  {user.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {user.phone}
                    </span>
                  )}
                </div>
              </div>

              {/* Last active */}
              <div className="text-right shrink-0">
                <span className={`text-sm font-medium ${lastActive.color}`}>
                  {lastActive.text}
                </span>
                {user.last_sign_in_at && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(user.last_sign_in_at).toLocaleDateString('da-DK', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {users.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-500">
          Ingen brugere fundet
        </div>
      )}
    </div>
  )
}
