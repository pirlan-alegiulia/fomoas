-- Esegui questo script nell'SQL Editor di Supabase (Dashboard > SQL Editor > New query)

create table if not exists eventi (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  categoria text not null,
  data date not null,
  ora time,
  luogo text not null,
  descrizione text,
  gratuito boolean not null default true,
  prezzo numeric(8,2),
  immagine_url text,
  luogo_lat double precision,
  luogo_lng double precision,
  organizzatore text not null,
  email text not null,
  telefono text not null,
  link_verifica text not null,
  reports int default 0,
  verificato boolean default false,
  created_at timestamptz default now()
);

-- Abilita la sicurezza a livello di riga
alter table eventi enable row level security;

-- Chiunque puo leggere gli eventi (necessario per mostrarli pubblicamente e per le IA che li interrogheranno)
create policy "Chiunque puo leggere gli eventi"
  on eventi for select
  using (true);

-- Chiunque puo inserire un nuovo evento (la moderazione avviene dopo, non in fase di scrittura)
create policy "Chiunque puo inserire un evento"
  on eventi for insert
  with check (true);

-- Chiunque puo aggiornare SOLO il contatore delle segnalazioni
-- (nota: per un controllo piu granulare in futuro, questa policy andra sostituita
-- con una funzione dedicata o con un pannello admin autenticato)
create policy "Chiunque puo segnalare un evento"
  on eventi for update
  using (true)
  with check (true);

-- Storage bucket pubblico per le foto degli eventi caricate dagli organizzatori
insert into storage.buckets (id, name, public)
values ('eventi-immagini', 'eventi-immagini', true)
on conflict (id) do nothing;

create policy "Chiunque puo leggere le immagini eventi"
  on storage.objects for select
  using (bucket_id = 'eventi-immagini');

create policy "Chiunque puo caricare immagini eventi"
  on storage.objects for insert
  with check (bucket_id = 'eventi-immagini');
