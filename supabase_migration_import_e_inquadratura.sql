-- Gia' applicata in produzione (migrazione "posizione_immagine_e_origine_evento").

-- Punto focale della foto: le card e la pagina evento ritagliano l'immagine
-- per riempire un riquadro, e senza questo il soggetto finiva spesso tagliato.
-- Il valore ha la forma di object-position CSS, es. "50% 30%".
alter table eventi add column if not exists immagine_posizione text default '50% 50%';

-- Distingue gli eventi importati dalla ricerca web da quelli inseriti dagli
-- organizzatori: servono a popolare la bacheca ma non sono segnalazioni
-- dirette, e vanno mostrati citando la fonte.
alter table eventi add column if not exists origine text default 'organizzatore';
