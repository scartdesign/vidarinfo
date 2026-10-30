# VIDAR — kontrola kvaliteta medicinskog sadržaja

**Audit: 30. oktobar 2026.** Ovaj dokument se odnosi na `main` stabilnu bazu od 248 tema, 215 lekova/preparata i 197 prirodnih pristupa. Ne opisuje nedovršene preview grane niti garantuje verziju trenutno serviranu na javnom domenu.

## Rezultati

- **248 / 215 / 197** zapisa u tri kataloga.
- **0** duplih ID-jeva u katalozima i **0** nepostojećih veza `naturals[].topics`.
- **369** unosa izvora na temama. URL format je proverljiv automatski, ali **dostupnost i medicinska relevantnost stranica nisu proverene**.
- **132 od 197** prirodnih unosa nema direktan `evidenceHref`. To ne dokazuje da je sadržaj netačan, ali otežava proveru tvrdnji.
- **5** tema sadrži ponovljen URL izvora u okviru iste teme (editorial warning).
- **1** ID (`pčelinji-polen`) sadrži kombinovani Unicode karakter i nije standardni ASCII slug. Ne preimenovati bez migracije lokalnih referenci, pretrage i deljivih linkova.
- Statusi prirodnih pristupa: **12 supported**, **134 limited**, **39 none**, **12 avoid**. Statusi su uredničke oznake; nisu dokaz o kvalitetu konkretne reference.

## Automatska validacija

`node scripts/validate-data.mjs` ostaje provera stabilnog runtime-a, verzija, broja zapisa i JavaScript sintakse. Novi `node scripts/validate-content.mjs` dodatno proverava:

1. Jedinstvenost ID-jeva i obavezna polja svih kataloga.
2. Postojanje minimalnih sadržaja o simptomima, samopomoći i signalima za lekara / hitnu pomoć.
3. HTTPS oblik linkova izvora i povezanih trendova (bez mrežne provere da li su stranice žive).
4. Veze prirodnih pristupa ka postojećim temama, nivo dokaza i osnovna bezbednosna upozorenja.
5. Uredničke upozoravajuće stavke bez blokiranja release-a za postojeće nedostatke referenci.

## Urednički red rada pre sledećeg velikog izdanja

1. **Prioritet:** prirodni preparati i viralni trendovi sa statusom `avoid`, uz proveru svake bezbednosne tvrdnje i upozorenja o interakcijama.
2. Dopuniti svih 132 zapisa konkretnim medicinskim ili zvaničnim izvorom, bez automatskog dodeljivanja pogrešnih referenci. Ciljati pojedinačni izvor koji zaista podržava konkretan navod.
3. Za lekove proveravati aktuelna uputstva i status na **ALIMS**; tekst VIDAR-a nije osnov za izbor, doziranje ili prekid terapije.
4. Zameniti generičke početne stranice institucija direktnim dokumentima ili smernicama i proveriti datum / relevantnost sadržaja.
5. Ukloniti 5 dupliranih izvora uz očuvanje korisnih opisa; ako se menjaju ID-jevi, prethodno planirati migraciju.
6. Svako proširenje i svaka promena ugrađenog sadržaja u `index.html` mora biti usklađena sa JSON bazama, PWA kešom i testovima, testirana u preview-u pre produkcije.

**VAŽNO:** Ovaj audit obuhvata integritet strukture, a ne nezavisnu kliničku recenziju. Sadržaj ne daje dijagnozu ni terapiju. Ne promovirati ovu verziju kao medicinski recenziranu bez dokumentovanog stručnog pregleda.
