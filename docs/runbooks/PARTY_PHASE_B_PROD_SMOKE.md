# Parter fase B — kontrolleret production-smoke (runbook)

Formål: gentagelig, kontrolleret prøve af partsfunktionerne i PRODUCTION på interne testdata, uden at røre rigtige kunder.
Første gennemførelse: 2026-11-26 (flag-aktivering, se `PARTY_AUDIENCE_PHASE_B_PREFLIGHT.md` §13).

## Forudsætninger og regler
- Kræver Henriks godkendelse af netop denne prod-smoke (skrivning i prod). Ingen sletning/oprydning uden særskilt godkendelse.
- Kun interne testdata: **kunde C000008 / sag SVC-01006** (Henrik bekræftede 2026-11-26 at det er intern test/demo) og de
  partsdata der blev oprettet på dem. De beholdes som faste smoke-testdata.
- Rolle-tests: rolle på en rigtig prod-profil må ALDRIG ændres midlertidigt. Montør prøves rollback-only med den eksisterende
  montørprofil; salg har ingen prod-testprofil (TECH-TEST-SALES-1) → staging-beviserne gælder.
- Login/adgangskoder indtastes af Henrik. Scriptene printer aldrig navne, e-mails, CVR eller indhold — kun id'er, roller,
  handlingstyper, antal og hashes.

## Fremgangsmåde
1. Read-only før:
   - `npx tsx scripts/prod-stage-a-ops.ts` → 0 kritiske · 0 advarsler
   - `npx tsx scripts/prod-db-audit.ts` → HOEJ=0 · MIDDEL=0 · LAV=0
   - `npx tsx scripts/prod-verify-00255.ts post --expect active` → alle PASS (inkl. portaleksponering + 0 offentliggørelser)
   - portal-tal: `npx tsx scripts/prod-party-00254-baseline.ts` (`portal_exposure`; FAIL-linjerne "00254-objekt fraværende"
     er forventede efter 00254 — scriptet er en før-baseline)
2. Snapshot lige før UI-testen: `npx tsx scripts/prod-party-activation-check.ts snapshot C000008 SVC-01006`
   (read-only; md5 pr. række i 13 tabeller gemmes i `%TEMP%/elta-party-activation/`).
3. UI-test (admin) på C000008 / SVC-01006 — kun de godkendte handlinger, fx: tilføj/afslut deltagerrolle, sæt relation,
   "Ny part" med navnevariant → dublet-dialog → annullér. Kontrollér rollen før "Tilføj" (TECH-PARTY-ROLE-1).
4. Verifikation (read-only): `npx tsx scripts/prod-party-activation-check.ts verify C000008 SVC-01006 [--expect P,R,C,A]`
   - altid: alle nye parter/relationer/deltagere/audit ligger på testkunden/-sagen, kendt aktør, kun kendte audit-handlinger,
     ingen ny udokumenteret navne-dublet, 0 offentliggørelser, ingen eksisterende rækker ændret/slettet
   - `--expect` låser antal nye rækker (parter, relationer, deltagere, audit). 2026-11-26: `1,1,1,2`. Allerede registreret
     part/deltager giver 0 nye rækker (idempotent).
5. Montør (ROLLBACK-ONLY): `npx tsx scripts/prod-party-activation-check.ts montor C000008 SVC-01006` → ser kun det, der er
   i hans sags-/kundescope; alle 8 skrive-RPC'er 42501; direkte INSERT afvist; transaktionen rulles tilbage.
6. Read-only efter: gentag punkt 1 + 0 fejl/advarsler i `system_health_log` siden testen.
7. STOP ved enhver afvigelse og anbefal `PARTIES_UI_ENABLED` FRA (Vercel → Production → redeploy). 00255 røres aldrig.

## Driftstilstande i prod-verify-00255
- `post --expect active` (normal drift fra 2026-11-26): struktur/RLS/RPC-ACL + fuld integritet — manglende referencer,
  register-konsistens, gyldige relationer/deltagere, CVR-/navne-dubletter (kun med dokumenteret "Opret alligevel"), audit-spor
  for hver række, kendt aktør, kun kendte audit-handlinger, 0 offentliggørelser, portaleksponering (F-1 = 0).
- `post --expect inert`: flag FRA og ingen brug → 0 partsdata. Staging står p.t. inert: `npx tsx scripts/test-harness/cli.ts
  verify-00255 --expect inert`.
- `post` KRÆVER `--expect` (fra 2026-11-26; Production-monitorering bruger altid `--expect active` — tilstanden gættes aldrig). `post --detect`
  er kun til diagnose. Fixture-test af evalueringen: `npx tsx scripts/verify-00255-core-test.ts`.
