# ADDR-1: afløser for DAWA-adresseopslag (research 2026-10-19)

**Status:** BLOCKED_CONFIGURATION / RESEARCH.

Koden har nu en udbyder-abstraktion (`src/lib/address/provider.ts`), styret af to miljøvariabler:
- `ADDRESS_LOOKUP_ENABLED=false` (standard)
- `ADDRESS_LOOKUP_PROVIDER` (endnu ingen registreret udbyder)

Uden konfiguration sker der ingen netværkskald, og adressefelterne er fritekst med en note.

Kilderne er officielle: dataforsyningen.dk, confluence.kds.dk og datafordeler.dk. Punkter mærket [probe] er tjekket med et anonymt GET-kald.

## Fakta

| Emne | Fund | Kilde |
|---|---|---|
| DAWA | Lukket 1. oktober 2026. Autocomplete og /postnumre svarer 410 Gone (målt 2026-10-19). | dataforsyningen.dk/data/4924, /news/5117 |
| GSearch | Lukker 29. oktober 2026 kl. 16:00. **Bruges ikke.** | Dataforsyningens FAQ 5188, /data/4831, klimadatastyrelsen.dk-nyhed (sept. 2026) |
| Bifrost (GSearchs afløser) | I produktion fra 2. november 2026. Ingen officiel produktions-URL endnu. Bearer-token, POST /search og /resolve, koordinater i EPSG:25832. Postnumre er ikke dokumenteret. | confluence.kds.dk/display/Bifrost |
| **Adressevælgeren** (officiel afløser for DAWA Autocomplete) | `https://adressevaelger.dk`. Type-ahead via `GET /adresser/soeg?tekst=…&token=…`, `/husnumre/soeg`, `/soeg?maal=navngivenvejpostnummer`. Opslag via `/adresser/{id}` og `/husnumre/{id}`. Fonetisk søgning. Ikke 1:1 med DAWA. | confluence.kds.dk (Adressevælger, side 234782998) |
| Auth (Adressevælger) | `token` er påkrævet (ellers 400) [probe]. Der er endnu ingen brugerstyring: token er en vilkårlig streng på mindst 10 tegn. Rigtig brugerregistrering forventes ultimo 2026 / primo 2027. | confluence.kds.dk/display/ADV/Brugerstyring |
| Rate limit | Adressevælgerens FAQ: "der kommer ikke til at være en limit". Datafordeleren: kun et loft på GraphQL-forespørgslers størrelse. | confluence.kds.dk/display/ADV/FAQ |
| Svarformat | **Søgning:** `{fund: [{type, id, titel, husnummerId}]}`. Ingen koordinater og ingen etage/dør. **Opslag:** `husnummer.postnummer.{postnr, navn}`, `vejnavn`, `husnummertekst`, `etagebetegnelse`, `doerbetegnelse`, koordinater i **EPSG:25832** (ikke WGS84) [probe]. | Adressevælgerens dokumentation |
| Postnummer → by | Intet dedikeret endpoint i Adressevælgeren. Byen fås fra opslagets `husnummer.postnummer.navn` eller fra Datafordeleren GraphQL `DAR_Postnummer` (postnr, navn). Det kræver en API-nøgle via portal.datafordeler.dk (IT-system, MitID Erhverv). | confluence.kds.dk (Mapning fra DAWA til Datafordeleren) |
| CORS | Adressevælgeren svarer `Access-Control-Allow-Origin: *` [probe]. **Vi kalder alligevel kun fra serveren**, så kommende tokens holdes hemmelige. | probe |
| Kendte fejl | "oe/ae" matches ikke til ø/æ. Manglende mellemrum efter komma bryder søgningen. | confluence.kds.dk/display/ADV/Kendte+fejl |

## Anbefaling (før implementering)

1. **Autocomplete:** udbyderen `adressevaelger` bygges mod Adressevælgeren, kun serverside.
   - Søgning: `/adresser/soeg?tekst=&maksimum=8`.
   - Valg af forslag: `/adresser/{id}` henter detaljer (postnr, by, etage/dør, koordinater).
   - Koordinaterne konverteres fra UTM32 (EPSG:25832) til WGS84 serverside.
   - Token i `ADDRESS_LOOKUP_TOKEN`, kun i Vercel og aldrig i klienten.
   - Indtil KDS' brugerregistrering findes, er tokenet en fast streng, som Henrik vælger. Ingen gæt i koden.
