/**
 * Avatar-stier er altid `avatars/<profil-id>-<tid>.<ext>` (uploadProfileAvatar). Auth-review 2026-10-05: profilens
 * avatar_storage_path kunne sættes af brugeren selv til en vilkårlig fil i attachments, som derefter blev signeret
 * med admin-klienten. Alt andet end brugerens egen avatar-sti signeres/slettes derfor ikke. Bevidst IKKE 'use server'.
 */
export function isOwnAvatarPath(path: string | null | undefined, profileId: string): boolean {
  const p = String(path ?? '')
  return p.startsWith(`avatars/${profileId}-`) && !p.includes('..') && !p.slice('avatars/'.length).includes('/')
}
