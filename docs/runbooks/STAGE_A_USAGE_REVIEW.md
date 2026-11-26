# Stage A — hvorfor bliver forslagene ikke brugt? (read-only undersøgelse 2026-11-26)

Ingen runtime-ændring. Kilder: koden (fil:linje nedenfor) og prod read-only (kun antal).

## Fakta (prod, read-only 2026-11-26)
- Stage A har kørt siden 2026-11-18 (8 dage): 50 henvendelser (46 mail, 4 web-chat), 111 handlinger: proposed 78, blocked 33,
  **0 afgjort** (ingen decided_at), **0 behandlet** (handled_at), **0 tildelt**. Status: new 15+4, handoff 31.
- Mailene bag henvendelserne: 44 af 50 er heller **ikke læst i CRM's mailindbakke** (is_read=false); 33 står uidentificeret,
  17 er auto-koblet. For de 23 henvendelser med kandidatkunde er der **0** opgaver, sager eller tilbud oprettet bagefter.
- Aktive brugere: 3 admin + 1 montør aktive profiler; **2 brugere** med audit-aktivitet de seneste 14 dage (37 hændelser).
- Forslagstyper: append_communication 50 (ren log-post), create_task 18, create_customer_proposal 7, create_case_proposal 2;
  blokeret: create_callback 30, request_documents 2.

**Konklusion:** henvendelserne er reelt ubehandlede i CRM — men mailene er det også. Medarbejderne arbejder (formentlig) i
Outlook og ikke i CRM's mail- eller henvendelsesflow. Stage A er ikke "fejlet"; den har ikke fået en plads i arbejdsdagen.
(At medarbejderne bruger Outlook er en slutning ud fra data — skal bekræftes med Henrik.)

## Hvor ses forslagene, og hvem kan behandle dem
- Siden `/dashboard/henvendelser` (`src/app/dashboard/henvendelser/page.tsx:19`, gate `conversations.view`); link i
  sidebaren (`src/components/layout/sidebar.tsx:91-94`), intet feature-flag skjuler den.
- Forslag vises KUN i detaljepanelet efter klik på en række ("Afventer din godkendelse", `henvendelser-client.tsx:84-87`,
  Godkend/Afvis `:342-345`). Listen viser ikke antal ventende forslag (`:171-173`).
- Rettigheder (`src/lib/auth/permissions.ts:40-42`): se/behandle = admin, serviceleder, salg, bogholderi; montør intet.
- Ingen badge, notifikation eller dashboard-flise for henvendelser/forslag. Cockpit-flisen "Henvendelser fra hjemmesiden"
  (`styrings-cockpit.tsx:339-357`) handler om webformular-mails — navnesammenfald der kan give indtryk af, at det er dækket.

## Klik pr. godkendelse og barrierer
| Forslag | Klik | Barriere |
|---|---|---|
| create_task / create_callback | sidebar → række → Godkend (3) | Fejler med "Bekræft kunden først", medmindre kunden er bekræftet (`actions/henvendelser.ts:401`); auto-koblede mails giver kun en *kandidat* → ekstra klik "Bekræft" (og bekræftelse flytter henvendelsen ud af standardvisningen "Nye", `:216`/`:62`) |
| create_customer_proposal / create_case_proposal | 3 | Godkend registrerer kun "approved" + en tekst; kunden/sagen skal stadig oprettes i den normale formular. Forslaget kan derefter aldrig afsluttes ("Godkendt — venter på udførelse", `:420-427`) |
| append_communication (50) | 3 | Meningsløs at godkende (kun en log-post). Politikken siger `auto`, men DB gør alle baggrundsforslag til `proposed` (`00250:607-609`) → støj |
| create_callback blokeret (30) | — | `handoff` ved lav sikkerhed (< 0,7) uden LLM (`action-policy.ts:76,97`; LLM er FRA i prod). Ingen knapper og låst af trigger (`00249:391`) — kan ikke behandles |

- Mail-indbakken og henvendelser er **frakoblede**: manuel kobling i `/dashboard/mail` kopierer kunde/sag til henvendelsen
  (trigger `00250:890`), men sætter aldrig status/handled_at. Opgaver/sager oprettet andre steder rører ikke henvendelsen.

## Anbefaling (prioriteret — ingen er implementeret)
1. **Afklar arbejdsgangen med Henrik først (ingen kode):** hvor arbejder kontoret i dag (Outlook?), og hvem skal eje
   indbakken? Uden en beslutning om "CRM er stedet hvor mails behandles" vil ingen UI-forbedring blive brugt.
2. **Én indgang, ikke to:** gør henvendelser til den primære liste (eller vis henvendelsens forslag direkte i mailvisningen).
   Behandling i ét flow (kobling, opgave, ignorér) skal lukke henvendelsen automatisk — sporbart og reversibelt.
3. **Fjern støjen:** append_communication må ikke vises som et forslag (det er en log); blokerede tilbagekald vises som en
   tydelig "ring tilbage?"-opgave i stedet for en død række.
4. **Én-klik der faktisk gør noget:** kunde-/sagsforslag åbner den forudfyldte formular og afslutter forslaget når
   kunden/sagen er oprettet; opgaveforslag på en *kandidat*-kunde tilbyder "Bekræft kunde og opret opgave" i ét klik.
5. **Synlighed:** tæller i sidebaren ("Henvendelser 19") og en dashboard-flise "Venter på ELTA"; omdøb cockpit-flisen
   til "Webformular-mails".
6. **Mål effekten med C0** (`prod-phase-c-shadow.ts metrics`): behandlede henvendelser, afgjorte forslag, tid til behandling.

Punkt 2–5 er runtime-ændringer af Stage A og kræver Henriks godkendelse (Henrik 2026-11-26: ingen Stage A-ændringer endnu).
