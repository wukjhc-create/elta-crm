# Mail-sync — frekvens, begrænsninger og muligheder (read-only undersøgelse 2026-11-26)

Ingen ændring af frekvensen. Kilder: koden (fil:linje) og prod read-only (`system_health_log` service `cron`, kun antal).

## Hovedfund: mail-sync kører ALLEREDE hvert 5. minut
- `vercel.json:41-42`: `email-sync` = `*/5 * * * *` siden commit `849c0936` (2026-11-21, Vercel Pro + kørsels-lease 00253).
- Prod bekræfter: 288 kørsler/døgn 2026-11-22 → 25, 0 fejl (`system_health_log`, service cron).
- Forsinkelse efter omlægningen (mails modtaget siden 2026-11-22, n=23): median **2,2 min** fra modtagelse til mailen
  er i CRM og **2,4 min** til kundekobling. Det tidligere tal (~16 t) i C0 skyldtes mails fra før omlægningen
  (daglig kørsel kl. 05 UTC på Vercel Hobby, som kun tillader daglige crons).
- Forældet dokumentation der stadig siger "dagligt": `docs/system-map.md:139`, `docs/module-map.md:120`,
  `docs/data-model-risks.md:299-309`, `STAGE_A_EMAIL_INGEST_PREFLIGHT.md:9`, `AUTONOMOUS_BACKLOG.md:1624` (N71) og
  kommentaren i `src/app/api/email/sync/route.ts:12-13` — bør rettes (dokumentation, ingen adfærd).

## Hvordan sync'en virker (kort)
- Cron-rute `src/app/api/cron/email-sync/route.ts` (maxDuration 300 s, CRON_SECRET, logges via `withCronRun`).
- `runEmailSync` holder en lease (`email-sync`, TTL 330 s, `sync-lease.ts:18,41-56`): overlappende kørsel → springes over
  (`already_running`); lease-fejl → springes over (fail-closed). Prod: 0 `already_running`, 0 `lease_error` (TECH-LEASE-1 er
  kun en ustabil staging-test).
- Graph delta pr. postkasse (`graph_sync_state.delta_link`), maks 20 sider × 50 = 1.000 mails/postkasse/kørsel; ugyldig
  delta → fuld sync. Idempotent: upsert `onConflict graph_message_id, ignoreDuplicates`.
- Efter indsættelse: deterministisk kobling → mail-AI (kun ukoblede/videresendte; højst 60 mails/kørsel à ≤ 2 kald,
  dagligt loft `AI_DAILY_CAP` 2000) → Stage A-indtag (atomisk, unik pr. kilde + advisory lock). Sendte mails hentes uden AI.
- Målte kørselstider (runbook): p50 75 s, p95 128 s, max 241 s — inden for 5-min-intervallet og lease-TTL'en.
- Graph: app-only client credentials; 429 respekterer Retry-After; 401/5xx/netværk: højst 2 genforsøg (`microsoft-graph.ts:182-268`).

## Muligheder
| Mulighed | Forsinkelse | Omkostning / grænser | Risiko |
|---|---|---|---|
| **Hvert 5. min (nu)** | ~2–5 min | 288 kørsler/døgn; Vercel Pro-funktionstid ≈ p50 75 s × 288 ≈ 6 t/døgn; Graph: få kald pr. kørsel (delta) — langt under throttling-grænserne | Kendt og stabil i prod (0 fejl). Næsten hele forsinkelsen er intervallet |
| Hvert 15. min | ~7–15 min | ⅓ af funktionstiden | Lavere omkostning; mærkbart langsommere svar på henvendelser |
| Hvert 30. min | ~15–30 min | ⅙ af funktionstiden | Billigst; for langsomt til "ring tilbage samme time" |
| Eventbaseret (Graph change notifications) | sekunder–1 min | Ny offentlig webhook-rute (validationToken-ekko + clientState-tjek), abonnementer pr. postkasse der udløber efter ≈ 3 døgn → fornyelses-cron; Graph-notifikationer kan komme dobbelt/i ryk | Mere kode og drift (ny offentlig endpoint, fornyelse, overvågning). Anbefalet design: notifikationen udløser blot den EKSISTERENDE delta-sync under samme lease (med debounce) — aldrig behandling pr. besked; 5-min-cron'en bliver som sikkerhedsnet |

AI-omkostningen følger antallet af NYE mails, ikke kørselsfrekvensen (kun ukoblede/videresendte nye mails går til AI).

## Risici ved højere frekvens / events (og hvad der allerede dækker dem)
- Overlap → dækket af lease (prod: 0 kollisioner).
- Den manuelle sync-rute har `maxDuration=60` < typisk kørsel (p50 75 s): bliver den dræbt, holdes lease'en til TTL (330 s),
  og næste cron springes over. (Slutning fra koden — ikke set i prod.)
- "Nulstil delta" (`incoming-emails.ts:1935-1939`) tager ikke lease'en; rammer den under en kørsel, kan kørslen skrive sin
  egen delta tilbage. (Slutning fra koden.)
- Auto-kundeoprettelse i mail-AI'en er læs-så-indsæt uden lås (`email-intelligence.ts:540-686`; loft 25/døgn); lease'en
  serialiserer i dag. Parallelle webhook-behandlere ville genåbne dublet-risikoen → derfor "webhook udløser kun sync under lease".

## Anbefaling
Behold 5 minutter (det virker, 0 fejl, ~2 min median). Eventbaseret modtagelse giver højst et par minutter mere og bør først
overvejes, hvis en konkret arbejdsgang kræver sekund-reaktion — og da kun som "notifikation → eksisterende sync under lease".
Lille oprydning værd at godkende separat: ret de forældede dokumenter og hæv/omlæg den manuelle rutes timeout (60 s).
