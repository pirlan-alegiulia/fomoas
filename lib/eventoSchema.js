import { slugEvento } from "./slug.js";
// Funzioni pure condivise per generare i dati Schema.org (JSON-LD) degli
// eventi. Usato sia lato server (middleware.js, api/*.js) sia lato client
// (src/App.jsx), cosi la struttura dei dati resta identica ovunque.

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtData(d) {
  try {
    return new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

export function prezzoLabel(e) {
  return e.gratuito ? "Ingresso gratuito" : `Ingresso € ${Number(e.prezzo).toFixed(2)}`;
}

// L'orario di fine non viene raccolto dal form: stimiamo la fine
// giornata dell'evento, cosi il campo endDate resta valido senza
// inventare un orario di chiusura preciso che non abbiamo.
export function dateSchema(e) {
  const startDate = e.ora ? `${e.data}T${e.ora}` : e.data;
  const endDate = `${e.data}T23:59:59`;
  return { startDate, endDate };
}

// Costruisce l'oggetto Event Schema.org completo per un singolo evento.
// `siteUrl` deve essere l'origin del sito (es. https://fomoas.com).
export function buildEventJsonLd(e, siteUrl, imageUrl) {
  const { startDate, endDate } = dateSchema(e);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.titolo,
    startDate,
    endDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: e.luogo,
      // Indirizzo strutturato e non stringa secca: e' quello che Google si
      // aspetta per i risultati arricchiti. Il luogo lo raccogliamo come
      // testo unico, quindi finisce tutto in streetAddress.
      address: { "@type": "PostalAddress", streetAddress: e.luogo, addressCountry: "IT" },
      ...(Number.isFinite(e.luogo_lat) && Number.isFinite(e.luogo_lng)
        ? { geo: { "@type": "GeoCoordinates", latitude: e.luogo_lat, longitude: e.luogo_lng } }
        : {}),
    },
    description: e.descrizione || `${e.titolo} a ${e.luogo}, organizzato da ${e.organizzatore}.`,
    // Un'immagine ci vuole sempre: senza, Google non mostra la scheda
    // arricchita dell'evento. Se l'organizzatore non ha caricato una foto
    // usiamo la locandina che generiamo noi, che esiste per ogni evento.
    image: [
      new URL(imageUrl || e.immagine_url || `/api/locandina?id=${e.id}`, siteUrl).toString(),
    ],
    isAccessibleForFree: !!e.gratuito,
    organizer: {
      "@type": "Organization",
      name: e.organizzatore,
      // Il link di riscontro dell'evento e' quasi sempre la pagina
      // dell'organizzatore (sito, pagina social): e' il riferimento
      // migliore che abbiamo per indicare chi organizza.
      ...(e.link_verifica ? { url: e.link_verifica } : {}),
    },
    performer: { "@type": "Organization", name: e.organizzatore },
    offers: {
      "@type": "Offer",
      url: e.link_verifica || siteUrl,
      price: e.gratuito ? "0" : String(e.prezzo ?? "0"),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      // Da quando l'offerta e' valida: per noi da quando l'evento e' stato
      // pubblicato in bacheca, che e' il momento in cui e' diventato
      // effettivamente prenotabile o raggiungibile tramite fomoas.
      ...(e.created_at ? { validFrom: new Date(e.created_at).toISOString() } : {}),
    },
    url: `${siteUrl}/evento/${slugEvento(e)}`,
  };
}
