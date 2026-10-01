'use client'

/**
 * Hydration-sikker "smart" dato (relativ < 7 dage, ellers absolut). Første render (server OG klientens hydrering)
 * viser altid den absolutte dato — identisk tekst — og skifter til relativ tid efter mount. Før beregnede tabellerne
 * "x minutter siden" både på serveren og i browseren; krydsede et minutskifte imellem, fejlede hydreringen
 * ("mindre end ét minut siden" ≠ "1 minut siden").
 */
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import { formatSmartDate } from '@/lib/utils/format'

export function SmartDate({ date, className }: { date: string | Date | null | undefined; className?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!date) return <span className={className}>-</span>
  const d = typeof date === 'string' ? parseISO(date) : date
  return (
    <time dateTime={d.toISOString()} title={format(d, 'd. MMM yyyy HH:mm', { locale: da })} className={className}>
      {mounted ? formatSmartDate(d) : format(d, 'd. MMM yyyy', { locale: da })}
    </time>
  )
}
