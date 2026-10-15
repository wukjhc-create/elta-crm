/**
 * Pilot-review 2026-10-15 (#5): telefonbilleder (4–12 MB) ramte serverens body-grænse (server actions 10 MB, Vercel
 * ~4,5 MB) → upload fejlede. Billeder skaleres ned i browseren før upload; andre filer (PDF o.l.) sendes uændret.
 * Kun klient (bruger canvas). Fejler skaleringen, sendes originalen (serveren afviser så med en tydelig fejl).
 */

export const UPLOAD_MAX_DIMENSION = 2000
export const UPLOAD_JPEG_QUALITY = 0.82
/** under denne størrelse sendes billedet uændret */
export const UPLOAD_DOWNSCALE_FROM_BYTES = 1.5 * 1024 * 1024

export function shouldDownscale(file: { type: string; size: number }): boolean {
  return /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && file.size > UPLOAD_DOWNSCALE_FROM_BYTES
}

export function scaledSize(w: number, h: number, max = UPLOAD_MAX_DIMENSION): { width: number; height: number } {
  const f = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)) }
}

export async function downscaleImageForUpload(file: File): Promise<File> {
  if (!shouldDownscale(file) || typeof document === 'undefined') return file
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', UPLOAD_JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
