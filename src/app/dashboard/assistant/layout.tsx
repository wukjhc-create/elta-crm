import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard permission="customers.view">{children}</ModuleGuard>
}
