# Teknisk beslutningsnote — stemmetransport for ELTA AI-receptionist

Status: **note til arkitektur-review (2026-11-16)**. Intet er ændret hos nogen udbyder, intet nummer er flyttet, Nila er
uændret og fortsat den live receptionist.

## Fakta (som oplyst af Henrik 2026-11-16 — ikke selvstændigt verificeret her)
1. **Relatel understøtter ikke SIP trunking** (Relatels egen aktuelle dokumentation).
2. **OpenAI's realtime-stemmeprodukt ("GPT-Live") understøtter SIP**, inkl. SIP-endpoints i EU.
3. Derfor findes der **ingen direkte vej Relatel → OpenAI SIP**. Fase 1-runbookens variant A (Relatel → SIP-URI) er
   udgået.

## Krav til enhver fremtidig løsning
- ELTA's eksisterende numre bevares (kunder ringer det samme nummer som i dag).
- Forretningskontinuitet: en fejl i AI-kæden må aldrig give et tabt opkald — altid fallback til menneske/omstilling.
- Rollback samme dag uden deploy (routing-ændring), og Nila kan køre videre indtil cutover er bevist.
- ELTA CRM ejer al logik og tilstand. Stemmelaget er transport (lyd ind/ud) + tur-styring; samtalemotoren er den samme
  `runReceptionTurn` som tekst-simulatoren og web-chat bruger (fase 2).
- EU-dataresidens og databehandleraftaler; ingen permanent lydoptagelse som standard (beslutning 6).

## Muligheder (arkitekturniveau — ingen er valgt)

| | A. Viderestil Relatel-nummer til et eksternt AI/SIP-nummer | B. Flyt/host det relevante nummer hos en SIP-kapabel operatør | C. Certificeret mediebro, hvis Relatel senere tilbyder én |
|---|---|---|---|
| Mekanik | Relatel-hovednummeret beholdes; en routing-regel viderestiller (evt. kun visse tider/køer) til et nummer hos en SIP-kapabel operatør/bro, som afleverer opkaldet via SIP til AI-stemmelaget | Nummeret porteres (eller et nyt hovednummer oprettes) hos en operatør med SIP; Relatel bevares til øvrige numre/medarbejdere | Relatel leverer selv medie-/SIP-adgang; ingen ekstra operatør |
| Nummer bevares | Ja (Relatel ejer det stadig) | Ja ved portering — men porteringen er en irreversibel driftshandling med nedetidsrisiko | Ja |
| Rollback | Fjern viderestillingen i Relatel (minutter) | Re-portering (dage/uger) — reelt ingen hurtig rollback | Routing i Relatel |
| Opkaldsdata i CRM | Relatel-webhook (verificeret 2026-11-15) ser stadig det indgående opkald; AI-benet skal korreleres (tid/nummer, evt. SIP-header) | Opkaldshændelser skal komme fra den nye operatør → ny adapter; Relatel-webhooken dækker ikke længere hovednummeret | Som i dag |
| Ekstra led / omkostning | Ét ekstra viderestillingsben (minutpris, evt. CLI-bevarelse skal testes) | Ny operatørkontrakt, ny CTI-integration | Afhænger af Relatel |
| Risiko | Lav og reversibel; skal teste: bevares kaldende nummer (CLI), lydkvalitet, tilbage-omstilling til menneske | Høj (portering, ny integration, medarbejdertelefoni) | Ukendt tidshorisont |
| Egnet til | **Pilot og cutover** (samme dag frem og tilbage) | Kun hvis A viser sig teknisk umulig (fx CLI tabes) | Langsigtet, hvis det kommer |

**Anbefaling (til review, ikke en beslutning):** A som første pilot — et separat Relatel-testnummer viderestilles til en
SIP-kapabel bro i EU → stemmelag → `runReceptionTurn` på staging. Hovednummer og Nila røres ikke, før testnummer-piloten
er grøn (CLI bevaret, handoff tilbage til menneske virker, nødrute testet). B overvejes kun, hvis A ikke kan bevare
kaldende nummer eller omstilling.

## Åbne spørgsmål (skal afklares med udbydere — ikke foretaget her)
1. Bevarer Relatels viderestilling det oprindelige kaldende nummer (CLI) mod et eksternt nummer?
2. Kan opkaldet omstilles tilbage fra AI-benet til en Relatel-kø/medarbejder (handoff), og hvordan?
3. Hvilken SIP-kapabel bro/operatør (EU) og hvilken STT/TTS-/realtime-model — DPA og pris.
4. Korrelation mellem Relatel-hændelsen (call_uuid) og AI-benets opkald (til én henvendelse i CRM).
