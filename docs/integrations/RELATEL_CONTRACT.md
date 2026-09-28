# Relatel — teknisk discovery og integrationskontrakt (P3 #15)

**Status (2026-09-28):** discovery færdig, intern foundation bygget og testet. **Ingen forbindelse til Relatel, ingen SMS, ingen opkald.**
Kode: `src/lib/integrations/relatel/` · side `/dashboard/cti` · tests `scripts/relatel-test.ts`, `npm run harness:relatel-lookup`.

## 1. Hvad Relatel tilbyder (verificeret mod offentlig dokumentation)
Kilder: [dev.relatel.dk](https://dev.relatel.dk/), [HTTP API (OAS v2.1.2)](https://dev.relatel.dk/oas/), [iframe API](https://dev.relatel.dk/iframe/).

| Område | Endpoint | Effekt |
|---|---|---|
| Opkald | `GET /calls`, `POST /calls/{uuid}` (hent én) | læs |
| Ring op (click-to-call) | `POST /calls` | **ekstern: ringer rigtigt op** |
| Kontakter | `GET /contacts`, `GET /contacts/by_number/{number}`, CRUD, kommentarer | læs / skriv i Relatel |
| SMS | `GET /messages`, `POST /messages` (én eller flere modtagere) | **ekstern: rigtig SMS**. Afsendernavn skal godkendes, der er daglige grænser og månedlige overforbrugsgrænser. |
| Voicemail | `GET /voicemails`, `GET /voicemails/{id}/download` (MP3) | læs (lyd = persondata) |
| Medarbejdere/grupper | `/employees`, `/employee_groups` (+ SMS til medarbejder/gruppe) | læs / ekstern SMS |
| Statistik | `/statistics`, `/receptions/{id}/statistics` (Contact Center+) | læs |
| **iframe API** | Relatel kalder `GET <vores URL>?number=4571999999` ved et opkald | viser vores side inde i Relatel |

- **Auth:** OAuth 2.0 eller personligt access-token (oprettes i `app.relatel.dk/account/authorized_applications`, kan tilbagekaldes). Bearer-header.
- **Nummerformat:** landekode + nummer uden `+`/`00` (`4571999999`).
- **Ikke offentligt dokumenteret:** webhook-events og signering, feltlisten for `GET /calls` (retning, varighed, optagelse), rate limits for læse-API'et. Det kan først verificeres med et rigtigt token (**BLOCKED**).

## 2. Vigtige designfund
1. **iframe-API'et er uautentificeret.** Det sender kun `?number=` og har ingen signatur eller hemmelighed. En side, der viser kundedata direkte i iframen, ville lække data til alle, der kender URL'en.
2. **CRM'et kan ikke framees i dag.** `vercel.json` sætter `X-Frame-Options: DENY` globalt, og det er korrekt. Supabase-sessionens cookies er desuden `SameSite=Lax` og sendes ikke i en tredjeparts-iframe, så en indlogget visning i iframen virker ikke uden at svække cookie-politikken.
3. **Telefonnumre i CRM'et er blandede** (prod: 65× 8 cifre, 15× `+45…`). Matchning skal ske på normaliserede numre (`phone.ts`), aldrig på rå tekst.

## 3. Anbefalet arkitektur (trinvis, hvert trin er en gate)
| Trin | Indhold | Effekt | Status |
|---|---|---|---|
| **0 — foundation** | Nummer-normalisering, opkalds-opslag `/dashboard/cti?number=` (login + `customers.view`, RLS), kontrakt-typer, **deaktiveret klient** der afviser alt | ingen | ✅ bygget |
| 1 — CTI "Åbn i CRM" | Lille offentlig side på egen route (fx `/relatel/cti`) med `frame-ancestors https://app.relatel.dk`, som **ingen data viser**. Den har kun en knap, der åbner `/dashboard/cti?number=…` i en ny fane, hvor login og RLS gælder. | ingen | kræver ændring af sikkerhedsheadere → **beslutning** |
| 2 — opkaldslog (læs) | Periodisk `GET /calls` → ny tabel `call_log` (retning, tid, varighed, nummer, match til kunde) → vises på kunden | læs | kræver token + migration + cron → **gate** |
| 3 — click-to-call | Knap på kunde/sag → `POST /calls` | **ekstern** | Agent Core-lignende approval-model er ikke nødvendig for en menneskeklikket handling, men kræver token + beslutning |
| 4 — SMS via Relatel | `POST /messages` | **ekstern** | I dag findes GatewayAPI. Det kræver en beslutning om udbyder, og automatik skal gå gennem `AGENT_LIVE_SEND_ENABLED` + approval |
| 5 — voicemail | Liste + afspilning via proxy (MP3 = persondata) | læs | GDPR-afklaring |

## 4. Kontrakt i koden
- `phone.ts`: `toRelatelNumber`, `samePhone`, `formatPhoneForDisplay` (8 cifre → `45…`, `00`-præfiks fjernes, `+` bevarer landekode).
- `contract.ts`: typer (`RelatelCall` markeret UVERIFICERET) og `RELATEL_OPERATIONS` med effektklasse pr. operation (`startCall` = push_external, `sendMessage` = send_external). Desuden `RelatelClient`-interface og `disabledRelatelClient`, som kaster `RelatelDisabledError` for alle operationer. Der findes ingen HTTP-klient.
- `lookup.ts`: `lookupCaller(client, number)` matcher kunder (telefon+mobil), kontakter og leads og returnerer åbne sager og tilbud. Den kører med brugerens klient.

## 5. Hvad der mangler for at gå videre (BLOCKED)
- Relatel access-token eller OAuth-app (Henrik), og aftale om abonnementsniveau (statistik kræver Contact Center+).
- Beslutning om trin 1 (headers for en dataløs iframe-side) og om SMS-udbyder.
- Verifikation af `GET /calls`-felter og webhooks med token, før `call_log`-migrationen designes endeligt.
