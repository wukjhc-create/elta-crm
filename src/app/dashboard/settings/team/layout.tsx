import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

// P1 #8: direkte URL-adgang uden rettighed -> "Du har ikke adgang" (samme gate som menupunktet).
export default function Layout({ children }: { children: ReactNode }) {
  // PM2-13: Team kræver users.view (admin) — serviceleder fik før en rød fejl i stedet for "ingen adgang"
  return <ModuleGuard permission="users.view">{children}</ModuleGuard>
}
