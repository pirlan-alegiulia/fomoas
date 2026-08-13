// Genera una bozza di descrizione per un evento tramite l'API di Claude.
// Endpoint: POST /api/genera-descrizione

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

  const { titolo, categoria, luogo, data, organizzatore, bozza } = req.body || {};

  if (!titolo || !luogo) {
    res.status(400).json({ error: "Servono almeno titolo e luogo dell'evento." });
    return;
  }

  const dettagli = [
    `Titolo: ${titolo}`,
    categoria && `Categoria: ${categoria}`,
    `Luogo: ${luogo}`,
    data && `Data: ${data}`,
    organizzatore && `Organizzato da: ${organizzatore}`,
  ]
    .filter(Boolean)
    .join("\n");

  const bozzaPulita = (bozza || "").trim();
  const userContent = bozzaPulita
    ? `L'organizzatore ha scritto questa bozza di descrizione:\n"""${bozzaPulita}"""\n\n` +
      `Elaborala e migliorala (stile, chiarezza, lunghezza) mantenendo il suo contenuto e intento originali, ` +
      `senza inventare dettagli che non ha scritto. Dettagli evento:\n${dettagli}`
    : `Scrivi la descrizione per questo evento:\n${dettagli}`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system:
        "Scrivi o migliori brevi descrizioni promozionali in italiano per eventi locali (sagre, concerti, mercatini...) " +
        "pubblicati su una bacheca di quartiere. Tono caldo e invitante ma sobrio, senza esagerazioni da marketing " +
        "aggressivo, senza emoji, senza hashtag. Massimo 2-3 frasi. Se ricevi una bozza scritta dall'organizzatore, " +
        "elaborala e migliorala mantenendo il suo contenuto e intento, senza stravolgerla o inventare dettagli che " +
        "non ha scritto. Rispondi SOLO con il testo della descrizione finale, senza titoli, virgolette o premesse.",
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const testo = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!testo) {
      res.status(502).json({ error: "Nessun testo generato." });
      return;
    }

    res.status(200).json({ descrizione: testo });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella generazione." });
  }
}
