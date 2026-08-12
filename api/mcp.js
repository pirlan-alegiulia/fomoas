// Server MCP per fomoas — permette alle IA di interrogare direttamente gli eventi.
// Endpoint raggiungibile su: https://fomoas.com/api/mcp
//
// Implementa un sottoinsieme del protocollo MCP (JSON-RPC 2.0) sufficiente per
// far scoprire ed eseguire lo strumento "cerca_eventi" a un client MCP.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const SERVER_INFO = { name: "fomoas-eventi", version: "1.0.0" };

const TOOLS = [
  {
    name: "cerca_eventi",
    description:
      "Cerca eventi (feste, sagre, mercatini, concerti, ecc.) pubblicati su fomoas. " +
      "Puoi filtrare per parola chiave, categoria, luogo e/o data. Restituisce solo " +
      "eventi verificati quando possibile, altrimenti tutti gli eventi corrispondenti.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Parola chiave libera da cercare nel titolo o nella descrizione dell'evento",
        },
        categoria: {
          type: "string",
          description:
            "Categoria dell'evento, una tra: Musica, Sagra, Mercatino, Sport, Arte & Cultura, Famiglia, Nightlife, Altro",
        },
        luogo: {
          type: "string",
          description: "Nome della citta o del luogo in cui cercare (es. 'Modena')",
        },
        data_da: {
          type: "string",
          description: "Data minima nel formato AAAA-MM-GG (incluso)",
        },
        data_a: {
          type: "string",
          description: "Data massima nel formato AAAA-MM-GG (incluso)",
        },
      },
    },
  },
];

async function cercaEventi(args = {}) {
  let q = supabase.from("eventi").select("*").order("data", { ascending: true }).limit(30);

  if (args.categoria) q = q.eq("categoria", args.categoria);
  if (args.luogo) q = q.ilike("luogo", `%${args.luogo}%`);
  if (args.data_da) q = q.gte("data", args.data_da);
  if (args.data_a) q = q.lte("data", args.data_a);
  if (args.query) q = q.or(`titolo.ilike.%${args.query}%,descrizione.ilike.%${args.query}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const risultati = (data || []).map((e) => ({
    titolo: e.titolo,
    categoria: e.categoria,
    data: e.data,
    ora: e.ora,
    luogo: e.luogo,
    descrizione: e.descrizione,
    verificato: e.verificato,
    fonte: e.link_verifica,
  }));

  return risultati;
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
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
    res.status(405).json({ error: "Usa POST per parlare con questo server MCP." });
    return;
  }

  const body = req.body || {};
  const { id, method, params } = body;

  try {
    if (method === "initialize") {
      res.status(200).json(
        jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        })
      );
      return;
    }

    if (method === "notifications/initialized") {
      res.status(202).end();
      return;
    }

    if (method === "tools/list") {
      res.status(200).json(jsonRpcResult(id, { tools: TOOLS }));
      return;
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName !== "cerca_eventi") {
        res.status(200).json(jsonRpcError(id, -32602, `Strumento sconosciuto: ${toolName}`));
        return;
      }

      const risultati = await cercaEventi(args);
      res.status(200).json(
        jsonRpcResult(id, {
          content: [
            {
              type: "text",
              text:
                risultati.length === 0
                  ? "Nessun evento trovato con questi criteri."
                  : JSON.stringify(risultati, null, 2),
            },
          ],
        })
      );
      return;
    }

    res.status(200).json(jsonRpcError(id, -32601, `Metodo non supportato: ${method}`));
  } catch (err) {
    res.status(200).json(jsonRpcError(id, -32000, err.message || "Errore interno"));
  }
}
