// Pagina del singolo evento (/evento/:id).
// Prima esisteva solo per i crawler: chi ci arrivava da Google o da un link
// condiviso riceveva la homepage, perche' l'app non gestiva questa rotta.

import { useState, useEffect } from "react";
import {
  MapPin,
  Calendar,
  Clock,
  Link as LinkIcon,
  ShieldCheck,
  ArrowLeft,
  Navigation,
  Share2,
  Check,
  Ticket,
  User,
  Download,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import PannelloSocial from "./PannelloSocial";
import { slugEvento, slugifica, leggiSlug, eUnCodice } from "../lib/slug.js";
import {
  categoryStyle,
  titleCase,
  googleMapsUrl,
  indicazioniUrl,
  staticMapUrl,
  dataEstesa,
  SFONDO_SITO,
} from "./eventoStile";

// L'indirizzo puo' essere lo slug leggibile oppure il vecchio codice.
// Dallo slug si ricava la data, si chiedono i pochi eventi di quel giorno e
// si sceglie quello col titolo corrispondente: cosi non serve una colonna
// dedicata sul database.
async function cercaEvento(param) {
  if (eUnCodice(param)) {
    const { data } = await supabase.from("eventi").select("*").eq("id", param).maybeSingle();
    return data || null;
  }
  const pezzi = leggiSlug(param);
  if (!pezzi) return null;
  const { data } = await supabase.from("eventi").select("*").eq("data", pezzi.data);
  if (!data?.length) return null;
  return data.find((e) => slugifica(e.titolo) === pezzi.titolo) || null;
}

export default function EventPage({ id }) {
  const [evento, setEvento] = useState(null);
  const [stato, setStato] = useState("caricamento");
  const [copiato, setCopiato] = useState(false);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const trovato = await cercaEvento(id);
      if (annullato) return;
      if (!trovato) {
        setStato("mancante");
        return;
      }
      setEvento(trovato);
      setStato("ok");
      document.title = `${trovato.titolo} — ${trovato.luogo} — fomoas`;

      // Vecchio indirizzo col solo codice: lo sostituiamo con quello
      // leggibile senza ricaricare, cosi chi condivide copia la versione
      // buona e i link gia' in giro continuano a funzionare.
      if (eUnCodice(id)) {
        window.history.replaceState(null, "", `/evento/${slugEvento(trovato)}`);
      }
    })();
    return () => {
      annullato = true;
    };
  }, [id]);

  async function condividi() {
    const url = window.location.href;
    // Su telefono apriamo il pannello di condivisione del sistema; altrove
    // copiamo il link, che e' l'unica cosa sensata su desktop.
    if (navigator.share) {
      try {
        await navigator.share({ title: evento.titolo, url });
        return;
      } catch {
        // condivisione annullata dall'utente: nessun errore da mostrare
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      // niente permessi sugli appunti: meglio non fare nulla che rompere
    }
  }

  if (stato === "caricamento") {
    return (
      <div className="min-h-screen text-white flex items-center justify-center" style={SFONDO_SITO}>
        <p className="text-sm text-white/85">Caricamento evento...</p>
      </div>
    );
  }

  if (stato === "mancante") {
    return (
      <div className="min-h-screen text-white flex items-center justify-center px-5" style={SFONDO_SITO}>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">Questo evento non c'e' piu'</h1>
          <p className="text-sm text-white/85 mb-6 max-w-sm mx-auto">
            Puo' essere stato rimosso dall'organizzatore, oppure e' gia' passato: gli eventi scaduti spariscono
            da soli.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-white text-[#2F63D4] font-bold rounded-xl px-5 py-3 text-sm hover:bg-[#EAF1FF] transition-colors"
          >
            <ArrowLeft size={16} /> Vedi tutti gli eventi
          </a>
        </div>
      </div>
    );
  }

  const style = categoryStyle(evento.categoria);
  const CategoryIcon = style.icon;
  const mappa = staticMapUrl(evento.luogo_lat, evento.luogo_lng);

  return (
    <div className="min-h-screen text-white" style={SFONDO_SITO}>
      <header className="px-5 py-5 sm:px-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold hover:underline">
          <ArrowLeft size={16} /> Tutti gli eventi
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 pb-16">
        <article className="bg-[#2F63D4] rounded-2xl overflow-hidden shadow-xl">
          <div className="relative h-56 sm:h-72">
            {evento.immagine_url ? (
              <img
                src={evento.immagine_url}
                alt={evento.titolo}
                className="w-full h-full object-cover"
                style={{ objectPosition: evento.immagine_posizione || "50% 50%" }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${style.from}, ${style.to})` }}
              >
                <CategoryIcon size={72} strokeWidth={1.5} className="text-white/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="absolute top-4 left-4 flex items-center gap-1.5">
              <span
                className="font-data text-[10px] tracking-wider uppercase text-white px-2.5 py-1 rounded-full font-semibold"
                style={{ backgroundColor: style.accent }}
              >
                {evento.categoria}
              </span>
              <span className="font-data text-[10px] tracking-wider uppercase bg-white text-[#4F5FEF] px-2.5 py-1 rounded-full font-semibold">
                {evento.gratuito ? "Gratuito" : `€ ${Number(evento.prezzo).toFixed(2)}`}
              </span>
            </div>
            {evento.verificato && (
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-[10px] bg-white/95 text-[#0A8A3B] font-semibold px-2.5 py-1 rounded-full">
                <ShieldCheck size={12} /> Verificato
              </span>
            )}
          </div>

          <div className="p-6 sm:p-8">
            <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight mb-4">
              {titleCase(evento.titolo)}
            </h1>

            {!evento.verificato && (
              <p className="text-xs bg-white/15 border border-white/25 rounded-xl px-3.5 py-2.5 mb-5">
                Questo evento e' in attesa di verifica: non compare ancora nella bacheca pubblica.
              </p>
            )}

            <div className="space-y-2.5 text-sm mb-6">
              <p className="font-data flex items-start gap-2.5">
                <Calendar size={16} className="mt-0.5 shrink-0" />
                <span>
                  {dataEstesa(evento.data)}
                  {evento.ora && (
                    <span className="inline-flex items-center gap-1.5 ml-2">
                      <Clock size={14} /> {evento.ora}
                    </span>
                  )}
                </span>
              </p>
              <p className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                <a
                  href={googleMapsUrl(evento.luogo)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {evento.luogo}
                </a>
              </p>
              <p className="flex items-start gap-2.5">
                <Ticket size={16} className="mt-0.5 shrink-0" />
                <span>{evento.gratuito ? "Ingresso gratuito" : `Ingresso € ${Number(evento.prezzo).toFixed(2)}`}</span>
              </p>
              <p className="flex items-start gap-2.5">
                <User size={16} className="mt-0.5 shrink-0" />
                <span>Organizzato da {evento.organizzatore}</span>
              </p>
            </div>

            {evento.descrizione && (
              <p className="text-sm text-white/90 leading-relaxed mb-6 whitespace-pre-line">
                {evento.descrizione}
              </p>
            )}

            <div className="flex flex-wrap gap-2.5 mb-6">
              <a
                href={indicazioniUrl(evento.luogo)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-[#2F63D4] font-bold rounded-xl px-4 py-2.5 text-sm hover:bg-[#EAF1FF] transition-colors"
              >
                <Navigation size={15} /> Come arrivare
              </a>
              {evento.link_verifica && (
                <a
                  href={evento.link_verifica}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-white/15 border border-white/30 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/25 transition-colors"
                >
                  <LinkIcon size={15} /> Sito ufficiale
                </a>
              )}
              <button
                onClick={condividi}
                className="inline-flex items-center gap-2 bg-white/15 border border-white/30 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/25 transition-colors"
              >
                {copiato ? <Check size={15} /> : <Share2 size={15} />}
                {copiato ? "Link copiato" : "Condividi"}
              </button>
            </div>

            {mappa && (
              <a
                href={indicazioniUrl(evento.luogo)}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-white/25"
              >
                <img src={mappa} alt={`Mappa di ${evento.luogo}`} className="w-full h-56 object-cover" />
              </a>
            )}
          </div>
        </article>

        <PannelloSocial evento={evento} />

        <p className="text-center text-xs text-white/70 mt-6">
          Le informazioni sono fornite dall'organizzatore. Controlla la fonte prima di metterti in viaggio.
        </p>
      </main>
    </div>
  );
}
