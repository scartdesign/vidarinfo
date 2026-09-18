# VIDAR Info

VIDAR Info je informativni zdravstveni navigator koji objedinjuje zdravstvene teme, informacije o lekovima/preparatima, prirodne pristupe i mrežne tvrdnje.

## Produkcija
- 248 zdravstvenih tema
- 215 lekova i preparata
- 197 prirodnih pristupa / mrežnih tvrdnji
- PWA podrška i update mehanizam
- odvojene JSON baze u `/data`
- Vercel production konfiguracija
- pripremljena Supabase migracija

Produkcioni URL:
https://vidar-info-office-5450s-projects.vercel.app

## Struktura
- `index.html` — aplikacija
- `data/topics.json` — zdravstvene teme
- `data/meds.json` — lekovi i preparati
- `data/naturals.json` — prirodni pristupi i mrežne tvrdnje
- `manifest.webmanifest`, `sw.js` — PWA
- `vercel.json` — cache/deploy pravila
- `privacy.html`, `terms.html` — privatnost i medicinski disclaimer
- `supabase/migrations/001_init.sql` — budući backend sadržaja

## Privatnost i medicinska bezbednost
VIDAR ne postavlja dijagnozu, ne bira terapiju i ne propisuje lekove. Ne čuva korisničke zdravstvene upite, istoriju pretrage ili sačuvane teme server-side u trenutnoj verziji.

Informacije o konkretnim lekovima treba proveriti prema zvaničnom uputstvu i ALIMS registru.

## Supabase
Frontend trenutno radi bez Supabase zavisnosti. Novi Supabase projekat nije kreiran jer nalog trenutno dostiže limit aktivnih free projekata. Migracija je spremna za primenu čim se oslobodi slot.

Build: **2026.09.18-prod-5**


## Pretraga
Pretraga koristi tematsko sidro za jasne upite (npr. „prirodni lek za sinuse“) kako bi rezultati ostali vezani za odgovarajuću zdravstvenu temu. Prirodni rezultati dodatno uzimaju u obzir nivo dokaza i bezbednosni status, bez skrivanja rizičnih trendova kada su direktno traženi.
