// Stile e formattazione condivisi fra la bacheca (App) e la pagina del
// singolo evento (EventPage), cosi un evento si presenta allo stesso modo
// ovunque compaia.

import { Music, UtensilsCrossed, ShoppingBag, Trophy, Palette, Users, Moon, Sparkles } from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export const CATEGORIES = [
  "Musica",
  "Sagra",
  "Mercatino",
  "Sport",
  "Arte & Cultura",
  "Famiglia",
  "Nightlife",
  "Altro",
];

// Identita' visiva per categoria: colore d'accento e illustrazione di
// fallback quando l'evento non ha una foto propria (al posto della mappa).
export const CATEGORY_STYLE = {
  Musica: { accent: "#7C3AED", icon: Music, from: "#7C3AED", to: "#C4B5FD" },
  Sagra: { accent: "#C2410C", icon: UtensilsCrossed, from: "#EA580C", to: "#FDBA74" },
  Mercatino: { accent: "#047857", icon: ShoppingBag, from: "#047857", to: "#6EE7B7" },
  Sport: { accent: "#0369A1", icon: Trophy, from: "#0369A1", to: "#7DD3FC" },
  "Arte & Cultura": { accent: "#DB2777", icon: Palette, from: "#BE185D", to: "#F9A8D4" },
  Famiglia: { accent: "#B45309", icon: Users, from: "#B45309", to: "#FCD34D" },
  Nightlife: { accent: "#4F46E5", icon: Moon, from: "#4338CA", to: "#A5B4FC" },
  Altro: { accent: "#64748B", icon: Sparkles, from: "#475569", to: "#CBD5E1" },
};

export function categoryStyle(categoria) {
  return CATEGORY_STYLE[categoria] || CATEGORY_STYLE.Altro;
}

// Titolo elegante: maiuscola a inizio parola, articoli/preposizioni brevi
// restano minuscoli (tranne a inizio frase) — corregge titoli inseriti
// tutti minuscoli senza stravolgere quelli gia' scritti bene.
const MINUSCOLE_IT = new Set([
  "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "e", "o", "il", "lo", "la", "i", "gli", "le",
  "un", "uno", "una", "del", "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai", "agli",
  "alle", "dal", "dallo", "dalla", "dai", "dagli", "dalle", "nel", "nello", "nella", "nei", "negli", "nelle",
]);

export function titleCase(str) {
  if (!str) return str;
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      i !== 0 && MINUSCOLE_IT.has(w)
        ? w
        : w.replace(/(^|['-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
    )
    .join(" ");
}

export function staticMapUrl(lat, lng) {
  if (!MAPBOX_TOKEN || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+FF7E04(${lng},${lat})/${lng},${lat},13,0/640x400@2x?access_token=${MAPBOX_TOKEN}`;
}

export function googleMapsUrl(luogo) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo)}`;
}

// Indicazioni stradali passo passo, non solo la posizione sulla mappa
export function indicazioniUrl(luogo) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(luogo)}`;
}

export function eventImageUrl(e) {
  return e.immagine_url || staticMapUrl(e.luogo_lat, e.luogo_lng) || "/event-placeholder.png";
}

export function dataEstesa(data) {
  try {
    return new Date(data).toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return data;
  }
}

// Sfondo comune a tutte le pagine: la palette del sito, ancorata al viewport
export const SFONDO_SITO = {
  background:
    "linear-gradient(160deg, #FF8000 0%, #FFAA00 22%, #A6C8FF 55%, #4D8AFF 78%, #4F5FEF 100%)",
  backgroundAttachment: "fixed",
};
