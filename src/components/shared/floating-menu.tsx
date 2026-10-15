'use client'

/**
 * M-8 (mobil-review 2026-10-14): menuer/dropdowns i tabelrækker blev klippet af tabellens overflow-container og af
 * skærmkanten (særligt på mobil og i lister med få rækker). FloatingMenu renderes via portal i <body> med fixed
 * position ud fra knappens placering: under knappen, eller over den hvis der ikke er plads nedenfor, altid inden for
 * skærmen (8 px margin) og med egen scroll hvis den er højere end pladsen. Lukker ved tryk udenfor og Esc.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface FloatingMenuProps {
  /** Elementet menuen hører til (typisk knappen der åbnede den) */
  anchor: HTMLElement | null
  onClose: () => void
  /** Højrekant flugter med knappens højrekant (standard) eller venstrekant med venstrekant */
  align?: 'left' | 'right'
  className?: string
  testId?: string
  children: React.ReactNode
}

const GAP = 4
const PAD = 8

export function FloatingMenu({ anchor, onClose, align = 'right', className, testId, children }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const menu = menuRef.current
      if (!anchor || !menu) return
      const r = anchor.getBoundingClientRect()
      const width = menu.offsetWidth
      const naturalHeight = menu.scrollHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      const below = vh - r.bottom - GAP - PAD
      const above = r.top - GAP - PAD
      const openUp = naturalHeight > below && above > below
      const maxHeight = Math.max(120, openUp ? above : below)
      const height = Math.min(naturalHeight, maxHeight)
      const top = openUp ? r.top - GAP - height : r.bottom + GAP
      const preferredLeft = align === 'right' ? r.right - width : r.left
      const left = Math.min(Math.max(PAD, preferredLeft), Math.max(PAD, vw - width - PAD))
      setPos({ top, left, maxHeight })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, align])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      {/* React-events bobler gennem portaler til forældrene (fx en klikbar tabelrække) — stoppes her */}
      <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); onClose() }} aria-hidden="true" />
      <div
        ref={menuRef}
        role="menu"
        data-testid={testId}
        data-floating-menu=""
        onClick={(e) => e.stopPropagation()}
        className={`fixed z-[61] overflow-y-auto bg-white rounded-md shadow-lg border ${className ?? ''}`}
        style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: -9999, left: -9999, visibility: 'hidden' }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
