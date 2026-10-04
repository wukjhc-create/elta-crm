'use client'

/**
 * N71: cockpittet henter nye mails, når postkasserne ikke er synket i 10 min (email-sync-cronen kører kun dagligt kl. 05).
 * Usynlig, når intet sker; viser "Henter nye mails…" mens synken kører og opdaterer siden, hvis der kom nye mails.
 * Serveren gater (inbox.view) og throttler — roller uden indbakke får blot intet.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { syncMailIfStaleAction } from '@/lib/actions/incoming-emails'

export function MailFreshnessSync() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done'>('idle')
  const [inserted, setInserted] = useState(0)

  useEffect(() => {
    let alive = true
    let spin: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(() => {
      // spinner kun hvis der faktisk synkes (svar "frisk"/"ingen adgang" kommer på få ms)
      spin = setTimeout(() => { if (alive) setState('syncing') }, 800)
      void syncMailIfStaleAction().then((r) => {
        clearTimeout(spin)
        if (!alive) return
        setState(r.synced ? 'done' : 'idle')
        setInserted(r.inserted)
        if (r.inserted > 0) router.refresh()
      }).catch(() => { clearTimeout(spin); if (alive) setState('idle') })
    }, 1500) // efter første visning — blokerer aldrig cockpittet
    return () => { alive = false; clearTimeout(t); clearTimeout(spin) }
  }, [router])

  if (state === 'syncing') {
    return <span className="text-xs text-gray-500 inline-flex items-center gap-1" data-testid="mail-freshness"><Loader2 className="w-3 h-3 animate-spin" /> Henter nye mails…</span>
  }
  if (state === 'done') {
    return <span className="text-xs text-gray-500" data-testid="mail-freshness">Mail opdateret{inserted > 0 ? ` · ${inserted} nye` : ''}</span>
  }
  return null
}
