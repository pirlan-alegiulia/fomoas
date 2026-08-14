// Risponde a domande veloci su un singolo evento ("a che ora inizia?",
// "si paga?", "c'e' parcheggio?") usando solo i dati che fomoas possiede.
// Endpoint: POST /api/domanda-evento { eventoId, domanda }
//
// I dati dell'evento vengono letti dal database lato server e non presi da
// quello che manda il browser: cosi nessuno puo' far rispondere l'IA su
// contenuti inventati. Usa Haiku, il modello piu' economico: la domanda e'
// semplice e questo endpoint puo' essere chiamato molto spesso.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const MAX_DOMANDA = 200;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa POST." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata sul server." });
    return;
  }

  const { eventoId, domanda } = req.body || {};
  if (!eventoId || typeof domanda !== "string" || !domanda.trim()) {
    res.status(400).json({ error: "Servono eventoId e domanda." });
    return;
  }

  const { data: e } = await supabase
    .from("eventi")
    .select("titolo, categoria, data, ora, luogo, descrizione, gratuito, prezzo, organizzatore, link_verifica")
    .eq("id", eventoId)
    .eq("verificato", true)
    .single();
  if (!e) {
    res.status(404).json({ error: "Evento non trovato." });
    return;
  }

  const schedaEvento = [
    `Titolo: ${e.titolo}`,
    `Categoria: ${e.categoria}`,
    `Data: ${e.data}`,
    `Orario di inizio: ${e.ora || "non indicato"}`,
    `Luogo: ${e.luogo}`,
    `Ingresso: ${e.gratuito ? "gratuito" : `a pagamento, ${Number(e.prezzo).toFixed(2)} €`}`,
    `Organizzatore: ${e.organizzatore}`,
    `Link della fonte: ${e.link_verifica}`,
    `Descrizione: ${e.descrizione || "non disponibile"}`,
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system:
        `Rispondi a una domanda su questo evento pubblicato su fomoas, usando SOLO le informazioni qui sotto.\n\n` +
        `${schedaEvento}\n\n` +
        `Regole: rispondi in italiano, massimo due frasi, tono cordiale e diretto. Se l'informazione ` +
        `richiesta non c'e' tra i dati (per esempio parcheggio, accessibilita', menu, meteo, se serve ` +
        `prenotare), dillo con chiarezza in una frase e invita a controllare il link della fonte o a ` +
        `contattare l'organizzatore. Non inventare mai dettagli e non fare supposizioni: meglio ` +
        `ammettere che il dato non c'e'.`,
      messages: [{ role: "user", content: domanda.trim().slice(0, MAX_DOMANDA) }],
    });

    const risposta = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    res.status(200).json({ risposta });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella richiesta." });
  }
}
