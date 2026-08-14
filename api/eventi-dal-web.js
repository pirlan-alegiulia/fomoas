// Cerca sul web eventi reali che NON sono pubblicati su fomoas, partendo dal
// testo libero scritto nella barra di ricerca. Servono a non lasciare mai
// l'utente a mani vuote: compaiono sempre DOPO gli eventi pubblicati, come
// suggerimenti non verificati da noi.
// Endpoint: POST /api/eventi-dal-web { richiesta, quanti?, escludi? }
// "escludi" e' la lista dei titoli gia' mostrati: serve al pulsante "Ancora",
// che chiede qualche proposta in piu' senza ripetere quelle gia' viste.

import Anthropic from "@anthropic-ai/sdk";

// maxRetries a zero: in caso di timeout l'SDK per impostazione predefinita
// riprova, e i tentativi sommati superavano il limite della funzione facendola
// troncare da Vercel con un 504. Qui un solo tentativo, poi si rinuncia
// pulitamente e l'interfaccia propone "Riprova" all'utente.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

const QUANTI_DEFAULT = 8;
const QUANTI_MAX = 8;
const MAX_RICHIESTA = 300;
const MAX_ESCLUSI = 40;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa POST." });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY non configurata sul server." });
    return;
  }

  const { richiesta, quanti, escludi } = req.body || {};
  if (typeof richiesta !== "string" || !richiesta.trim()) {
    res.status(400).json({ error: "Serve una richiesta." });
    return;
  }

  const quantiRichiesti = Number.isInteger(quanti) && quanti > 0 ? Math.min(quanti, QUANTI_MAX) : QUANTI_DEFAULT;
  const giaVisti = Array.isArray(escludi)
    ? escludi.filter((t) => typeof t === "string" && t.trim()).slice(0, MAX_ESCLUSI)
    : [];

  const oggi = new Date().toISOString().slice(0, 10);

  try {
    const message = await client.messages.create({
      // Sonnet invece di Opus: qui il compito e' cercare e riportare, non
      // ragionare. Opus impiegava anche oltre due minuti e la funzione
      // andava in timeout a meta' ricerca, lasciando l'utente senza nulla.
      model: "claude-sonnet-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      // Due ricerche soltanto: la priorita' e' che la risposta arrivi in
      // fretta. Con quattro si arrivava piu' spesso a otto risultati, ma le
      // attese superavano il minuto e a volte non arrivava nulla.
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
      system:
        `Oggi e il ${oggi}. Cerca sul web eventi reali in Italia (sagre, concerti, mercatini, sport, mostre, ` +
        `vita notturna, eventi per famiglie...) che corrispondano alla richiesta dell'utente, scritta in ` +
        `linguaggio naturale. Usa fonti attendibili: siti di comuni e pro loco, giornali locali, pagine social ` +
        `pubbliche, portali di eventi. Considera solo eventi la cui data e' oggi o nel futuro. Non inventare ` +
        `mai eventi che non hai trovato con la ricerca, e non riportare eventi di cui non hai una fonte. ` +
        `Ogni evento va elencato una volta sola: se lo trovi su piu' fonti o con nomi leggermente diversi, ` +
        `scegli la versione migliore e scarta le altre. ` +
        `Sii rapido: fai poche ricerche mirate e rispondi con quello che hai trovato, fino a un massimo di ` +
        `${quantiRichiesti} eventi. Non insistere per arrivare a ${quantiRichiesti} e non inventare mai nulla ` +
        `per riempire la lista: meglio pochi eventi veri consegnati in fretta che tanti dopo una lunga attesa. ` +
        (giaVisti.length
          ? `L'utente ha gia' visto questi eventi, quindi NON riproporli e cercane di diversi: ` +
            `${giaVisti.map((t) => `"${t}"`).join(", ")}. `
          : "") +
        `Quando hai finito, rispondi SOLO con un array JSON valido (nessun testo prima o dopo, nessun blocco ` +
        `di codice), con al massimo ${quantiRichiesti} eventi, ciascuno con questa forma esatta: ` +
        `{"titolo": string, "data": string leggibile es. "15 settembre 2026", "luogo": string (comune preciso), ` +
        `"descrizione": string breve (max 20 parole), "fonte": string url della pagina dove l'hai trovato}. ` +
        `Se non trovi nulla di pertinente e verificabile, rispondi con un array vuoto [].`,
      messages: [{ role: "user", content: richiesta.trim().slice(0, MAX_RICHIESTA) }],
    }, {
      // Tetto di tempo sotto il limite della funzione su Vercel (300s): se la
      // ricerca si dilunga preferiamo restituire un errore pulito, che
      // l'interfaccia sa mostrare con un "Riprova", invece di farci troncare
      // dal gateway con un 504 che al browser arriva come pagina HTML.
      timeout: 90_000,
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

    // Rete di sicurezza contro i doppioni: il modello a volte ripete lo stesso
    // evento due o tre volte nella stessa risposta (trovato su fonti diverse),
    // oltre a riproporre quelli gia' visti. Il confronto ignora maiuscole,
    // punteggiatura e parole di servizio, perche' lo stesso mercatino compare
    // come "Mercatino dell'Antiquariato di Lucca" o "Mercato Antiquario Lucca".
    const chiave = (t) =>
      String(t)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((p) => p && !["di", "del", "della", "dell", "de", "il", "la", "lo", "e"].includes(p))
        // Solo la radice di ogni parola: "mercatino"/"mercato" e
        // "antiquariato"/"antiquario"/"antiquaria" sono lo stesso evento.
        .map((p) => p.slice(0, 6))
        .sort()
        .join(" ");

    const visti = new Set(giaVisti.map(chiave));
    const nuovi = [];
    for (const e of eventi) {
      if (!e?.titolo) continue;
      const k = chiave(e.titolo);
      if (visti.has(k)) continue;
      visti.add(k);
      nuovi.push(e);
    }

    res.status(200).json({ eventi: nuovi.slice(0, quantiRichiesti) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella ricerca." });
  }
}
