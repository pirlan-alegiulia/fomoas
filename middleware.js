// Rendering lato server per crawler e agenti IA: fomoas e' una SPA React
// puramente client-side, quindi un fetch HTTP semplice (senza esecuzione
// JS) vede solo un <div id="root"></div> vuoto. Questo middleware
// intercetta le richieste di bot/crawler/agenti IA noti e restituisce
// direttamente HTML con i dati reali (letti live da Supabase), cosi il
// sito resta consultabile anche da chi non esegue JavaScript.
// Gli utenti umani (browser) non passano da qui: ricevono la SPA normale.

import { esc, fmtData, prezzoLabel, buildEventJsonLd } from "./lib/eventoSchema.js";

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
    const html = match ? await renderEventPage(match[1], siteUrl) : await renderHomePage(siteUrl);
    if (!html) return;
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
      <h2><a href="${siteUrl}/evento/${e.id}">${esc(e.titolo)}</a></h2>
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

async function renderEventPage(id, siteUrl) {
  const eventi = await supabaseFetch(`select=*&id=eq.${encodeURIComponent(id)}&verificato=eq.true`);
  const e = eventi?.[0];
  if (!e) return null;

  const jsonLd = buildEventJsonLd(e, siteUrl);

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(e.titolo)} — ${esc(e.luogo)} — fomoas</title>
<meta name="description" content="${esc(e.descrizione || `${e.titolo} a ${e.luogo} il ${fmtData(e.data)}.`)}" />
<link rel="canonical" href="${siteUrl}/evento/${e.id}" />
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
