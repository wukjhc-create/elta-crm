import type { ReactNode } from 'react'
import { ModuleGuard } from '@/components/auth/module-guard'

// P1 #8/#10: kun admin. Siden tjekker ogsaa selv (layout og side renderes parallelt).
export default function Layout({ children }: { children: ReactNode }) {
  return <ModuleGuard adminOnly>{children}</ModuleGuard>
}
