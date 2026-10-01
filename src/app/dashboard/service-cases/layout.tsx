import type { ReactNode } from 'react'

// N9d: ruterne her viderestiller kun til /dashboard/orders, som selv håndhæver adgang (cases.view.*).
// En ModuleGuard her (service.view) ville afvise roller som salg FØR viderestillingen.
export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
