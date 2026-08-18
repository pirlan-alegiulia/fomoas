// Genera la sitemap XML in tempo reale (homepage + una voce per ogni
// evento verificato), cosi i crawler scoprono anche i permalink /evento/:id.

import { createClient } from "@supabase/supabase-js";
import { slugEvento } from "../lib/slug.js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const siteUrl = `https://${req.headers.host}`;

  const { data: eventi } = await supabase
    .from("eventi")
    // titolo e data servono a comporre l'indirizzo leggibile: senza, lo slug
    // resta vuoto e si ripiega sul codice interno.
    .select("id, titolo, data, created_at")
    .eq("verificato", true);

  // La data della homepage segue l'ultimo evento pubblicato: e' quello che
  // ne cambia il contenuto, ed e' il segnale che dice ai motori quando vale
  // la pena ripassare.
  const ultimoAggiornamento = (eventi || [])
    .map((e) => e.created_at)
    .sort()
    .pop();
  const dataHome = new Date(ultimoAggiornamento || Date.now()).toISOString().slice(0, 10);

  const urls = [
    `<url><loc>${siteUrl}/</loc><lastmod>${dataHome}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    ...(eventi || []).map((e) => {
      const lastmod = new Date(e.created_at).toISOString().slice(0, 10);
      return `<url><loc>${siteUrl}/evento/${slugEvento(e)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq></url>`;
    }),
    `<url><loc>${siteUrl}/policy</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
  ].join("");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600");
  res.status(200).end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
}
