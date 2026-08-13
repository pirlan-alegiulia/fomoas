// Cerca sul web eventi reali vicino a un luogo, per gli eventi non
// registrati su fomoas. Usa lo strumento di ricerca web di Claude per
// trovare i candidati, poi li geocodifica e li ordina per distanza reale
// (l'IA non puo' calcolare distanze precise in modo affidabile).
// Endpoint: POST /api/eventi-vicino-a-me { luogo, lat, lng, raggioKm? }

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

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

  const { luogo, lat, lng, raggioKm } = req.body || {};
  if (!luogo || !luogo.trim()) {
    res.status(400).json({ error: "Serve un luogo." });
    return;
  }
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const raggio = Number.isFinite(raggioKm) && raggioKm > 0 ? raggioKm : 50;

  try {
    // Prima passata veloce; se non trova nulla (capita, soprattutto per
    // paesi piccoli con poca presenza online) riprova una volta sola con
    // un budget di ricerca piu' ampio, invece di arrendersi subito.
    let eventi = await cercaEventiViaAI(luogo, raggio, 4);
    if (eventi.length === 0) {
      eventi = await cercaEventiViaAI(luogo, raggio, 8);
    }
    const candidati = eventi;

    if (hasCoords && MAPBOX_TOKEN && eventi.length > 0) {
      const arricchiti = await Promise.all(
        eventi.map(async (e) => {
          const coord = await geocode(e.luogo, MAPBOX_TOKEN);
          if (!coord) return null;
          const distanza_km = haversineKm(lat, lng, coord.lat, coord.lng);
          return { ...e, distanza_km: Math.round(distanza_km * 10) / 10 };
        })
      );
      const geocodificati = arricchiti.filter(Boolean);
      // Se la geocodifica fallisce per tutti (es. problema temporaneo con Mapbox),
      // meglio mostrare i candidati trovati dall'IA senza ordinamento che non
      // mostrare nulla.
      eventi =
        geocodificati.length > 0
          ? geocodificati.filter((e) => e.distanza_km <= raggio).sort((a, b) => a.distanza_km - b.distanza_km)
          : candidati;
    }

    res.status(200).json({ eventi, luogo });
  } catch (err) {
    res.status(500).json({ error: err.message || "Errore nella ricerca." });
  }
}

async function cercaEventiViaAI(luogo, raggio, maxUses) {
  const oggi = new Date().toISOString().slice(0, 10);
  const message = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 6000,
    output_config: { effort: "medium" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses }],
    system:
      `Oggi e il ${oggi}. Cerca sul web eventi reali, attuali o futuri (sagre, concerti, mercatini, sport, mostre, ` +
      `vita notturna...) entro circa ${raggio} km dal luogo indicato dall'utente, usando fonti come pagine di ` +
      `comuni/pro loco, giornali locali, pagine social pubbliche o siti di eventi. Non inventare mai eventi che ` +
      `non hai trovato con la ricerca. Includi nel campo "luogo" di ogni evento il nome del comune/paese preciso ` +
      `(non solo un quartiere generico), serve per calcolarne la distanza. Quando hai finito di cercare, rispondi ` +
      `SOLO con un array JSON valido (nessun testo prima o dopo, nessun blocco di codice), con al massimo 16 ` +
      `eventi, ciascuno con questa forma esatta: {"titolo": string, "data": string leggibile es. "15 settembre ` +
      `2026" o "info non trovata", "luogo": string (comune preciso), "descrizione": string breve (max 20 parole), ` +
      `"fonte": string url della pagina dove l'hai trovato}. Se non trovi nulla di pertinente e verificabile, ` +
      `rispondi con un array vuoto [].`,
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
  return eventi.slice(0, 16);
}

async function geocode(luogo, mapboxToken) {
  if (!luogo) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(luogo)}.json?access_token=${mapboxToken}&limit=1&country=it`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      console.error("Geocode fallito per", luogo, res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const [lngC, latC] = data.features?.[0]?.center || [];
    return Number.isFinite(latC) && Number.isFinite(lngC) ? { lat: latC, lng: lngC } : null;
  } catch (err) {
    console.error("Geocode errore per", luogo, err.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
