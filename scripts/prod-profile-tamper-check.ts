/** PRODUCTION read-only (auth-review Q20): tegn på misbrug af profil-felter. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-profile-tamper-check', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'profiler', (SELECT count(*)::int FROM profiles),
    'avatar_sti_uden_for_egen_mappe', (SELECT count(*)::int FROM profiles WHERE avatar_storage_path IS NOT NULL AND avatar_storage_path NOT LIKE 'avatars/' || id::text || '-%'),
    'profil_email_forskellig_fra_login', (SELECT count(*)::int FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.email IS NOT NULL AND lower(p.email) <> lower(u.email)),
    'profil_email_lig_anden_brugers_login', (SELECT count(*)::int FROM profiles p JOIN auth.users u ON lower(u.email) = lower(p.email) AND u.id <> p.id)
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
