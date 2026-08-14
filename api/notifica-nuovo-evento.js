// Avvisa l'amministratore via email quando un nuovo evento viene pubblicato
// e resta in attesa di verifica, cosi non serve controllare /admin a intervalli.
// Chiamata (fire-and-forget) dal client subito dopo l'inserimento in eventi.
// Endpoint: POST /api/notifica-nuovo-evento { eventoId }

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Usa POST." });
    return;
  }
  if (!RESEND_API_KEY || !ADMIN_NOTIFICATION_EMAIL) {
    // Notifica non configurata: non e' un errore per chi pubblica l'evento,
    // semplicemente non mandiamo nulla.
    res.status(200).json({ inviata: false });
    return;
  }

  const { eventoId } = req.body || {};
  if (!eventoId) {
    res.status(400).json({ error: "Serve eventoId." });
    return;
  }

  const { data: e } = await supabase.from("eventi").select("*").eq("id", eventoId).single();
  if (!e) {
    res.status(404).json({ error: "Evento non trovato." });
    return;
  }

  const siteUrl = `https://${req.headers.host}`;
  const html = `
    <p>Nuovo evento pubblicato in attesa di verifica su fomoas:</p>
    <p><strong>${esc(e.titolo)}</strong><br>
    ${esc(e.categoria)} · ${esc(e.data)}${e.ora ? " " + esc(e.ora) : ""} · ${esc(e.luogo)}</p>
    <p>Organizzatore: ${esc(e.organizzatore)} · ${esc(e.email)} · ${esc(e.telefono)}</p>
    <p><a href="${siteUrl}/admin">Apri il pannello di moderazione →</a></p>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "fomoas <notifiche@fomoas.com>",
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: `Nuovo evento da verificare: ${e.titolo}`,
        html,
      }),
    });
    res.status(200).json({ inviata: resendRes.ok });
  } catch {
    res.status(200).json({ inviata: false });
  }
}
