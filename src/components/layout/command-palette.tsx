'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  LayoutDashboard,
  Users,
  FileText,
  FolderKanban,
  Mail,
  Calculator,
  Package,
  Settings,
  BarChart3,
  Zap,
  TrendingUp,
  Plus,
  Brain,
} from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  section: string
  icon: React.ReactNode
  action: () => void
  keywords?: string[]
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const navigate = useCallback(
    (path: string) => {
      setOpen(false)
      setQuery('')
      router.push(path)
    },
    [router],
  )

  const commands: CommandItem[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Dashboard', section: 'Navigation', icon: <LayoutDashboard className="w-4 h-4" />, action: () => navigate('/dashboard'), keywords: ['oversigt', 'hjem'] },
    { id: 'nav-leads', label: 'Leads', section: 'Navigation', icon: <BarChart3 className="w-4 h-4" />, action: () => navigate('/dashboard/leads'), keywords: ['emner', 'pipeline'] },
    { id: 'nav-customers', label: 'Kunder', section: 'Navigation', icon: <Users className="w-4 h-4" />, action: () => navigate('/dashboard/customers'), keywords: ['kontakter', 'firmaer'] },
    { id: 'nav-offers', label: 'Tilbud', section: 'Navigation', icon: <FileText className="w-4 h-4" />, action: () => navigate('/dashboard/offers'), keywords: ['quotes', 'salg'] },
    { id: 'nav-projects', label: 'Projekter', section: 'Navigation', icon: <FolderKanban className="w-4 h-4" />, action: () => navigate('/dashboard/projects'), keywords: ['opgaver', 'tasks'] },
    { id: 'nav-inbox', label: 'Indbakke', section: 'Navigation', icon: <Mail className="w-4 h-4" />, action: () => navigate('/dashboard/inbox'), keywords: ['beskeder', 'messages'] },
    { id: 'nav-calculations', label: 'Kalkulationer', section: 'Navigation', icon: <Calculator className="w-4 h-4" />, action: () => navigate('/dashboard/calculations'), keywords: ['beregninger'] },
    { id: 'nav-products', label: 'Produkter', section: 'Navigation', icon: <Package className="w-4 h-4" />, action: () => navigate('/dashboard/products'), keywords: ['varer', 'katalog'] },
    { id: 'nav-packages', label: 'Pakker', section: 'Navigation', icon: <Package className="w-4 h-4" />, action: () => navigate('/dashboard/packages'), keywords: ['bundter'] },
    { id: 'nav-pricing', label: 'Prisovervågning', section: 'Navigation', icon: <TrendingUp className="w-4 h-4" />, action: () => navigate('/dashboard/pricing'), keywords: ['priser', 'alerts'] },
    { id: 'nav-reports', label: 'Rapporter', section: 'Navigation', icon: <BarChart3 className="w-4 h-4" />, action: () => navigate('/dashboard/reports'), keywords: ['statistik', 'omsætning'] },
    { id: 'nav-ai', label: 'AI Projekt', section: 'Navigation', icon: <Brain className="w-4 h-4" />, action: () => navigate('/dashboard/ai-project'), keywords: ['intelligence', 'automatisk'] },
    { id: 'nav-settings', label: 'Indstillinger', section: 'Navigation', icon: <Settings className="w-4 h-4" />, action: () => navigate('/dashboard/settings'), keywords: ['konfiguration'] },
    { id: 'nav-components', label: 'Komponenter', section: 'Navigation', icon: <Zap className="w-4 h-4" />, action: () => navigate('/dashboard/settings/components'), keywords: ['el-dele'] },

    // Quick create
    { id: 'create-customer', label: 'Ny kunde', section: 'Opret ny', icon: <Plus className="w-4 h-4" />, action: () => navigate('/dashboard/customers?create=true'), keywords: ['opret', 'ny'] },
    { id: 'create-lead', label: 'Ny lead', section: 'Opret ny', icon: <Plus className="w-4 h-4" />, action: () => navigate('/dashboard/leads?create=true'), keywords: ['opret', 'ny'] },
    { id: 'create-offer', label: 'Nyt tilbud', section: 'Opret ny', icon: <Plus className="w-4 h-4" />, action: () => navigate('/dashboard/offers?create=true'), keywords: ['opret', 'ny'] },
    { id: 'create-project', label: 'Nyt projekt', section: 'Opret ny', icon: <Plus className="w-4 h-4" />, action: () => navigate('/dashboard/projects?create=true'), keywords: ['opret', 'ny'] },

    // Settings shortcuts
    { id: 'settings-company', label: 'Firmaindstillinger', section: 'Indstillinger', icon: <Settings className="w-4 h-4" />, action: () => navigate('/dashboard/settings/company'), keywords: ['firma', 'logo'] },
    { id: 'settings-team', label: 'Teammedlemmer', section: 'Indstillinger', icon: <Users className="w-4 h-4" />, action: () => navigate('/dashboard/settings/team'), keywords: ['brugere', 'inviter'] },
    { id: 'settings-suppliers', label: 'Leverandører', section: 'Indstillinger', icon: <Package className="w-4 h-4" />, action: () => navigate('/dashboard/settings/suppliers'), keywords: ['grossist', 'ao', 'lemvigh'] },
  ]

  const filtered = query.trim()
    ? commands.filter((cmd) => {
        const q = query.toLowerCase()
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.section.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q))
        )
      })
    : commands

  // Group by section
  const sections = new Map<string, CommandItem[]>()
  for (const cmd of filtered) {
    const group = sections.get(cmd.section) || []
    group.push(cmd)
    sections.set(cmd.section, group)
  }

  const flatFiltered = filtered

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll active item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const activeEl = container.querySelector(`[data-index="${activeIndex}"]`)
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && flatFiltered[activeIndex]) {
      e.preventDefault()
      flatFiltered[activeIndex].action()
    }
  }

  if (!open) return null

  let itemIndex = -1

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Søg eller hop til..."
            className="flex-1 text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 bg-gray-100 rounded border">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {flatFiltered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Ingen resultater for &quot;{query}&quot;
            </div>
          ) : (
            Array.from(sections.entries()).map(([sectionName, items]) => (
              <div key={sectionName}>
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {sectionName}
                </div>
                {items.map((cmd) => {
                  itemIndex++
                  const idx = itemIndex
                  return (
                    <button
                      key={cmd.id}
                      data-index={idx}
                      onClick={() => cmd.action()}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        activeIndex === idx
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex-shrink-0 text-gray-400">{cmd.icon}</span>
                      <span>{cmd.label}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t bg-gray-50 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">↑↓</kbd>
            Naviger
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">Enter</kbd>
            Vælg
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">Esc</kbd>
            Luk
          </span>
        </div>
      </div>
    </div>
  )
}
