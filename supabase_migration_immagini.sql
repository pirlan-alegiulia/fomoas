-- Esegui questo script nell'SQL Editor di Supabase (Dashboard > SQL Editor > New query)
-- Aggiunge il supporto immagine evento (upload utente + coordinate per la mappa
-- di fallback) alla tabella eventi gia esistente in produzione.

alter table eventi
  add column if not exists immagine_url text,
  add column if not exists luogo_lat double precision,
  add column if not exists luogo_lng double precision;

insert into storage.buckets (id, name, public)
values ('eventi-immagini', 'eventi-immagini', true)
on conflict (id) do nothing;

create policy "Chiunque puo leggere le immagini eventi"
  on storage.objects for select
  using (bucket_id = 'eventi-immagini');

create policy "Chiunque puo caricare immagini eventi"
  on storage.objects for insert
  with check (bucket_id = 'eventi-immagini');
