// Cerca sul web eventi reali che NON sono pubblicati su fomoas, partendo dal
// testo libero scritto nella barra di ricerca. Servono a non lasciare mai
// l'utente a mani vuote: compaiono sempre DOPO gli eventi pubblicati, come
// suggerimenti non verificati da noi.
// Endpoint: POST /api/eventi-dal-web { richiesta }

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUANTI = 8;
const MAX_RICHIESTA = 300;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa POST." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata sul server." });
    return;
  }

  const { richiesta } = req.body || {};
  if (typeof richiesta !== "string" || !richiesta.trim()) {
    res.status(400).json({ error: "Serve una richiesta." });
    return;
  }

  const oggi = new Date().toISOString().slice(0, 10);

  try {
    const message = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      system:
        `Oggi e il ${oggi}. Cerca sul web eventi reali in Italia (sagre, concerti, mercatini, sport, mostre, ` +
        `vita notturna, eventi per famiglie...) che corrispondano alla richiesta dell'utente, scritta in ` +
        `linguaggio naturale. Usa fonti attendibili: siti di comuni e pro loco, giornali locali, pagine social ` +
        `pubbliche, portali di eventi. Considera solo eventi la cui data e' oggi o nel futuro. Non inventare ` +
        `mai eventi che non hai trovato con la ricerca, e non riportare eventi di cui non hai una fonte. ` +
        `Punta ad arrivare a ${QUANTI} eventi: se con la ricerca iniziale ne trovi meno, allarga ai comuni ` +
        `vicini o a un periodo un po' piu' ampio e cerca ancora. Meglio pochi eventi veri che riempire la ` +
        `lista: non inventare mai nulla pur di arrivare a ${QUANTI}. ` +
        `Quando hai finito, rispondi SOLO con un array JSON valido (nessun testo prima o dopo, nessun blocco ` +
        `di codice), con al massimo ${QUANTI} eventi, ciascuno con questa forma esatta: ` +
        `{"titolo": string, "data": string leggibile es. "15 settembre 2026", "luogo": string (comune preciso), ` +
        `"descrizione": string breve (max 20 parole), "fonte": string url della pagina dove l'hai trovato}. ` +
        `Se non trovi nulla di pertinente e verificabile, rispondi con un array vuoto [].`,
      messages: [{ role: "user", content: richiesta.trim().slice(0, MAX_RICHIESTA) }],
    });

    const testo = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let eventi = [];
    try {
      const start = testo.indexOf("[");
      const end = testo.lastIndexOf("]");
      eventi = start !== -1 && end !== -1 ? JSON.parse(testo.slice(start, end + 1)) : [];
      if (!Array.isArray(eventi)) eventi = [];
    } catch {
      eventi = [];
    }

    res.status(200).json({ eventi: eventi.slice(0, QUANTI) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella ricerca." });
  }
}
