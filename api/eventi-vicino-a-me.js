// Cerca sul web eventi reali vicino a un luogo, per gli eventi non
// registrati su fomoas. Usa lo strumento di ricerca web di Claude.
// Endpoint: POST /api/eventi-vicino-a-me

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa POST." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata sul server." });
    return;
  }

  const { luogo } = req.body || {};
  if (!luogo || !luogo.trim()) {
    res.status(400).json({ error: "Serve un luogo." });
    return;
  }

  const oggi = new Date().toISOString().slice(0, 10);

  try {
    const message = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      system:
        `Oggi e il ${oggi}. Cerca sul web eventi reali, attuali o futuri (sagre, concerti, mercatini, sport, mostre, ` +
        `vita notturna...) vicino al luogo indicato dall'utente, usando fonti come pagine di comuni/pro loco, giornali ` +
        `locali, pagine social pubbliche o siti di eventi. Non inventare mai eventi che non hai trovato con la ricerca. ` +
        `Quando hai finito di cercare, rispondi SOLO con un array JSON valido (nessun testo prima o dopo, nessun blocco ` +
        `di codice), con al massimo 8 eventi, ciascuno con questa forma esatta: ` +
        `{"titolo": string, "data": string leggibile es. "15 settembre 2026" o "info non trovata", "luogo": string, ` +
        `"descrizione": string breve (max 20 parole), "fonte": string url della pagina dove l'hai trovato}. ` +
        `Se non trovi nulla di pertinente e verificabile, rispondi con un array vuoto [].`,
      messages: [
        {
          role: "user",
          content: `Trova eventi vicino a: ${luogo}`,
        },
      ],
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

    res.status(200).json({ eventi: eventi.slice(0, 8), luogo });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella ricerca." });
  }
}
