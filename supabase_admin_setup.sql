-- Esegui questo script nell'SQL Editor di Supabase DOPO aver gia eseguito supabase_setup.sql
-- Aggiorna le regole di sicurezza per introdurre il pannello admin

-- 1. Rimuovi la vecchia policy che permetteva a chiunque di modificare un evento
--    (serviva solo per il contatore delle segnalazioni, ora sostituita da una funzione dedicata)
drop policy if exists "Chiunque puo segnalare un evento" on eventi;

-- 2. Funzione sicura per segnalare un evento: incrementa SOLO il contatore reports,
--    senza dare accesso di scrittura diretto alla tabella
create or replace function segnala_evento(event_id uuid)
returns void
language sql
security definer
as $$
  update eventi set reports = reports + 1 where id = event_id;
$$;

-- Permetti a chiunque (anche non autenticato) di chiamare questa funzione
grant execute on function segnala_evento(uuid) to anon, authenticated;

-- 3. Solo un utente autenticato (l'admin) puo modificare un evento
--    (es. per attivare il badge "verificato")
create policy "Solo admin puo modificare un evento"
  on eventi for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. Solo un utente autenticato (l'admin) puo eliminare un evento
create policy "Solo admin puo eliminare un evento"
  on eventi for delete
  using (auth.role() = 'authenticated');
