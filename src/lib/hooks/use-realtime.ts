'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Subscribe to Supabase Realtime changes on a table.
 * Calls `onUpdate` whenever an INSERT, UPDATE, or DELETE occurs.
 * Automatically cleans up subscription on unmount.
 */
export function useRealtimeTable(
  table: string,
  onUpdate: () => void,
  filter?: string
) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const channelName = `realtime-${table}-${filter || 'all'}-${Date.now()}`
    const channelConfig: Record<string, unknown> = {
      event: '*',
      schema: 'public',
      table,
    }
    if (filter) {
      channelConfig.filter = filter
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig as any, () => {
        onUpdate()
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter]) // intentionally exclude onUpdate to avoid re-subscribing

  return channelRef
}

/**
 * Subscribe to multiple tables at once. Calls onUpdate for any change.
 */
export function useRealtimeTables(
  tables: string[],
  onUpdate: () => void
) {
  const channelsRef = useRef<RealtimeChannel[]>([])

  useEffect(() => {
    const supabase = createClient()
    const channels: RealtimeChannel[] = []

    for (const table of tables) {
      const channel = supabase
        .channel(`realtime-multi-${table}-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table } as any, () => {
          onUpdate()
        })
        .subscribe()
      channels.push(channel)
    }

    channelsRef.current = channels

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch)
      }
    }
  }, [tables.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return channelsRef
}
