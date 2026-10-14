/**
 * Chat-vedhæftninger (portal_messages.attachments): det gemte `url` er et 1-times signeret link fra uploadtidspunktet →
 * alle historiske vedhæftninger var døde links dagen efter (kommunikations-review 2026-10-09 #1). Ved læsning signeres
 * friskt fra `path` — kun stier i kundens egen mappe (`<customerId>/`). Server-only (service-klienten bag kalderens
 * token-/permission-tjek). Bevidst IKKE 'use server'.
 */
import { createAdminClient } from '@/lib/supabase/admin'

type Attachment = { path?: string; url?: string; name?: string; size?: number; type?: string }
type WithAttachments = { attachments?: unknown }

export async function withFreshChatAttachmentUrls<T extends WithAttachments>(messages: T[], customerId: string): Promise<T[]> {
  const paths = new Set<string>()
  for (const m of messages) {
    for (const a of (Array.isArray(m.attachments) ? m.attachments : []) as Attachment[]) {
      if (a?.path && a.path.startsWith(`${customerId}/`) && !a.path.includes('..')) paths.add(a.path)
    }
  }
  if (paths.size === 0) return messages
  const list = Array.from(paths)
  const { data } = await createAdminClient().storage.from('portal-attachments').createSignedUrls(list, 3600)
  const fresh = new Map<string, string>()
  for (const [i, row] of (data ?? []).entries()) if (row?.signedUrl) fresh.set(list[i], row.signedUrl)
  return messages.map((m) => {
    if (!Array.isArray(m.attachments)) return m
    return {
      ...m,
      attachments: (m.attachments as Attachment[]).map((a) =>
        a?.path && a.path.startsWith(`${customerId}/`) ? { ...a, url: fresh.get(a.path) ?? '' } : a
      ),
    }
  })
}
