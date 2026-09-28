import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

// P3 #15: opkalds-opslag kraever kundeadgang (samme som Kunder-modulet).
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard permission="customers.view">{children}</ModuleGuard>
}
