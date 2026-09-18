# Supabase

VIDAR trenutno radi bez Supabase zavisnosti: produkcioni sadržaj je u `/data/*.json`.

Kada novi Supabase projekat bude dostupan:
1. primeni `supabase/migrations/001_init.sql`;
2. importuj `data/topics.json`, `data/meds.json` i `data/naturals.json`;
3. frontend prebaci na public read API;
4. write pristup ostaje samo administratoru/service role.

## Privatnost
Ne čuvamo korisničke zdravstvene upite, istoriju pretrage ni sačuvane teme server-side. Sačuvano ostaje lokalno na uređaju dok se ne donese drugačija, pravno proverena odluka.
