# P1 — Slå selvregistrering fra i prod-Supabase (Henrik, ~2 min)

## Verificeret status (2026-10-05, read-only — ikke gæt)

`npx tsx scripts/prod-auth-signup-status.ts` (læser Auths offentlige `GET /auth/v1/settings` med appens offentlige
anon-nøgle; opretter intet) gav for prod-projektet:

| Felt | Værdi | Betydning |
|---|---|---|
| er_prod_projekt | true | appen på elta-crm.vercel.app bruger prod-projektet |
| disable_signup | **false** | **selvregistrering er SLÅET TIL** |
| email_autobekraeftelse | **true** | en ny konto er aktiv med det samme (ingen e-mail-bekræftelse) |
| login-udbydere | email | kun e-mail/adgangskode |

Konsekvens: enhver på internettet kan oprette en konto (via `/register` eller direkte mod Supabase Auth API'et med den
offentlige nøgle) og får straks en aktiv **montør**-session (`handle_new_user` tvinger rollen til montør). Det giver
montør-adgang til CRM'et (sager/kunder i montør-scope, og — indtil RLS-planen i `rls-cost-columns.md` er gennemført —
direkte API-læsning af bl.a. tilbudslinjer med kostpriser).

Tegn på misbrug (read-only, kun antal): 5 auth-brugere i alt; nyeste oprettet 2026-05-09; de 3 ikke-inviterede uden
medarbejderkobling er 2 admins + 1 montør oprettet 25/1–1/2 2026 (sandsynligvis jeres egne). Ingen ukendte nye konti.

## Sådan slås det fra

1. Log ind på https://supabase.com/dashboard og vælg **prod**-projektet (ref starter med `guhsjw…` — IKKE staging).
2. Venstre menu: **Authentication** → under *Configuration* vælg **Sign In / Providers**
   (i ældre udgaver af dashboardet: **Authentication → Providers / Settings**).
3. I afsnittet **User Signups**: slå **"Allow new users to sign up"** FRA.
4. Klik **Save changes**.

Det påvirker IKKE eksisterende brugere eller invitationer: medarbejdere oprettes fortsat via "Inviter" i CRM'et
(`inviteUserByEmail`, admin-API — virker uafhængigt af denne indstilling), og "Glemt adgangskode" virker fortsat.

## Verifikation bagefter

```
npx tsx scripts/prod-auth-signup-status.ts
```
Forventet: `"disable_signup":true` og `"selvregistrering_slaaet_til":false`.

## Verifikationslog

| Tidspunkt | disable_signup | autobekræftelse | Status |
|---|---|---|---|
| 2026-10-05 ~10:00 | false | true | SLÅET TIL (første måling) |
| 2026-10-06 09:30 | false | true | stadig SLÅET TIL — afventer Henriks ændring |
| 2026-10-06 09:52 | false | true | stadig SLÅET TIL — afventer Henriks ændring |

Forventet efter ændringen: `"er_prod_projekt":true, "disable_signup":true, "selvregistrering_slaaet_til":false`.
Status regnes først som lukket, når målingen viser det (ingen antagelse).

## Opfølgning (kode, efter slå-fra)

- `/register`-siden (src/app/(auth)/register) bør fjernes, så den ikke vises — den virker ikke længere, når signup er fra.
- Valgfri ekstra sikring (migration, kræver godkendelse): `handle_new_user` opretter nye profiler med
  `is_active = false`, indtil en admin aktiverer dem.
