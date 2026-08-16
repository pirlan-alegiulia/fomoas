// Genera la locandina di un evento come immagine PNG, da condividere sui
// social. Due formati:
//   /api/locandina?id=<uuid>              1200x630, l'anteprima che Facebook
//                                          e WhatsApp mostrano sotto il link
//   /api/locandina?id=<uuid>&formato=post 1080x1350, il formato da postare
//                                          su Instagram (li' i link non hanno
//                                          anteprima: serve un'immagine vera)
//
// Usa React.createElement invece di JSX perche' questo file gira sul runtime
// edge di Vercel senza passare da un transpiler.

import { ImageResponse } from "@vercel/og";
import React from "react";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Stessi colori d'accento della bacheca, cosi la locandina e' riconoscibile
const ACCENTI = {
  Musica: "#8B5CF6",
  Sagra: "#F97316",
  Mercatino: "#059669",
  Sport: "#0284C7",
  "Arte & Cultura": "#DB2777",
  Famiglia: "#D97706",
  Nightlife: "#4F46E5",
  Altro: "#64748B",
};

const SFONDO = "linear-gradient(160deg, #FF8000 0%, #FFAA00 22%, #A6C8FF 55%, #4D8AFF 78%, #4F5FEF 100%)";

const h = React.createElement;

function dataEstesa(data) {
  try {
    return new Date(data).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return data;
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const formatoPost = url.searchParams.get("formato") === "post";

  if (!id || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("Serve il parametro id.", { status: 400 });
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eventi?select=titolo,categoria,data,ora,luogo,gratuito,prezzo,organizzatore,immagine_url&id=eq.${encodeURIComponent(id)}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const righe = res.ok ? await res.json() : [];
  const e = righe[0];
  if (!e) return new Response("Evento non trovato.", { status: 404 });

  const larghezza = formatoPost ? 1080 : 1200;
  const altezza = formatoPost ? 1350 : 630;
  const accento = ACCENTI[e.categoria] || ACCENTI.Altro;
  const prezzo = e.gratuito ? "Ingresso gratuito" : `Ingresso € ${Number(e.prezzo).toFixed(2)}`;
  // Il titolo si adatta: quelli lunghi rimpiccioliscono per non uscire dal riquadro
  const dimTitolo = formatoPost
    ? e.titolo.length > 40 ? 62 : 82
    : e.titolo.length > 40 ? 50 : 66;

  const riga = (testo, dim) =>
    h("div", { style: { display: "flex", fontSize: dim, color: "rgba(255,255,255,0.95)", marginBottom: 10 } }, testo);

  return new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundImage: SFONDO,
          padding: formatoPost ? 72 : 60,
          fontFamily: "sans-serif",
        },
      },
      // Intestazione: marchio e categoria
      h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        h(
          "div",
          { style: { display: "flex", fontSize: formatoPost ? 34 : 30, letterSpacing: 6, color: "rgba(255,255,255,0.9)", fontWeight: 700 } },
          "FOMOAS"
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              backgroundColor: accento,
              color: "white",
              fontSize: formatoPost ? 30 : 26,
              fontWeight: 700,
              padding: "10px 24px",
              borderRadius: 999,
              textTransform: "uppercase",
              letterSpacing: 2,
            },
          },
          e.categoria
        )
      ),

      // Corpo. Nel formato verticale occupa tutto lo spazio fra intestazione
      // e piede e si centra: senza questo il testo restava incollato a un
      // bordo lasciando meta' locandina vuota. Se l'evento ha una foto, la
      // foto sta sopra al testo e assorbe lo spazio in eccesso.
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexGrow: formatoPost ? 1 : 0,
            paddingTop: formatoPost ? 40 : 0,
            paddingBottom: formatoPost ? 40 : 0,
          },
        },
        formatoPost && e.immagine_url
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  height: 420,
                  marginBottom: 40,
                  borderRadius: 28,
                  overflow: "hidden",
                },
              },
              h("img", {
                src: e.immagine_url,
                style: { width: "100%", height: "100%", objectFit: "cover" },
              })
            )
          : null,
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: dimTitolo,
              fontWeight: 800,
              color: "white",
              lineHeight: 1.1,
              marginBottom: 28,
            },
          },
          e.titolo
        ),
        riga(`${dataEstesa(e.data)}${e.ora ? ` · ore ${String(e.ora).slice(0, 5)}` : ""}`, formatoPost ? 40 : 34),
        riga(e.luogo, formatoPost ? 36 : 30),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 18,
              backgroundColor: "white",
              color: "#4F5FEF",
              fontSize: formatoPost ? 34 : 28,
              fontWeight: 800,
              padding: "12px 28px",
              borderRadius: 16,
            },
          },
          prezzo
        )
      ),

      // Chiusura: organizzatore e invito
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: formatoPost ? 44 : 0,
          },
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column" } },
          h("div", { style: { display: "flex", fontSize: formatoPost ? 28 : 24, color: "rgba(255,255,255,0.8)" } }, "Organizzato da"),
          h("div", { style: { display: "flex", fontSize: formatoPost ? 34 : 28, color: "white", fontWeight: 700 } }, e.organizzatore)
        ),
        h(
          "div",
          { style: { display: "flex", fontSize: formatoPost ? 30 : 26, color: "rgba(255,255,255,0.9)", fontWeight: 700 } },
          "fomoas.com"
        )
      )
    ),
    {
      width: larghezza,
      height: altezza,
      headers: { "cache-control": "public, max-age=0, s-maxage=3600" },
    }
  );
}
