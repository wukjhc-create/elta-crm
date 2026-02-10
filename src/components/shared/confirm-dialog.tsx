'use client'

import { useEffect, useRef, useCallback } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Bekræft',
  cancelLabel = 'Annuller',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) onCancel()
  }, [onCancel, loading])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    // Focus confirm button on open
    setTimeout(() => confirmRef.current?.focus(), 50)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const confirmColors = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    default: 'bg-primary hover:bg-primary/90 text-primary-foreground',
  }

  const iconColors = {
    danger: 'text-red-600 bg-red-100',
    warning: 'text-yellow-600 bg-yellow-100',
    default: 'text-blue-600 bg-blue-100',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconColors[variant]}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
                {title}
              </h3>
              <p id="confirm-dialog-description" className="mt-2 text-sm text-gray-600">
                {description}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 inline-flex items-center ${confirmColors[variant]}`}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook for easier usage
import { useState } from 'react'

interface UseConfirmOptions {
  title: string
  description: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'default'
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    options: UseConfirmOptions
    resolve: ((value: boolean) => void) | null
  }>({
    open: false,
    options: { title: '', description: '' },
    resolve: null,
  })

  const confirm = (options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve })
    })
  }

  const handleConfirm = () => {
    state.resolve?.(true)
    setState(prev => ({ ...prev, open: false, resolve: null }))
  }

  const handleCancel = () => {
    state.resolve?.(false)
    setState(prev => ({ ...prev, open: false, resolve: null }))
  }

  const ConfirmDialogElement = (
    <ConfirmDialog
      open={state.open}
      title={state.options.title}
      description={state.options.description}
      confirmLabel={state.options.confirmLabel || 'Slet'}
      variant={state.options.variant || 'danger'}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, ConfirmDialog: ConfirmDialogElement }
}
