# 00250 — produktions-preflight (kommunikations-hub fase 3A)

Status: FORBEREDT. Den permanente migration er IKKE kørt. Kræver Henriks særskilte godkendelse (nr/formål/risiko/pre-post).
Samme mønster som 00249 (`ELTA_00249_PROD_PREFLIGHT.md`): read-only før/efter, rollback-only dry-run i prod, kode-smoke,
dormancy. Alle scripts udskriver kun PASS/FAIL, antal og md5 — ingen personværdier.

## 1. Hvad 00250 gør (kort)
Tråde (mail/portal-tilbud/web-chat), status "venter på ELTA", vedhæftnings-referencer, web-chat-tabeller + misbrugsværn,
retention (dry-run standard, kun service_role), kilde→henvendelse-afstemning (trigger på `incoming_emails`, no-op uden
henvendelser). Ingen nye rettighedsnøgler. Ingen ændring af eksisterende rækker. Se
`ELTA_COMMUNICATION_HUB_PHASE_3A_FINAL_REVIEW.md` §12.

**Risiko:** lav-moderat. Eneste berøring af en kanonisk tabel er en AFTER UPDATE-trigger på `incoming_emails` (kun ved
ændring af customer_id/service_case_id/linked_by; afbrydes aldrig af fejl — subtransaktion). `ALTER TABLE` på
`conversations`/`conversation_items` (nye nullable kolonner / konstant-standard ⇒ ingen omskrivning) og genvalidering af
to CHECK-constraints over 32 rækker. Kort lås på `incoming_emails` mens triggeren oprettes (sekunder).

## 2. Flag der SKAL være FRA (eller fraværende) i Vercel Production efter dormant deploy
`RECEPTION_EMAIL_INGEST_ENABLED` · `RECEPTION_EMAIL_INGEST_SINCE` (ikke sat) · `RECEPTION_PORTAL_INGEST_ENABLED` ·
`RECEPTION_BACKFILL_ENABLED` · `RECEPTION_WEBCHAT_ENABLED` · `RECEPTION_WEBCHAT_RATE_SECRET` (ikke sat) ·
`RECEPTION_WEBCHAT_AI_REPLY_ENABLED` · `RECEPTION_BACKGROUND_ENABLED` · `RECEPTION_UPLOAD_LINKS_ENABLED` ·
`RECEPTION_RETENTION_APPLY` · `RECEPTION_LLM_ENABLED`. Uændret: `TELEPHONY_PERSIST_ENABLED`, `RELATEL_LIVE_CALL_ENABLED`,
`RELATEL_SMS_ENABLED` FRA; Nila/Relatel-routing urørt.
Bevis (kun navne, aldrig værdier): `vercel env ls production` må ikke vise nogen `RECEPTION_*` med værdien true — Henrik
bekræfter i Vercel-dashboardet. Adfærdsbevis: kode-smoke (§4 trin 5) + dormancy (§4 trin 9).

## 3. Kørt i preflight (2026-11-18)
| Trin | Script | Resultat |
|---|---|---|
| Pre (read-only) | `npx tsx scripts/prod-00250-preflight.ts pre --save <fil>` | 12/12 PASS · katalog 120/291 · struktur `e67ce437…` · 32 eksisterende henvendelser (0 baggrund, 0 udført, 0 kilde-konflikter, 0 forældreløse) · 0 ubehandlede mails til genforsøg |
| Dry-run (rollback-only, én transaktion, ALTID ROLLBACK) | `npx tsx scripts/prod-00250-dryrun.ts` | [NY] 27/27 · [UÆNDRET] 1/1 — krop kører rent på prod-skemaet, intet eksisterende ændret (18 fingeraftryk), ACL/grants, tråd + kandidat-konflikt, afstemning som rigtig admin via RLS, portal uden tilbud, web-chat, værn, retention dry-run, personaer, rollback-blok → præcis før-struktur |
| Prod uændret efter dry-run | `prod-00250-preflight.ts pre` igen | struktur-md5 = før, alle 18 fingeraftryk = før |

Første dry-run-forsøg havde 5 FAIL i SCRIPTET (ikke i migrationen): grant-tællingen talte tabel-ejeren med, en fixture
startede uden kandidat, og `as()` ruller hver prøve tilbage (afstemnings-effekten forsvandt). Rettet (`asKeep`, API-roller,
fixture med kandidat) og kørt igen grønt. Begge forsøg blev rullet tilbage.

## 4. Præcis deploy-sekvens (KUN efter Henriks godkendelse af 00250)
Rækkefølge efter [[migration-after-compatible-code]]: koden tåler at 00250 mangler (web-chat 404, listen falder tilbage
uden 00250-kolonner, afstemning findes kun i DB), derfor CODE → PUSH → MIGRATION → POST-CHECK.

1. Precheck: `git rev-parse origin/main` = `56decaaf…`; review-HEAD grøn (tsc, check:rbac, check:rls-matrix exit 0).
2. `npx tsx scripts/prod-00250-preflight.ts pre --save pre.json` → alle PASS (inkl. 0 kilde-konflikter blandt de 32).
3. Vercel-flag kontrolleret FRA (§2).
4. Fast-forward main: `git push origin <review-HEAD>:refs/heads/main` (ingen force). Bekræft at Vercel Production serverer SHA'en.
5. Kode-smoke med migrationen fraværende: `npx tsx scripts/prod-00250-code-smoke.ts --expect-commit <sha> --since <deploy-ISO> --migration absent`.
6. `npx tsx scripts/prod-00250-dryrun.ts` igen umiddelbart før (rollback-only) → alle PASS.
7. Anvend KUN 00250: `npx tsx scripts/prod-apply-migration.ts 00250` (lokal APPROVED-liste opdateres med godkendelsesdatoen — committes aldrig).
8. `npx tsx scripts/prod-00250-preflight.ts post --pre pre.json` → alle PASS; `npx tsx scripts/prod-00250-dryrun.ts --post` (personaer/afstemning/værn mod det anvendte skema, rollback-only) → alle PASS.
9. `npx tsx scripts/prod-00250-code-smoke.ts --expect-commit <sha> --since <deploy-ISO> --migration present` og `npx tsx scripts/prod-00250-post-dormancy.ts --since <deploy-ISO>`.
10. Eksisterende smokes: `prod-smoke-00247.ts` (Relatel 401/404), `prod-read-scope-effective.ts`, finance-/medarbejder-/RBAC-smokes som ved 00249.
11. Slut: "00250 PRODUCTION COMPLETE — HUB DORMANT" eller rollback (§5).

Intet trin A–E aktiveres i samme omgang (se fase 3A-runbook §11; hvert trin kræver egen godkendelse).

## 5. Rollback
`docs/runbooks/sql/00250_rollback.sql` (genereret af `reception-00250-probe.ts`; bevist på staging og i prod-dry-run at
genskabe præcis 00249-strukturen). Mister kun 00250-data (tråd-items, web-chat, venter-på-ELTA → åben, markører); de 32
eksisterende henvendelser og alle kanoniske kilder bevares. Kode-rollback: Vercel "Promote" af forrige deployment
(`56decaaf`) — koden tåler begge skema-tilstande.
