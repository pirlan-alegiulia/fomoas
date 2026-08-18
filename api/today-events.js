// Feed JSON pubblico e leggero per crawler/agenti IA: restituisce gli
// eventi verificati di oggi (o della data indicata) in formato pulito,
// senza alcun componente UI. Pensato per essere letto direttamente da
// un bot senza dover eseguire JavaScript o interpretare l'HTML del sito.
//
// GET /api/today-events.json            -> eventi di oggi
// GET /api/today-events.json?giorno=YYYY-MM-DD -> eventi di quel giorno
// GET /api/today-events.json?prossimi=1  -> tutti gli eventi verificati da oggi in poi

import { createClient } from "@supabase/supabase-js";
import { dateSchema, prezzoLabel } from "../lib/eventoSchema.js";
import { slugEvento } from "../lib/slug.js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

function oggiISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");

  const siteUrl = `https://${req.headers.host}`;
  const giorno = typeof req.query.giorno === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.giorno) ? req.query.giorno : oggiISO();
  const prossimi = req.query.prossimi === "1";

  let query = supabase.from("eventi").select("*").eq("verificato", true).order("data", { ascending: true }).order("ora", { ascending: true });
  query = prossimi ? query.gte("data", oggiISO()) : query.eq("data", giorno);

  const { data: eventi, error } = await query;
  if (error) {
    res.status(500).json({ errore: "Impossibile leggere gli eventi." });
    return;
  }

  const payload = {
    sito: siteUrl,
    aggiornato_il: new Date().toISOString(),
    filtro: prossimi ? "prossimi eventi da oggi in poi" : `eventi del ${giorno}`,
    totale: eventi.length,
    eventi: eventi.map((e) => {
      const { startDate, endDate } = dateSchema(e);
      return {
        id: e.id,
        url: `${siteUrl}/evento/${slugEvento(e)}`,
        titolo: e.titolo,
        categoria: e.categoria,
        data: e.data,
        ora: e.ora,
        inizio: startDate,
        fine_stimata: endDate,
        luogo: e.luogo,
        coordinate: Number.isFinite(e.luogo_lat) && Number.isFinite(e.luogo_lng) ? { lat: e.luogo_lat, lng: e.luogo_lng } : null,
        descrizione: e.descrizione || null,
        gratuito: !!e.gratuito,
        prezzo: e.gratuito ? 0 : Number(e.prezzo ?? 0),
        valuta: "EUR",
        prezzo_label: prezzoLabel(e),
        organizzatore: e.organizzatore,
        link_verifica: e.link_verifica,
        immagine: e.immagine_url || null,
      };
    }),
  };

  res.status(200).json(payload);
}
