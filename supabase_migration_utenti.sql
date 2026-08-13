-- Esegui questo script nell'SQL Editor di Supabase DOPO gli script precedenti.
-- Aggiunge: proprietario dell'evento, accettazione policy, distinzione admin/utente,
-- e cancellazione automatica degli eventi scaduti.

-- 1. Collega ogni evento a chi lo ha pubblicato
alter table eventi add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table eventi add column if not exists policy_accettata_at timestamptz;

-- 2. Tabella admin (separata dagli utenti normali, che ora possono autenticarsi anche loro)
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;

-- L'admin attuale (pannello /admin)
insert into admins (user_id)
values ('8fd23228-017b-4f62-8dd7-ec9adfee68a5')
on conflict (user_id) do nothing;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- 3. Nuove policy: per pubblicare bisogna essere autenticati e l'evento
--    deve appartenere a chi lo pubblica (con policy accettata)
drop policy if exists "Chiunque puo inserire un evento" on eventi;
create policy "Utenti autenticati possono pubblicare un proprio evento"
  on eventi for insert
  to authenticated
  with check (user_id = auth.uid() and policy_accettata_at is not null);

-- Solo il proprietario o l'admin puo modificare
drop policy if exists "Solo admin puo modificare un evento" on eventi;
create policy "Proprietario o admin puo modificare un evento"
  on eventi for update
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

-- Solo il proprietario o l'admin puo eliminare
drop policy if exists "Solo admin puo eliminare un evento" on eventi;
create policy "Proprietario o admin puo eliminare un evento"
  on eventi for delete
  using (auth.uid() = user_id or is_admin());

-- 4. Cancellazione automatica degli eventi scaduti (ogni notte alle 3:00 UTC)
create extension if not exists pg_cron;

select cron.schedule(
  'cancella-eventi-scaduti',
  '0 3 * * *',
  $$ delete from eventi where data < current_date $$
);
