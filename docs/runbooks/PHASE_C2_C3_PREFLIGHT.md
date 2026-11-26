# Phase C2 + C3 — teknisk præflight: identificér afsender → foreslå kunde → foreslå sag

Status: **FORSLAG (2026-11-26)** — intet implementeret, ingen migration. Kræver Henriks godkendelse pr. trin.
Faste rammer: ingen automatisk kundeoprettelse fra en ukendt afsender, ingen automatisk sagskobling i første version,
ingen sammenlægning af kunder, ingen ekstern kommunikation, F-1 urørt (alt er internt), ingen AI-handling uden menneske.
C4a (Henrik 2026-11-26): den eksisterende automatiske kundeoprettelse bevares, indtil C2/C3/C4-erstatningen er klar.

## 1. Arbejdsgang (målbillede)
```
Ny mail (5-min sync, median ~2 min)
 → C1 klassifikation (afsendertype · henvendelsestype · sagsreference) — findes, shadow
 → C2 identitet: hvem er afsenderen?  [verificeret | sandsynlig | usikker | ukendt]  + kandidatkunder/-parter m. evidens
 → C3 sagsforslag: relevante eksisterende sager for kandidaten(e)  [verificeret | sandsynlig | usikker]
 → ÉT begrundet forslagskort i mailvisningen/henvendelsen:
      ✔ Kobl til kunde X (+ sag SVC-…)   ⟷ alternativer side om side når der er flere
      ✚ Opret ny kunde (forudfyldt — kræver klik)   ⇢ Leverandør/partner   ⇢ Manuel behandling
 → medarbejderen vælger (1–2 klik) → eksisterende koblingsstier udfører + audit (forslag, valg, evidens)
```

## 2. Identitetsniveauer (gælder både kunde og sag)
| Niveau | Betydning | Eksempler | Hvad UI'et må |
|---|---|---|---|
| **Verificeret** | Deterministisk, menneskeligt bekræftet nøgle | e-mail i `parties.verified_emails`; tidligere mail i samme tråd koblet af et menneske; eksakt e-mail på kunde/kontakt oprettet af et menneske; eksakt sagsnummer | Forvalgt forslag (stadig 1 klik for at bekræfte) |
| **Sandsynlig** | Deterministisk nøgle, men svagere kilde | eksakt e-mail på AUTO-oprettet kunde; eksakt CVR; kanonisk telefonnummer (ikke omstilling); verificeret domæne (ikke gratis-mail); webformularens e-mail | Vist som forslag, ikke forvalgt |
| **Usikker** | Lighed, ikke identitet | navnelighed, kontaktpersonens navn, adresselighed, kundens eneste åbne sag | Kun som alternativ under "Andre muligheder" |
| **Ukendt** | Ingen evidens | ny afsender | Aldrig "kunde" automatisk → "Opret ny kunde (forudfyldt)" / manuel |

Flere kandidater på samme niveau → **alle vises som alternativer** (aldrig vilkårligt valg). Konflikt mellem niveauer
(fx leverandørevidens vs. kundematch) → kortet viser konflikten og vælger intet (C1-reglen "tvivl → ukendt").

## 3. Matchsignaler — mulighed og datagrundlag i prod (read-only 2026-11-26, kun antal)
| Signal | Data i prod | Niveau | Vurdering |
|---|---|---|---|
| E-mailadresse | 113/128 kunder har rigtig e-mail; 6 kontakter; **5 adresser deles af 18 kunder** | verificeret/sandsynlig | Stærkeste signal. Dubletter → vis alternativer (input til C4) |
| CVR | 2/128 kunder har CVR; parter har unikt CVR | sandsynlig | Lav dækning nu; udtræk "CVR nr." fra signatur er muligt men skal skelne ELTA's egen signatur i citeret tekst |
| Telefonnummer | 100/128 kunder har telefon; `canonicalPhone` findes | sandsynlig | God dækning. Aldrig alene "verificeret" (omstillinger, delte numre); udtræk fra formular/signatur |
| Kundenavn | alle | usikker | Kun alternativ; `party_normalize_name` (selskabsform fjernes) |
| Kontaktperson | alle (felt udfyldt) | usikker | Kun alternativ |
| Adresse | 95/128 har adresse, men kun 7 postnr.; sager 1/8 | usikker | Svag uden normalisering (DAWA) — senere |
| Sagsnummer | 8 sager; **1** mail har nævnt SVC-nr. | verificeret | Høj værdi pr. træf, lav frekvens i dag. **Løftestang:** sæt `[SVC-01006]` i emnet på ELTA's udgående mails, så svar bærer nummeret |
| Ordre-/tilbudsnummer | 15 tilbud (`TIL…`); 4 mails nævner et tilbudsnummer; leverandørfakturaer har ordre-felter | verificeret (tilbud) | Tilbudsnummer → tilbud → kunde/sag. Leverandørens ordrenr. → indkøb (C1 "match mod indkøb") |
| Mailtråd | 992/1.003 mails har tråd-id; 120 tråde har > 1 mail | verificeret når en tidligere mail i tråden er koblet af et menneske | Billigt og stærkt; i dag er 0 mails koblet til sag, så sags-trådsignalet vokser først med brug |
| Partsrelationer | 1 part i prod (fase B) | verificeret | Vokser via "Husk afsender" (C2) |
| Samarbejdspartnere | relation `cooperation_partner` | verificeret (afsender) / usikker (hvilken slutkunde) | Partnerens mail om en slutkunde → sagsforslag via slutkundens navn/adresse er kun usikkert |
| Anlæg/serienumre | intet anlægsregister; EAN/KSR på sager 0/8; `serial_number` kun på medarbejderudstyr | — | **Ikke muligt nu.** Kræver et anlægsregister (egen præflight) |

