import { type FieldError } from 'react-hook-form'

interface FormFieldProps {
  label: string
  htmlFor: string
  required?: boolean
  error?: FieldError
  children: React.ReactNode
  className?: string
}

export function FormField({ label, htmlFor, required, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}{required && ' *'}
      </label>
      {children}
      {error && (
        <p className="text-sm text-red-600">{error.message}</p>
      )}
    </div>
  )
}

export function inputClass(hasError?: boolean) {
  return `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
    hasError ? 'border-red-500 focus:ring-red-200' : ''
  }`
}
