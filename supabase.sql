create table if not exists public.gifts_registry (
  id text primary key,
  title text not null,
  link text,
  image text,
  priceCZK numeric,
  note text,
  reservation_status text check (reservation_status in ('pending','confirmed')) generated always as
    (case when reservation->>'status' is null then null else (reservation->>'status')::text end) stored,
  reservation jsonb
);

/* Pozn.: výše ukládáme celou rezervaci jako JSON (email, token, at).
   Pokud chcete mít status v samostatném sloupci, můžete ho udržovat triggerem. */
