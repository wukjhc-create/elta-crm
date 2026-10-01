import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

// Direkte URL-adgang uden rettighed -> "Du har ikke adgang" (før: fejlside, fordi actions kaster ved manglende bank.view).
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard permission="bank.view">{children}</ModuleGuard>
}
