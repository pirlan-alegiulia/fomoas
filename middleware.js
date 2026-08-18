// Rendering lato server per crawler e agenti IA: fomoas e' una SPA React
// puramente client-side, quindi un fetch HTTP semplice (senza esecuzione
// JS) vede solo un <div id="root"></div> vuoto. Questo middleware
// intercetta le richieste di bot/crawler/agenti IA noti e restituisce
// direttamente HTML con i dati reali (letti live da Supabase), cosi il
// sito resta consultabile anche da chi non esegue JavaScript.
// Gli utenti umani (browser) non passano da qui: ricevono la SPA normale.

import { esc, fmtData, prezzoLabel, buildEventJsonLd } from "./lib/eventoSchema.js";
import { slugEvento, slugifica, leggiSlug, eUnCodice } from "./lib/slug.js";

export const config = { matcher: ["/", "/evento/:path*"] };

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|skypeuripreview|linkedinbot|twitterbot|pinterest|redditbot|embedly|quora link preview|vkshare|baiduspider|yandex|duckduckbot|ia_archiver|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|perplexity-user|google-extended|googleother|applebot|amazonbot|bytespider|diffbot|ccbot|meta-externalagent|semrushbot|ahrefsbot|mj12bot|dotbot/i;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

export default async function middleware(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua) || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const url = new URL(request.url);
  const siteUrl = url.origin;

  try {
    const match = url.pathname.match(/^\/evento\/([^/]+)/);
    if (!match) {
      const html = await renderHomePage(siteUrl);
      if (!html) return;
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const evento = await trovaEvento(match[1]);
    if (!evento) return;

    // Vecchio indirizzo col solo codice: rimandiamo a quello leggibile con un
    // redirect permanente, cosi i motori trasferiscono li' quanto gia'
    // accumulato invece di indicizzare due pagine uguali.
    if (eUnCodice(match[1])) {
      return new Response(null, {
        status: 301,
        headers: { location: `${siteUrl}/evento/${slugEvento(evento)}` },
      });
    }

    const html = renderEventPage(evento, siteUrl);
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return;
  }
}

async function supabaseFetch(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/eventi?${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function renderHomePage(siteUrl) {
  const eventi = await supabaseFetch("select=*&verificato=eq.true&order=data.asc");
  if (!eventi) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: eventi.map((e, i) => ({
      ...buildEventJsonLd(e, siteUrl),
      position: i + 1,
    })),
  };

  const items = eventi
    .map(
      (e) => `
    <article>
      <h2><a href="${siteUrl}/evento/${slugEvento(e)}">${esc(e.titolo)}</a></h2>
      <p>${esc(fmtData(e.data))}${e.ora ? " · " + esc(e.ora) : ""} — ${esc(e.luogo)}</p>
      <p>${prezzoLabel(e)} · Categoria: ${esc(e.categoria)}</p>
      ${e.descrizione ? `<p>${esc(e.descrizione)}</p>` : ""}
      <p>Organizzato da ${esc(e.organizzatore)}. <a href="${esc(e.link_verifica)}">Fonte / link</a></p>
    </article>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>fomoas — Cosa si fa stasera? ${eventi.length} eventi in programma</title>
<meta name="description" content="fomoas è una bacheca di eventi locali in Italia: sagre, concerti, mercatini, sport e altro, aggiornata in tempo reale. ${eventi.length} eventi verificati attualmente in programma." />
<link rel="canonical" href="${siteUrl}/" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<h1>fomoas — Cosa si fa stasera?</h1>
<p>Bacheca di eventi locali aggiornata in tempo reale: sagre, concerti, mercatini, sport, arte e cultura. Ogni evento è verificato manualmente e viene rimosso automaticamente una volta passata la sua data.</p>
${items || "<p>Nessun evento verificato al momento.</p>"}
</body>
</html>`;
}

// Accetta sia lo slug leggibile sia il vecchio codice: dallo slug ricava la
// data, chiede i pochi eventi di quel giorno e sceglie quello col titolo
// corrispondente.
async function trovaEvento(param) {
  if (eUnCodice(param)) {
    const righe = await supabaseFetch(`select=*&id=eq.${encodeURIComponent(param)}&verificato=eq.true`);
    return righe?.[0] || null;
  }
  const pezzi = leggiSlug(param);
  if (!pezzi) return null;
  const righe = await supabaseFetch(`select=*&data=eq.${pezzi.data}&verificato=eq.true`);
  return righe?.find((e) => slugifica(e.titolo) === pezzi.titolo) || null;
}

function renderEventPage(e, siteUrl) {
  const jsonLd = buildEventJsonLd(e, siteUrl);

  // Riassunto per l'anteprima social: se manca la descrizione componiamo
  // comunque una frase con i dati che contano (quando, dove, quanto).
  const descrizioneSocial =
    e.descrizione ||
    `${fmtData(e.data)}${e.ora ? ` alle ${String(e.ora).slice(0, 5)}` : ""} a ${e.luogo}. ${prezzoLabel(e)}.`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(e.titolo)} — ${esc(e.luogo)} — fomoas</title>
<meta name="description" content="${esc(descrizioneSocial)}" />
<link rel="canonical" href="${siteUrl}/evento/${slugEvento(e)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="fomoas" />
<meta property="og:title" content="${esc(e.titolo)}" />
<meta property="og:description" content="${esc(descrizioneSocial)}" />
<meta property="og:url" content="${siteUrl}/evento/${slugEvento(e)}" />
<meta property="og:image" content="${siteUrl}/api/locandina?id=${e.id}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(e.titolo)}" />
<meta name="twitter:description" content="${esc(descrizioneSocial)}" />
<meta name="twitter:image" content="${siteUrl}/api/locandina?id=${e.id}" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<h1>${esc(e.titolo)}</h1>
<p>${esc(fmtData(e.data))}${e.ora ? " · " + esc(e.ora) : ""} — ${esc(e.luogo)}</p>
<p>${prezzoLabel(e)} · Categoria: ${esc(e.categoria)}</p>
${e.descrizione ? `<p>${esc(e.descrizione)}</p>` : ""}
<p>Organizzato da ${esc(e.organizzatore)}. <a href="${esc(e.link_verifica)}">Fonte / link</a></p>
<p><a href="${siteUrl}/">Vedi tutti gli eventi su fomoas</a></p>
</body>
</html>`;
}
