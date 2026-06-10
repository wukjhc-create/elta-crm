/**
 * Central helper til at generere signed URLs til Supabase Storage.
 *
 * Bruger admin-client (service-role), saa kald lykkes uanset bucket-
 * policies og RLS. Helper er forberedelse til Phase β.2.5, hvor
 * `attachments` + `service-case-files` buckets gaar fra PUBLIC=true
 * til PUBLIC=false.
 *
 * Strategi (Variant B):
 *   - DB-rows beholder storage_path-felt (ikke URL)
 *   - file_url eller pdf_public_url genereres lazy ved fetch via denne helper
 *   - Signed-URL har konfigurerbar TTL via SIGNED_URL_TTL-konstanter
 *
 * Brug konstanter (SIGNED_URL_TTL.SHORT/DAY/MAIL/YEAR) i stedet for raw
 * numbers, saa valg af lifetime er ekspliciteret per use case.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

/**
 * Konventionelle TTL-værdier i sekunder.
 * Vælg den der bedst beskriver levetid for use case.
 */
export const SIGNED_URL_TTL = {
  /** 1 time — kort visning i portal/dashboard, refresh ved næste page-load */
  SHORT: 3600,
  /** 24 timer — PDF-generering, besigtigelses-rapport */
  DAY: 86400,
  /** 30 dage — mail-templates med fil-links der skal kunne åbnes længere tid */
  MAIL: 86400 * 30,
  /** 1 år — long-lived dokumenter (fuldmagt-PDFs, gemte tilbud) */
  YEAR: 86400 * 365,
} as const

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Generér en signed URL til et storage-objekt.
 *
 * @param bucket  Storage bucket-navn ('attachments' | 'service-case-files' | 'portal-attachments')
 * @param path    Sti i bucket'en (uden bucket-prefix)
 * @param ttl     Levetid i sekunder. Default = SIGNED_URL_TTL.SHORT (1 time).
 */
export async function getStorageSignedUrl(
  bucket: string,
  path: string,
  ttl: number = SIGNED_URL_TTL.SHORT,
): Promise<SignedUrlResult> {
  if (!path || typeof path !== 'string') {
    return { ok: false, error: 'Ugyldig sti' }
  }
  if (!bucket || typeof bucket !== 'string') {
    return { ok: false, error: 'Ugyldig bucket' }
  }
  if (ttl <= 0) {
    return { ok: false, error: 'TTL skal være positiv' }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, ttl)

    if (error || !data?.signedUrl) {
      logger.error('getStorageSignedUrl failed', {
        error,
        metadata: { bucket, path, ttl },
      })
      return { ok: false, error: error?.message ?? 'Kunne ikke generere signed URL' }
    }

    return { ok: true, url: data.signedUrl }
  } catch (err) {
    logger.error('getStorageSignedUrl exception', { error: err })
    return { ok: false, error: err instanceof Error ? err.message : 'Uventet fejl' }
  }
}

/**
 * Convenience: generér signed URL eller returnér null ved fejl.
 * Brug naar caller ikke vil/kan haandtere fejl-resultatet eksplicit
 * (typisk UI-fetch hvor null skjuler download-knappen).
 */
export async function getStorageSignedUrlOrNull(
  bucket: string,
  path: string,
  ttl: number = SIGNED_URL_TTL.SHORT,
): Promise<string | null> {
  const r = await getStorageSignedUrl(bucket, path, ttl)
  return r.ok ? r.url : null
}

/**
 * Batch-version: generér signed URLs for flere paths i samme bucket.
 * Bruger Promise.all internt; failures bliver til null-værdier i
 * resultatet (samme indeks som input). Brug naar man skal hente N
 * URLs paa én gang (fx liste-render).
 */
export async function getStorageSignedUrls(
  bucket: string,
  paths: string[],
  ttl: number = SIGNED_URL_TTL.SHORT,
): Promise<Array<string | null>> {
  if (paths.length === 0) return []
  return Promise.all(paths.map((p) => getStorageSignedUrlOrNull(bucket, p, ttl)))
}
