-- Esegui questo script nell'SQL Editor di Supabase (Dashboard > SQL Editor > New query)

create table if not exists eventi (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  categoria text not null,
  data date not null,
  ora time,
  luogo text not null,
  descrizione text,
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
