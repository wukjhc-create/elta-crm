'use client'

import { useEffect, useRef } from 'react'

/**
 * Visibility-aware polling.
 *
 * Runs `callback` once on mount, then every `intervalMs` — but ONLY while
 * the browser tab is visible. When the tab is hidden the interval is torn
 * down entirely (no timer wake-ups, no network/Vercel invocations); when it
 * becomes visible again the callback fires immediately and polling resumes.
 *
 * This is the core lever for Sprint Performance 1: background tabs left open
 * were the dominant source of Vercel function invocations. Gating every
 * poll loop on document visibility removes that load without changing any
 * user-facing behaviour (data still refreshes on focus).
 *
 * `callback` is held in a ref so a new function identity each render does
 * NOT reset the interval; only `intervalMs` does.
 */
export function useVisiblePolling(callback: () => void, intervalMs: number): void {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const tick = () => cbRef.current()

    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        // Belt-and-suspenders: skip a tick that races a visibility change.
        if (typeof document !== 'undefined' && document.hidden) return
        tick()
      }, intervalMs)
    }

    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    // Initial fetch on mount (regardless of visibility), then start polling.
    tick()
    start()

    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        tick() // immediate refresh when the user returns to the tab
        start()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
}
