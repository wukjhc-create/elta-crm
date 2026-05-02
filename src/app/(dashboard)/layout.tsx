/**
 * MINIMAL DEBUG LAYOUT — temporary while diagnosing the
 * /dashboard/* 404 issue in production.
 *
 * The original layout (auth gate + sidebar + header + bottom nav +
 * task overlay) is preserved in git history at commit d69a106
 * (file: src/app/(dashboard)/layout.tsx). Restore with:
 *   git checkout d69a106 -- src/app/(dashboard)/layout.tsx
 *
 * If /dashboard/test123 now renders "TEST OK" with this minimal
 * layout, the original layout was crashing at request time. Then
 * re-introduce pieces incrementally:
 *   1. add `getUser()` + redirect on no-user
 *   2. add Sidebar
 *   3. add Header / BottomNav / TaskReminderOverlay / CommandPalette
 *   4. find the one that breaks
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    return <div data-debug="minimal-dashboard-layout">{children}</div>
  } catch (err) {
    console.error('DASHBOARD LAYOUT FAIL:', err)
    return <div>LAYOUT FAIL SAFE</div>
  }
}
