# ELTA Assistant / Telegram — design fase 1 (T1–T10)

**Princip:** CRM er source of truth. Telegram-laget gemmer KUN koblingen Telegram-chat ↔ CRM-bruger. Opgaver,
tidspunkter, noter og aftaler ligger i CRM's eksisterende tabeller; Telegram læser dem ved hver handling.
**Gate:** ingen live bot (token/webhook/afsendelse) i prod uden separat godkendelse. Alt bygges og testes på staging.

## Dataflow
```
Telegram-besked → /api/assistant/telegram (webhook, hemmelig header) → kobling → CRM-bruger + rolle
  → parseAssistantCommand (ren)           src/lib/assistant/command-parser.ts   ✅ T1
  → resolveTarget (kunde/sag, aldrig gæt)  src/lib/assistant/resolve-target.ts   ✅ T1
  → handling i CRM (samme rettigheder som brugerens rolle i CRM) → audit_logs
  → svar i Telegram (knapper: Ring nu · Åbn kunde · Udsæt · Udført)
Påmindelser: cron læser customer_tasks.reminder_at (CRM) → sender → audit-række markerer "sendt" for netop det
tidspunkt. Flyttes/ændres tiden i CRM, gælder den nye tid automatisk (ingen kopi i Telegram-laget) — T4.
```

## Kortlægning til eksisterende CRM-tabeller (verificeret skema 2026-10-07)
| Kommando | CRM | Bemærkning |
|---|---|---|
| Ring til X … (T1) | `customer_tasks` (title "Ring til …", due_date, reminder_at, assigned_to = brugeren, auto_rule `assistant_callback`, service_case_id ved sag) | kræver kunde (customer_id NOT NULL) |
| Mind mig om … (T7) | med kunde/sag: `customer_tasks`; UDEN kunde: `personal_reminders` (00197, udkast) | Henrik 2026-10-07: customer_tasks gøres IKKE nullable. Undersøgt: ingen generel opgave-model findes (project_tasks = gammel projektmodel, agent_tasks = agent-motor) → lille generel CRM-model, brugbar direkte i CRM |
| Note på kunde/sag (T6) | sag: eksisterende `case_notes` (+ kolonnen `source`); kunde: `customer_notes` med samme form (00196, udkast) | `customers.notes` overskrives aldrig; tidsstemplet, created_by, source manual/assistant/telegram/system, audit |
| Besigtigelse/aftale (T5) | `bookBesigtigelse`-flowet (customer_tasks "Besigtigelse") | genbrug eksisterende logik |
| Opslag (T8) | customers / service_cases med brugerens rettigheder | montør kun eget scope |
| Kalender (T2) | Kalenderens månedsvisning viser i dag kun besigtigelses-opgaver; dag/uge kun arbejdsordrer | udvid månedsvisning med assistent-callbacks |
| Audit (T9) | `audit_logs` (entity_type `assistant`, action `assistant_<handling>`, metadata: kanal, kommando-type, mål-id) | ingen ny tabel |

## Status 2026-10-07
- 00195 `assistant_links` anvendt på STAGING (godkendt). Ikke i prod.
- Bygget (staging, intet live): webhook `/api/assistant/telegram` (404 uden `ASSISTANT_TELEGRAM_ENABLED`, hemmelighed
  timing-safe, fail-closed), kobling via engangskode i profilen (kun hash gemmes, 10 min), kommandoer, knapper
  (Ring nu · Åbn kunde · Udsæt · Udført) med ejer-/rolle-tjek, påmindelses-cron `/api/cron/assistant-reminders`
  (IKKE i vercel.json), audit af alt. Test: `cli.ts telegram-check` 20/20, `U141`.
- Secrets til senere prod-aktivering (sættes i Vercel, aldrig i repo): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
  (≥ 16 tegn), `ASSISTANT_TELEGRAM_ENABLED=true`, setWebhook med `secret_token`, cron i vercel.json.
- 00196 (noter) og 00197 (personlige påmindelser) anvendt på STAGING efter godkendelse 2026-10-07. RLS/rolle: `cli.ts notes-reminders-rls` 50/50; assistent-flow: `notes-reminders-flow` 15/15; UI: U142 (notelog), U143 (Mine påmindelser). Ikke i prod — UI skjules automatisk hvor tabellerne mangler.

## Tabel assistant_links (00195)
`assistant_links`: kobling af én Telegram-chat til én aktiv CRM-bruger via engangskode genereret i CRM
(Indstillinger → Profil → "Forbind Telegram"). Kun inviterede medarbejdere; deaktiveret bruger = ingen adgang.
Se `supabase/migrations/00195_assistant_links.sql` (udkast).

## Sikkerhed
- Webhook: Telegrams `X-Telegram-Bot-Api-Secret-Token` sammenlignes timing-safe; ukendt chat → ingen data, kun
  "forbind din konto i CRM".
- Rettigheder: brugerens CRM-rolle (permissions.ts) håndhæves server-side for hver handling (admin-klient + eksplicit
  rolle-tjek, da webhook ikke har browser-session). Montør ser kun eget scope.
- Ingen persondata i Telegram ud over det brugeren selv spørger om; ingen kost/løn i svar.
- Alle handlinger audit-logges (T9).
