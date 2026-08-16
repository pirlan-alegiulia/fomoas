-- Gia' applicate in produzione (migrazioni "evento_email_deve_coincidere_con_account"
-- e "evento_email_immutabile_anche_in_modifica").
--
-- Chiudono un buco: chiunque fosse autenticato poteva pubblicare un evento
-- indicando come contatto l'email di un'altra persona, che non veniva mai
-- verificata ne' avvisata. Ora l'email dell'evento deve coincidere con quella
-- dimostrata al momento dell'accesso. Chi vuole pubblicare a nome di un altro
-- indirizzo deve prima confermarlo, cioe' passare dal link ricevuto su quella
-- casella (il flusso delle bozze in eventi_in_attesa).
--
-- Il controllo sta qui e non solo nel browser perche' l'interfaccia si puo'
-- aggirare chiamando direttamente le API.

drop policy if exists "Utenti autenticati possono pubblicare un proprio evento" on eventi;
create policy "Utenti autenticati possono pubblicare un proprio evento"
  on eventi for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and policy_accettata_at is not null
    and lower(email) = lower(auth.email())
  );

-- Senza il vincolo anche in modifica, il blocco sull'inserimento si aggira in
-- due passaggi: pubblico con la mia email, poi la cambio con quella di un
-- altro. Il proprietario puo' modificare il proprio evento ma l'email deve
-- restare la sua; l'amministratore resta libero, perche' deve poter correggere
-- gli eventi altrui dal pannello di moderazione.

drop policy if exists "Proprietario o admin puo modificare un evento" on eventi;
create policy "Proprietario o admin puo modificare un evento"
  on eventi for update
  using (auth.uid() = user_id or is_admin())
  with check (
    is_admin()
    or (auth.uid() = user_id and lower(email) = lower(auth.email()))
  );
