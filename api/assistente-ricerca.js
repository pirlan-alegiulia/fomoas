// Assistente IA per la ricerca eventi: risponde in linguaggio naturale e,
// quando serve, interroga il database tramite lo strumento "cerca_eventi".
// Endpoint: POST /api/assistente-ricerca

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const CERCA_EVENTI_TOOL = {
  name: "cerca_eventi",
  description:
    "Cerca eventi (feste, sagre, mercatini, concerti, ecc.) pubblicati e verificati su fomoas. " +
    "Usalo ogni volta che l'utente chiede consigli su cosa fare, anche in modo vago.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Parola chiave libera nel titolo o nella descrizione" },
      categoria: {
        type: "string",
        description: "Una tra: Musica, Sagra, Mercatino, Sport, Arte & Cultura, Famiglia, Nightlife, Altro",
      },
      luogo: { type: "string", description: "Nome della citta o del luogo in cui cercare" },
      data_da: { type: "string", description: "Data minima nel formato AAAA-MM-GG (incluso)" },
      data_a: { type: "string", description: "Data massima nel formato AAAA-MM-GG (incluso)" },
      solo_gratuiti: { type: "boolean", description: "true per mostrare solo eventi a ingresso gratuito" },
    },
  },
};

async function cercaEventi(args = {}) {
  let q = supabase.from("eventi").select("*").eq("verificato", true).order("data", { ascending: true }).limit(24);

  if (args.categoria) q = q.eq("categoria", args.categoria);
  if (args.luogo) q = q.ilike("luogo", `%${args.luogo}%`);
  if (args.data_da) q = q.gte("data", args.data_da);
  if (args.data_a) q = q.lte("data", args.data_a);
  if (args.solo_gratuiti === true) q = q.eq("gratuito", true);
  if (args.query) q = q.or(`titolo.ilike.%${args.query}%,descrizione.ilike.%${args.query}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

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

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Serve un array messages non vuoto." });
    return;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  let conversation = messages.map((m) => ({ role: m.role, content: m.content }));
  let foundEvents = [];
  let finalText = "";

  try {
    for (let i = 0; i < 3; i++) {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 500,
        output_config: { effort: "low" },
        system:
          `Sei l'assistente di ricerca di fomoas, una bacheca di eventi locali (sagre, concerti, mercatini, sport...). ` +
          `Oggi e il ${oggi}. Aiuti chi non sa bene cosa cercare: interpreta richieste vaghe (es. "qualcosa per stasera", ` +
          `"con i bambini", "gratis vicino a Modena") e usa SEMPRE lo strumento cerca_eventi prima di rispondere quando la ` +
          `domanda riguarda eventi, anche minimamente. Non inventare mai eventi che lo strumento non ha restituito. Se non ` +
          `trovi nulla di pertinente dillo chiaramente e suggerisci come ampliare la ricerca. Rispondi in italiano, breve e ` +
          `amichevole (massimo 3-4 frasi), senza elencare i dettagli di ogni evento uno per uno: la lista compare gia sotto ` +
          `alla chat, tu limitati a un commento generale.`,
        tools: [CERCA_EVENTI_TOOL],
        messages: conversation,
      });

      if (response.stop_reason === "tool_use") {
        const toolUse = response.content.find((b) => b.type === "tool_use");
        conversation.push({ role: "assistant", content: response.content });
        const risultati = await cercaEventi(toolUse.input);
        foundEvents = risultati;
        conversation.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(
                risultati.map((e) => ({
                  id: e.id,
                  titolo: e.titolo,
                  categoria: e.categoria,
                  data: e.data,
                  luogo: e.luogo,
                  gratuito: e.gratuito,
                  descrizione: e.descrizione,
                }))
              ),
            },
          ],
        });
        continue;
      }

      finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      break;
    }

    res.status(200).json({
      risposta: finalText || "Ecco cosa ho trovato per te.",
      eventi: foundEvents.map((e) => e.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella richiesta." });
  }
}
