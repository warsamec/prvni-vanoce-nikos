# Nikoskův wishlist (Netlify + Resend + volitelně Supabase)

## Rychlý start
1) `npm i`
2) `npm run dev` (lokálně)
3) Na Netlify: Build command `npm run build`, Publish dir `dist`.

## Subdoména u Wedosu
V DNS přidejte CNAME:
```
prvni-vanoce-nikos  CNAME  <vaše-site>.netlify.app
```

## Resend – odesílání e-mailů (bez soukromého Gmailu)
1) Na https://resend.com ověřte doménu `varsamis.cz` (SPF + DKIM TXT záznamy).
2) V Netlify nastavte env vars:
```
RESEND_API_KEY=...
SENDER_EMAIL="Nikoskův seznam <noreply@varsamis.cz>"
SITE_URL=https://prvni-vanoce-nikos.varsamis.cz/
```
3) Funkce: `/.netlify/functions/send-confirmation` posílá potvrzovací e-mail s odkazem `#confirm=TOKEN`.

## Supabase (sdílená data napříč zařízeními) – volitelné
- Vytvořte tabulku dle `supabase.sql`.
- Do Netlify (Site → Build & Deploy → Environment) zadejte:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
- Po nasazení appka čte a zapisuje položky přes Supabase REST.

## Bezpečnost
- Pro ostrý provoz doporučuji zapnout RLS v Supabase a update dárků provádět přes serverless funkci s service key (nebo Edge Function).
- V této jednoduché verzi klient zapisuje přímo (praktické pro soukromý rodinný seznam).

## Struktura
- `src/App.jsx` – hlavní aplikace (pending/confirmed + token v URL)
- `netlify/functions/send-confirmation.js` – Resend e-mail
- `supabase.sql` – tabulka dárků

## SQL tabulka
Viz `supabase.sql`.
