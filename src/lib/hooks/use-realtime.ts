'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Perf-/korrekthedsreview 2026-10-08: (1) en mail-sync giver én hændelse pr. række → én fuld genindlæsning pr. række;
 * nu samles en byge til ét kald (efterløbende debounce). (2) onUpdate var udeladt af afhængighederne uden ref → kaldet
 * brugte FØRSTE renders closure (fx gammelt filter/side i indbakken). Nu kaldes altid den seneste callback.
 */
const REALTIME_DEBOUNCE_MS = 1500

function useLatestDebounced(onUpdate: () => void) {
  const latest = useRef(onUpdate)
  latest.current = onUpdate
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return useRef(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; latest.current() }, REALTIME_DEBOUNCE_MS)
  }).current
}

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
  const fire = useLatestDebounced(onUpdate)

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
        fire()
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
  const fire = useLatestDebounced(onUpdate)

  useEffect(() => {
    const supabase = createClient()
    const channels: RealtimeChannel[] = []

    for (const table of tables) {
      const channel = supabase
        .channel(`realtime-multi-${table}-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table } as any, () => {
          fire()
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
