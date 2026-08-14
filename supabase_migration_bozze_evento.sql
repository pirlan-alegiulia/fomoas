-- Gia' applicata in produzione (migrazione "eventi_in_attesa_conferma_email").
-- Bozze degli eventi compilati da chi non era ancora autenticato.
-- Servono perche' il click sul link di conferma nell'email avviene spesso
-- in un browser diverso (app di posta, altro dispositivo): tenere i dati
-- nel localStorage del browser di partenza li rendeva irraggiungibili.

create table if not exists eventi_in_attesa (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  dati jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists eventi_in_attesa_email_idx on eventi_in_attesa (lower(email));

alter table eventi_in_attesa enable row level security;

-- Chiunque puo depositare una bozza (non e' ancora un evento pubblico:
-- resta invisibile finche' non viene confermata e poi approvata).
drop policy if exists "Chiunque puo depositare una bozza" on eventi_in_attesa;
create policy "Chiunque puo depositare una bozza"
  on eventi_in_attesa for insert
  with check (true);

-- Ma solo chi ha dimostrato di possedere quell'indirizzo (cliccando il link
-- ricevuto via email) puo rileggerla e trasformarla in evento vero.
drop policy if exists "Solo il proprietario email puo leggere la bozza" on eventi_in_attesa;
create policy "Solo il proprietario email puo leggere la bozza"
  on eventi_in_attesa for select
  to authenticated
  using (lower(email) = lower(auth.email()));

drop policy if exists "Solo il proprietario email puo eliminare la bozza" on eventi_in_attesa;
create policy "Solo il proprietario email puo eliminare la bozza"
  on eventi_in_attesa for delete
  to authenticated
  using (lower(email) = lower(auth.email()));

-- Le bozze mai confermate scadono dopo 7 giorni
select cron.schedule(
  'cancella-bozze-scadute',
  '30 3 * * *',
  $$ delete from eventi_in_attesa where created_at < now() - interval '7 days' $$
);
