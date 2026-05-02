'use client'

import { useState, useRef, useEffect } from 'react'
import { FileText, ChevronDown, Sun, Wrench } from 'lucide-react'
import type { QuoteTemplateType } from '@/types/quote-templates.types'
import type { IncomingEmailWithCustomer } from '@/types/mail-bridge.types'
import { QuoteFormDialog } from './quote-form-dialog'

interface GoldenButtonProps {
  selectedEmail: IncomingEmailWithCustomer | null
}

export function GoldenButton({ selectedEmail }: GoldenButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dialogType, setDialogType] = useState<QuoteTemplateType | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (type: QuoteTemplateType) => {
    setIsOpen(false)
    setDialogType(type)
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md
            bg-gradient-to-r from-amber-400 to-amber-500 text-white
            hover:from-amber-500 hover:to-amber-600
            shadow-sm hover:shadow transition-all"
        >
          <FileText className="w-4 h-4" />
          Nyt Tilbud (PDF)
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute right-0 mt-1 w-72 bg-white rounded-lg shadow-lg border z-50 py-1">
            <button
              onClick={() => handleSelect('sales')}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-3"
            >
              <Sun className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">Nyt Salgstilbud</div>
                <div className="text-xs text-gray-500">Solcelleanlæg med energidata</div>
              </div>
            </button>
            <button
              onClick={() => handleSelect('installation')}
              className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors flex items-start gap-3"
            >
              <Wrench className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">Nyt Monteringstilbud</div>
                <div className="text-xs text-gray-500">Service og montagearbejde</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Quote Form Dialog */}
      {dialogType && (
        <QuoteFormDialog
          templateType={dialogType}
          selectedEmail={selectedEmail}
          onClose={() => setDialogType(null)}
        />
      )}
    </>
  )
}
