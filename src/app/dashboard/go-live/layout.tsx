import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

// Pilot-review 2026-10-14 (P-4): kun admin (før ingen layout-guard — getGoLiveStatus kunne læses af alle indloggede).
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard adminOnly>{children}</ModuleGuard>
}