## 4. C2 — afsender → part (leverance)
- **Funktion:** opslag i rækkefølge (stop ved første entydige verificerede): verificeret part-e-mail → tråd koblet af menneske
  → eksakt kunde-/kontakt-e-mail (menneskeskabt) → verificeret domæne (ikke gratis/eget) → auto-kunde-e-mail → CVR → telefon.
  Leverandørværnets regler (S2) bruges uændret. Resultat: kandidater m. niveau + evidenskoder.
- **"Husk afsender"** (kun `parties.manage`): tilføjer e-mail/domæne til partens verificerede felter via den EKSISTERENDE
  RPC `update_party` (00255, auditeret) — **ingen migration i v1**. Gratis-maildomæner afvises i appen (én liste,
  `free-mail-domains.ts`). Kendt risiko: `update_party` erstatter hele listen → samtidige "Husk" kan tabe én; afbødes med
  genlæsning + efterkontrol; en additiv RPC kan komme senere (migration, egen godkendelse).
- **UI:** afsender-linje i mailvisningen/henvendelsen: "Afsender: KlimaEnergi (samarbejdspartner) · verificeret (e-mail)".
- **Rettigheder:** visning følger mail-scope (00246) + `party_visible_to_me`; skrivning kun `parties.manage`.
- **Sikkerhed:** afsenderadresser kan forfalskes → match er en kandidat, aldrig autentifikation; ingen ekstern synlighed.

## 5. C3 — kunde- og sagsforslag (leverance)
- **v1 (ingen migration):** forslag beregnes ved visning (som C1a — samme kontekst-kerne), valg udføres via de eksisterende
  koblingsstier (manuel kobling `linked_by='manual'`, sagskobling fra mailen) og registreres i `audit_logs`
  (`link_suggestion_shown/accepted/rejected` med niveau + evidenskoder) → giver C0-målepunkterne "accepterede/afviste/
  uafgjorte forslag" og "mails koblet til eksisterende sager". Ingen automatisk kobling (`MAIL_AUTOLINK_MODE` forbliver off).
- **Sagsforslag pr. kandidatkunde:** åbne sager sorteret efter evidens: eksakt sagsnummer/tråd (verificeret) > tilbudsnummer
  → sag (verificeret) > kundens åbne sager (usikker; flere → alternativer). Lukkede sager kun ved eksplicit nummer.
- **Ukendt afsender:** "Opret ny kunde" åbner den normale kundeformular forudfyldt (navn/telefon/e-mail fra mail/formular) og
  viser C4-dublet-kandidater (samme e-mail/telefon/CVR) FØR gem — kunden oprettes kun ved klik.
- **v2 (kræver migration, egen præflight):** tabel `communication_suggestions` (fælles for C3/C4/C6: kind, target, niveau,
  evidens, status proposed/accepted/rejected/expired, decided_by/at; RLS = mailens scope; skrivning kun via RPC). Først når
  v1 har vist, at forslagene bruges — og når Stage A-arbejdsgangen er afklaret (se STAGE_A_USAGE_REVIEW.md).
- **Rettigheder:** kundekobling `customers.emails.view` + `customers.edit`; sagskobling `cases.edit` + sagen i scope; et
  forslag giver ALDRIG adgang til en kunde/sag uden for brugerens scope (filtreres med brugerens egen klient).

## 6. Sikkerhedsrisici
- Forfalsket afsender → kun kandidater; verificeret kræver menneskelig bekræftelse tidligere.
- Lækage via forslag → beregnes med service-role men vises kun hvis brugerens egen klient kan se kunden/sagen.
- Forkert kobling = intern fejl (mails/vedhæftninger er altid interne; portalen læser ikke koblinger, F-1 urørt).
- Dublet-forstærkning: forslag må aldrig oprette kunder; dubletter vises som alternativer.

## 7. Afhængigheder
C1 (kontekst-kerne, findes) · C1a (feedback, måling af korrekthed) · 00246 (mail-scope) · 00255 (`update_party`) · leverandør-
værnet (S2) · beslutning om primær arbejdsflade (Stage A-undersøgelsen) · C4 (dublet-kandidater i opret-kunde).

## 8. Teststrategi
Fixture-tests pr. signal og niveau (inkl. konflikter → alternativer, gratis-domæner, auto-kunde vs. menneskeskabt);
paritetstest kontekst-kerne (som `cli.ts c1a-parity`); staging-probe af scope (salg/montør ser kun egne kandidater);
UI-test: forslagskort med alternativer, accept → kobling + audit, afvis → audit, ukendt afsender → ingen kunde uden klik;
prod read-only shadow: hvor ofte ville v1 have foreslået det, medarbejderen faktisk valgte (C0-metrics).

## 9. Rollback
v1: feature-flag FRA → kortet forsvinder; intet data ændret ud over de koblinger medarbejderne selv valgte (som i dag).
"Husk afsender": verificerede felter kan fjernes igen via `update_party` (auditeret). v2: egen migration med rollback-sektion.
