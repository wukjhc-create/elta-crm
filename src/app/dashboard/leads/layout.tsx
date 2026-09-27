import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

// P1 #8: direkte URL-adgang uden rettighed -> "Du har ikke adgang" (samme gate som menupunktet).
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard permission="leads.view">{children}</ModuleGuard>
}
