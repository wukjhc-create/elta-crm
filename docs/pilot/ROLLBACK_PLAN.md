# ELTA CRM — Rollback-plan (pilotperioden)

Princip: **rul det mindste tilbage der stopper skaden.** Beslutning om rollback i production træffes af Henrik;
alle trin nedenfor er manuelle og dokumenterede — der findes ingen automatisk prod-rollback.

## 1. Stop-knapper (sekunder, ingen deploy)
| Situation | Handling | Effekt |
|---|---|---|
| En agent opfører sig forkert | `UPDATE agent_configs SET enabled = false WHERE agent_type = '<type>';` (Supabase SQL Editor) | Executor afviser alle udførelser for agenten; forslag bevares |
| Auto-oprettelse fra mails | Sikr at `AUTO_CREATE_CASES_ENABLED` ikke er `true` i Vercel env (kontrol: `npm run safety:flags` lokalt) | Mail-analyse fortsætter; ingen sager/tilbud oprettes automatisk |
| En pilotbruger skal ud | Admin → Indstillinger → Brugere → deaktivér (`profiles.is_active=false`) | Brugeren mister adgang; data bevares |
| Mistanke om kompromitteret konto | Supabase Auth → brugeren → "Sign out" + reset password; deaktivér profil | Sessions ugyldiggøres |

## 2. Kode-rollback (minutter)
1. Vercel → projektet → Deployments → vælg sidste kendt-gode production-deploy → **Instant Rollback**.
2. Revert den skyldige commit på `main` (`git revert <sha>` + push), så næste deploy ikke genindfører fejlen.
3. Kør `npm run prod:pilot-health` og bekræft 🟢.

Kode og migrationer deployes adskilt: kode der kræver en ny kolonne merges først **efter** migrationen
(expand/contract — se `docs/runbooks/00159-offers-source-case-id.md`). Derfor kan kode altid rulles tilbage alene.

## 3. Migrations-rollback (kræver godkendelse)
Hver migration har sin rollback-SQL i headeren. Rækkefølge: **rul koden tilbage først**, derefter SQL'en.
| Migration | Rollback | Datatab |
|---|---|---|
| 00159 offers.source_case_id | DROP 2 indexes + kolonne | kun koblingen sag→tilbud |
| 00160 RLS-stramning (forberedt) | genskab de tidligere `USING (true)`-policies (SQL i migrationens header) | ingen |

## 4. Data-rollback
- Supabase Point-in-Time Recovery (kræver plan med PITR) eller dagligt backup → gendannelse til **nyt** projekt,
  og udtræk af de berørte rækker. Aldrig overskriv production-databasen i blinde.
- Agent-oprettede rækker er sporbare: tilbud via `source_case_id`/notes med action-id, sager via `source_email_id`,
  opgaver via `auto_rule`, og alle udførelser har `audit_logs` (`entity_type='agent_action'`).

## 5. Efter enhver rollback
Opret en række i [INCIDENT_LOG.md](INCIDENT_LOG.md), kør `npm run prod:pilot-health`, `npm run prod:role-policies`
og `npm run prod:storage-audit`, og beskriv hvad der skal til før fremrulning igen.
