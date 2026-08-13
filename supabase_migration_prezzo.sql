-- Esegui questo script nell'SQL Editor di Supabase (Dashboard > SQL Editor > New query)
-- Aggiunge il prezzo/gratuito alla tabella eventi gia esistente in produzione.

alter table eventi
  add column if not exists gratuito boolean not null default true,
  add column if not exists prezzo numeric(8,2);