2. **Postnummer → by:** Datafordeleren `DAR_Postnummer` (GraphQL med API-nøgle), cachet i hukommelsen. De ca. 1.100 postnumre ændres sjældent. Alternativt en officiel DAR-postnummerfil, der importeres og opdateres månedligt. Ingen heuristik.
3. **Ikke** GSearch og **ikke** Bifrost, før der findes en produktions-URL og dokumenteret postnummerunderstøttelse.
4. **Aktivering:** først efter Henriks godkendelse af udbyder og token-/nøglemodel. Derefter sættes `ADDRESS_LOOKUP_ENABLED=true` og `ADDRESS_LOOKUP_PROVIDER=adressevaelger` på staging, med test, før prod.

## Kræver Henriks beslutning

- **A:** Adressevælgeren som autocomplete-udbyder. Token-strengen er i dag fri, og registrering kommer senere.
- **B:** Postnummer → by via Datafordeleren-API-nøgle. Det kræver oprettelse af et IT-system på portal.datafordeler.dk med MitID Erhverv. Alternativet er en importeret DAR-postnummerfil.
- **C:** Tidspunkt for aktivering (staging først).

## Implementering (Henrik 2026-10-19: A + B godkendt, C = staging først)

### Kode

| Område | Fil |
|---|---|
| Udbyder `adressevaelger` (serverside) | `src/lib/address/providers/adressevaelger.ts` |
| Registrering af udbyderen | `src/lib/address/provider.ts` |
| Konvertering UTM32 → WGS84 | `src/lib/address/utm32.ts` |
| Postnummer → by | `src/lib/address/postcodes.ts` med datasættet `src/lib/address/data/dk-postcodes.json` |
| API-ruter (alle kræver login) | `/api/address/search`, `/api/address/resolve`, `/api/address/postcode` |
| Klient | `AddressAutocomplete` og `DawaAddressInput` slår det valgte forslag op via id (`lib/address/client-resolve.ts`) |

**Udbyderen `adressevaelger`:**
- Flow: søgning → valg → opslag via id → normalisering → UTM32 omregnes til WGS84 på serveren.
- Rettelser af udbyderens kendte fejl:
  - Komma uden mellemrum rettes.
  - Ved 0 fund prøves en "oe/ae/aa → ø/æ/å"-variant (brugeren vælger selv blandt forslagene).
- Kræver `ADDRESS_LOOKUP_TOKEN`. Uden token er funktionen slået fra.

**Postnummer → by:**
- Datasættet er importeret fra det officielle DAR via `scripts/import-dk-postcodes.ts` (1.089 gældende postnumre, kildeversion 2026-10-14). Metadata: kilde, version, hentetidspunkt og licens (CC BY 4.0, Klimadatastyrelsen).
- Kilden er Datafordeleren DAR REST `postnummer`, som er anonym. Den udfases 15/1-2027, hvorefter importen køres med `--from-file` på en DAR-fildownload.
- Opdatering er sikker: importen validerer og nægter at fjerne mere end 5 % af postnumrene uden `--allow-shrink`.
- Storkundepostnumre (fx 0800, 1092) findes ikke i DAR. De giver intet autofyld, og byen skrives manuelt.

### Fejlhåndtering

- Udbyderfejl, timeout og ukendte postnumre giver tomme svar.
- Adressefeltet er altid fritekst.
- Kunde- og sagsoprettelse afhænger aldrig af opslaget.

### Test

**Unit:** `scripts/address-provider-test.ts`, 29 cases, uden netværk.

**Integration mod den rigtige Adressevælger:** `scripts/address-provider-integration.ts` med et tilfældigt token pr. kørsel. Dækker:
- æ/ø/å
- etage/dør
- komma
- oe → ø
- intet fund
- timeout
- opslag af enhed og husnummer (koordinater)
- postnummer

**UI på staging-build:**
- `UI_ADDRESS_LOOKUP=1 npm run harness:ui-batches -- U212` (slået til):
  - forslag → valg → vej/postnr./by udfyldt
  - 4583 → Sjællands Odde
  - 0000 → intet autofyld
  - fritekst er stadig mulig
- U211 (slået fra): note vises og ingen eksterne kald.

### Aktivering (forslag — kræver Henriks godkendelse)

1. Generér et projekt-token på mindst 32 tegn, fx:
   `node -e "console.log('elta-crm-' + require('crypto').randomBytes(24).toString('hex'))"`
2. Vercel, miljøet **Preview/staging**:
   - `ADDRESS_LOOKUP_ENABLED=true`
   - `ADDRESS_LOOKUP_PROVIDER=adressevaelger`
   - `ADDRESS_LOOKUP_TOKEN=<token>` (kun server; aldrig `NEXT_PUBLIC_`)
3. Henrik tester på staging. Derefter samme tre variabler i **Production**.

**Indtil da forbliver prod på `ADDRESS_LOOKUP_ENABLED=false`.**

**Når KDS åbner brugerregistrering:** registrér projektet og udskift `ADDRESS_LOOKUP_TOKEN`. Ingen kodeændring.
