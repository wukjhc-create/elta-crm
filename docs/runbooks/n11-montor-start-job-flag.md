# Runbook N11 — aktivering af `MONTOR_START_JOB_ENABLED` (montør starter eget job)

**Status:** KLAR — teknisk verificeret 2026-10-03/04. Flaget sættes af Henrik i Vercel (ingen Vercel-adgang herfra).
Ingen migration, ingen mail/SMS, ingen finance-effekt.

## Hvad flaget gør
`src/lib/actions/work-orders.ts` (`montorStartJobEnabled`):
- **OFF (i dag):** montør kan kun *afslutte* egne job (planlagt → udført). "→ Start" vises ikke for montør.
- **ON:** montør kan også *starte* egne job (planlagt → i gang). Gate: `work_orders.complete` + job tildelt montørens
  egen medarbejder (`userCanViewWorkOrder`). Admin/serviceleder er uændret (`work_orders.edit`).
- DB håndhæver uafhængigt (RLS 00181, kørt i prod 2026-10-03): montør må kun sætte `in_progress`/`done` på arbejdsordrer
  tildelt egen aktive medarbejder.
- Effekt på sag: første start sætter sagen "I gang" (N23-automatik, audit `case_auto_in_progress`).

## Før-tjek (read-only, kan køres når som helst)
```
npx tsx scripts/prod-verify-montor-start-job.ts
```
Forventet ✅ (målt 2026-10-03): work_orders har præcis `work_orders_update_role` som UPDATE-policy; WITH CHECK tillader
montør `in_progress`/`done` kun på egne; 1 aktiv montør med login, 3 planlagte job.

## Aktivering (Henrik)
1. Vercel → Project → Settings → Environment Variables → `MONTOR_START_JOB_ENABLED` = `true` (Production).
2. Redeploy (env læses ved build/boot).

## Post-check
1. Montør logger ind → Mine job → et planlagt job viser **"→ Start"** (før: kun "✓ Afslut").
2. Tryk Start → job "I gang"; sagen skifter til "I gang" (audit `case_auto_in_progress`).
3. Read-only bekræftelse:
   ```
   npx tsx scripts/prod-verify-montor-start-job.ts
   ```
   (RLS uændret) + i appen: Sagens Aktivitet viser starten med montørens navn.
4. Negativ: montør kan IKKE starte et job tildelt en anden (knap vises ikke; DB afviser via RLS 00181).

## Rollback
Sæt `MONTOR_START_JOB_ENABLED` = `false` (eller fjern) + redeploy. Ingen data skal rulles tilbage — job der er startet
forbliver "I gang" og kan afsluttes normalt.

## Staging-bevis
Harness kører med flaget ON mod staging (00181): U11 `startet=ja` (montør starter eget job), U63 sag → "I gang" + audit.
