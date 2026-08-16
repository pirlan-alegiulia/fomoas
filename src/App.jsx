import { useState, useEffect, useMemo, useRef } from "react";
import {
  MapPin,
  Calendar,
  Link as LinkIcon,
  Flag,
  ShieldCheck,
  Search,
  Plus,
  X,
  Clock,
  ChevronDown,
  Sparkles,
  ImagePlus,
  Mic,
  MicOff,
  Send,
  LocateFixed,
  Pencil,
  Trash2,
  Music,
  UtensilsCrossed,
  ShoppingBag,
  Trophy,
  Palette,
  Users,
  Moon,
  Map as MapIcon,
  LayoutGrid,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { buildEventJsonLd } from "../lib/eventoSchema.js";

const CATEGORIES = ["Musica", "Sagra", "Mercatino", "Sport", "Arte & Cultura", "Famiglia", "Nightlife", "Altro"];

// Esempi che ruotano nella barra di ricerca: servono a far capire al volo
// che si puo' scrivere in linguaggio naturale, non solo parole chiave.
const ESEMPI_RICERCA = [
  "Cosa si fa stasera vicino a me?",
  "Una sagra nel weekend con i bambini",
  "Concerti gratis questo mese",
  "Qualcosa da fare domenica pomeriggio",
  "Mercatini dell'antiquariato in zona",
];

// Filtri rapidi: tutti locali e istantanei, non consumano credito IA
const CHIP_RAPIDI = [
  { label: "🍷 Sagre & Cibo", tipo: "categoria", valore: "Sagra" },
  { label: "🎸 Musica dal vivo", tipo: "categoria", valore: "Musica" },
  { label: "🚗 Entro 15 km", tipo: "vicino" },
  { label: "🆓 Eventi Gratis", tipo: "gratis" },
];

const RAGGIO_CHIP_KM = 15;

// Distanza in chilometri tra due coordinate (formula dell'emisenoverso)
function distanzaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

// Identita' visiva per categoria: colore d'accento e illustrazione di
// fallback quando l'evento non ha una foto propria (al posto della mappa).
const CATEGORY_STYLE = {
  Musica: { accent: "#8B5CF6", icon: Music, from: "#7C3AED", to: "#C4B5FD" },
  Sagra: { accent: "#F97316", icon: UtensilsCrossed, from: "#EA580C", to: "#FDBA74" },
  Mercatino: { accent: "#059669", icon: ShoppingBag, from: "#047857", to: "#6EE7B7" },
  Sport: { accent: "#0284C7", icon: Trophy, from: "#0369A1", to: "#7DD3FC" },
  "Arte & Cultura": { accent: "#DB2777", icon: Palette, from: "#BE185D", to: "#F9A8D4" },
  Famiglia: { accent: "#D97706", icon: Users, from: "#B45309", to: "#FCD34D" },
  Nightlife: { accent: "#4F46E5", icon: Moon, from: "#4338CA", to: "#A5B4FC" },
  Altro: { accent: "#64748B", icon: Sparkles, from: "#475569", to: "#CBD5E1" },
};
function categoryStyle(categoria) {
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
function titleCase(str) {
  if (!str) return str;
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i !== 0 && MINUSCOLE_IT.has(w) ? w : w.replace(/(^|['-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())))
    .join(" ");
}

// Carica lo script di Google Maps (con la libreria Places) una sola volta,
// anche se piu componenti PublishForm lo richiedono in parallelo
let googleMapsPromise = null;
function loadGoogleMaps() {
  if (!GOOGLE_MAPS_KEY) return Promise.resolve(null);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve(window.google);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places&language=it&region=IT`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Impossibile caricare Google Maps"));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

const PREFISSI_TEL = [
  { code: "+39", paese: "Italia" },
  { code: "+378", paese: "San Marino" },
  { code: "+41", paese: "Svizzera" },
  { code: "+33", paese: "Francia" },
  { code: "+49", paese: "Germania" },
  { code: "+43", paese: "Austria" },
  { code: "+34", paese: "Spagna" },
  { code: "+44", paese: "Regno Unito" },
  { code: "+1", paese: "USA/Canada" },
];

const emptyForm = {
  titolo: "",
  categoria: CATEGORIES[0],
  data: "",
  ora: "",
  luogo: "",
  placeLat: null,
  placeLng: null,
  descrizione: "",
  gratuito: true,
  prezzo: "",
  organizzatore: "",
  email: "",
  prefissoTel: "+39",
  telefono: "",
  link_verifica: "",
};

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isValidPhone(v) {
  return /^\d{6,}$/.test((v || "").replace(/\s+/g, ""));
}
function isValidUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Radice approssimata della parola, per far combaciare singolare e plurale
// italiani (es. "sagra"/"sagre", "mercato"/"mercati") senza un vero stemmer
function stem(word) {
  return word.length > 4 && /[aeiou]$/.test(word) ? word.slice(0, -1) : word;
}

function wordsOf(text) {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function matchesQuery(text, queryWords, queryStems) {
  const textWords = wordsOf(text);
  return queryWords.every((qw, i) => {
    const qs = queryStems[i];
    return textWords.some((tw) => tw.includes(qw) || stem(tw) === qs);
  });
}

// Geocodifica il luogo inserito in coordinate, cosi possiamo mostrare una
// mappa come immagine di fallback quando l'organizzatore non carica una foto
async function geocodeLuogo(luogo) {
  if (!MAPBOX_TOKEN || !luogo?.trim()) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      luogo
    )}.json?access_token=${MAPBOX_TOKEN}&limit=1&language=it&country=it`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const [lng, lat] = data.features?.[0]?.center || [];
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

function staticMapUrl(lat, lng) {
  if (!MAPBOX_TOKEN || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+FF7E04(${lng},${lat})/${lng},${lat},13,0/640x400@2x?access_token=${MAPBOX_TOKEN}`;
}

function googleMapsUrl(luogo) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo)}`;
}

function eventImageUrl(e) {
  return e.immagine_url || staticMapUrl(e.luogo_lat, e.luogo_lng) || "/event-placeholder.png";
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("Tutte");
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [aiLoadingRicerca, setAiLoadingRicerca] = useState(false);
  const [aiRisposta, setAiRisposta] = useState("");
  const [aiEventIds, setAiEventIds] = useState(null);
  const [webEvents, setWebEvents] = useState(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webErrore, setWebErrore] = useState(false);
  const [webAncoraLoading, setWebAncoraLoading] = useState(false);
  const [webEsauriti, setWebEsauriti] = useState(false);
  const [webRichiesta, setWebRichiesta] = useState("");
  const [soloGratuiti, setSoloGratuiti] = useState(false);
  const [vicinoA, setVicinoA] = useState(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const speechSupported =
    typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const [nearbyEvents, setNearbyEvents] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyLuogo, setNearbyLuogo] = useState("");
  const [viewMode, setViewMode] = useState("griglia");
  const [nearbyVisibleCount, setNearbyVisibleCount] = useState(8);
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [authSent, setAuthSent] = useState(false);
  const [policyAccettata, setPolicyAccettata] = useState(false);
  const [myEvents, setMyEvents] = useState([]);
  const [showLoginBox, setShowLoginBox] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [confermaRicevuta, setConfermaRicevuta] = useState(false);
  const bozzaElaborataRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editingImageUrl, setEditingImageUrl] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  // Gli esempi nella barra ruotano finche' l'utente non inizia a scrivere
  useEffect(() => {
    if (query) return;
    const t = setInterval(() => setPlaceholderIdx((i) => (i + 1) % ESEMPI_RICERCA.length), 3800);
    return () => clearInterval(t);
  }, [query]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchMyEvents(session?.user?.id);
  }, [session]);

  // Appena arriva una sessione (cioe' l'utente ha cliccato il link ricevuto
  // via email, da qualunque browser o dispositivo) controlliamo se esiste
  // una bozza depositata con quello stesso indirizzo: se c'e', l'email e'
  // confermata e possiamo pubblicare davvero l'evento.
  useEffect(() => {
    const utente = session?.user?.id;
    if (!utente) return;
    // onAuthStateChange puo' emettere piu' volte per la stessa sessione
    // (login, refresh del token...): senza questa guardia due esecuzioni
    // sovrapposte leggerebbero la stessa bozza e pubblicherebbero due volte.
    if (bozzaElaborataRef.current === utente) return;
    bozzaElaborataRef.current = utente;
    let annullato = false;

    (async () => {
      const { data: bozze } = await supabase
        .from("eventi_in_attesa")
        .select("id, dati")
        .order("created_at", { ascending: true });
      if (annullato || !bozze || bozze.length === 0) return;

      const bozza = bozze[bozze.length - 1];
      const { immagine_url, ...datiForm } = bozza.dati || {};
      const ok = await eseguiInvio(datiForm, immagine_url ?? null);
      if (annullato) return;

      // La bozza (e le eventuali precedenti dello stesso indirizzo) ha
      // esaurito il suo scopo: va rimossa in ogni caso, altrimenti
      // ripartirebbe a ogni accesso successivo.
      await supabase
        .from("eventi_in_attesa")
        .delete()
        .in("id", bozze.map((b) => b.id));
      if (!annullato && ok) setConfermaRicevuta(true);
    })();

    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function fetchMyEvents(userId) {
    if (!userId) {
      setMyEvents([]);
      return;
    }
    const { data } = await supabase
      .from("eventi")
      .select("*")
      .eq("user_id", userId)
      .order("data", { ascending: true });
    setMyEvents(data || []);
  }

  async function sendMagicLink(email) {
    setAuthSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthSending(false);
    if (error) {
      setToast({ type: "error", msg: "Errore nell'invio dell'email: " + error.message });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setAuthSent(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthSent(false);
    setAuthEmail("");
    handleCancelEdit();
  }

  function handleEditClick(e) {
    const prefissoMatch = PREFISSI_TEL.find((p) => e.telefono?.startsWith(p.code));
    setEditingId(e.id);
    setEditingImageUrl(e.immagine_url || null);
    setForm({
      titolo: e.titolo || "",
      categoria: e.categoria || CATEGORIES[0],
      data: e.data || "",
      ora: e.ora || "",
      luogo: e.luogo || "",
      placeLat: e.luogo_lat ?? null,
      placeLng: e.luogo_lng ?? null,
      descrizione: e.descrizione || "",
      gratuito: e.gratuito,
      prezzo: e.prezzo != null ? String(e.prezzo) : "",
      organizzatore: e.organizzatore || "",
      email: e.email || "",
      prefissoTel: prefissoMatch ? prefissoMatch.code : "+39",
      telefono: prefissoMatch ? e.telefono.slice(prefissoMatch.code.length).trim() : e.telefono || "",
      link_verifica: e.link_verifica || "",
    });
    setErrors({});
    handleRemoveImage();
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditingImageUrl(null);
    setForm(emptyForm);
    setErrors({});
    handleRemoveImage();
    setPendingSubmit(false);
  }

  async function handleDeleteMio(id) {
    if (!window.confirm("Eliminare definitivamente questo evento?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("eventi").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      setToast({ type: "error", msg: "Errore nell'eliminazione: " + error.message });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    if (editingId === id) handleCancelEdit();
    setToast({ type: "info", msg: "Evento eliminato." });
    setTimeout(() => setToast(null), 3000);
    fetchEvents();
    fetchMyEvents(session?.user?.id);
  }

  // Aggiorna i dati strutturati (Schema.org) ogni volta che la lista eventi cambia,
  // cosi Google e gli altri crawler possono leggere gli eventi come tali
  useEffect(() => {
    if (events.length === 0) return;

    const siteUrl = window.location.origin;

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: events.map((e, i) => ({
        ...buildEventJsonLd(e, siteUrl, eventImageUrl(e)),
        position: i + 1,
      })),
    };

    let script = document.getElementById("eventi-structured-data");
    if (!script) {
      script = document.createElement("script");
      script.id = "eventi-structured-data";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structuredData);
  }, [events]);

  async function fetchEvents() {
    setLoading(true);
    const { data, error } = await supabase
      .from("eventi")
      .select("*")
      .eq("verificato", true)
      .order("data", { ascending: true });
    if (error) {
      setLoadError(error.message);
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  }

  function validate() {
    const e = {};
    if (!form.titolo.trim()) e.titolo = "Inserisci un titolo";
    if (!form.data) e.data = "Inserisci una data";
    if (!form.luogo.trim()) e.luogo = "Inserisci un luogo";
    if (!form.gratuito) {
      const p = Number(form.prezzo);
      if (!form.prezzo || Number.isNaN(p) || p <= 0) e.prezzo = "Inserisci un prezzo valido";
      else if (p > 999999.99) e.prezzo = "Il prezzo massimo e 999.999,99 €";
    }
    if (!form.organizzatore.trim()) e.organizzatore = "Inserisci chi organizza";
    if (!isValidEmail(form.email)) e.email = "Email non valida";
    if (!isValidPhone(form.telefono)) e.telefono = "Numero non valido (es. 333 1234567)";
    if (!isValidUrl(form.link_verifica)) e.link_verifica = "Serve un link valido (sito, pagina social, Maps...)";
    if (!editingId && !policyAccettata) e.policy = "Devi accettare i termini e la privacy policy per pubblicare";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleImageChange(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleRemoveImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;

    if (!session) {
      // Non ancora autenticato: la bozza va salvata sul database, non nel
      // browser. Il link di conferma viene quasi sempre aperto altrove
      // (app di posta, altro dispositivo), dove il localStorage di questa
      // pagina non esiste: i dati sarebbero irrecuperabili. Sul database
      // invece la bozza e' leggibile da qualunque browser, ma solo da chi
      // ha dimostrato di possedere quell'indirizzo email.
      setSubmitting(true);
      const immagine_url = await caricaImmagine();
      if (immagine_url === false) return;

      const { error: bozzaError } = await supabase
        .from("eventi_in_attesa")
        .insert([{ email: form.email, dati: { ...form, immagine_url } }]);
      if (bozzaError) {
        setSubmitting(false);
        setToast({ type: "error", msg: "Errore nel salvataggio dei dati: " + bozzaError.message });
        setTimeout(() => setToast(null), 4000);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: form.email,
        options: { emailRedirectTo: window.location.origin },
      });
      setSubmitting(false);
      if (error) {
        setToast({ type: "error", msg: "Errore nell'invio dell'email: " + error.message });
        setTimeout(() => setToast(null), 4000);
        return;
      }
      setPendingEmail(form.email);
      setPendingSubmit(true);
      return;
    }

    await eseguiInvio(form);
  }

  // Carica la foto scelta e restituisce l'URL pubblico, null se non c'e'
  // nessuna foto, oppure false se il caricamento e' fallito (il chiamante
  // in quel caso deve fermarsi: l'errore e' gia' stato mostrato).
  async function caricaImmagine() {
    if (!imageFile) return editingId ? editingImageUrl : null;
    const ext = imageFile.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("eventi-immagini").upload(path, imageFile);
    if (error) {
      setSubmitting(false);
      setToast({ type: "error", msg: "Errore nel caricamento della foto: " + error.message });
      setTimeout(() => setToast(null), 4000);
      return false;
    }
    return supabase.storage.from("eventi-immagini").getPublicUrl(path).data.publicUrl;
  }

  async function eseguiInvio(datiForm, immagineGiaCaricata) {
    setSubmitting(true);

    let immagine_url = immagineGiaCaricata !== undefined ? immagineGiaCaricata : await caricaImmagine();
    if (immagine_url === false) return;

    // La mappa del luogo serve solo come fallback quando non c'e una foto caricata.
    // Se il luogo e stato scelto dal suggerimento Google Maps abbiamo gia le coordinate
    // esatte, altrimenti proviamo a geocodificare il testo inserito manualmente
    const hasPlaceCoords = Number.isFinite(datiForm.placeLat) && Number.isFinite(datiForm.placeLng);
    const coords = immagine_url
      ? null
      : hasPlaceCoords
      ? { lat: datiForm.placeLat, lng: datiForm.placeLng }
      : await geocodeLuogo(datiForm.luogo);

    const { prefissoTel, telefono, placeLat, placeLng, immagine_url: _imgBozza, ...restForm } = datiForm;
    const payload = {
      ...restForm,
      telefono: `${prefissoTel} ${telefono}`.trim(),
      ora: datiForm.ora || null,
      prezzo: datiForm.gratuito ? null : Number(datiForm.prezzo),
      immagine_url,
      luogo_lat: coords?.lat ?? null,
      luogo_lng: coords?.lng ?? null,
    };

    const { data: inserito, error } = editingId
      ? await supabase.from("eventi").update(payload).eq("id", editingId)
      : await supabase
          .from("eventi")
          .insert([
            {
              ...payload,
              reports: 0,
              verificato: false,
              user_id: session.user.id,
              policy_accettata_at: new Date().toISOString(),
            },
          ])
          .select("id")
          .single();
    setSubmitting(false);
    if (error) {
      setToast({ type: "error", msg: "Errore nell'invio: " + error.message });
      return false;
    }
    const wasEditing = !!editingId;
    setForm(emptyForm);
    handleRemoveImage();
    setShowForm(false);
    setEditingId(null);
    setEditingImageUrl(null);
    setPolicyAccettata(false);
    setPendingSubmit(false);
    setToast({
      type: "success",
      msg: wasEditing ? "Evento aggiornato." : "Evento inviato. Sara visibile dopo una rapida verifica.",
    });
    setTimeout(() => setToast(null), 4000);
    fetchEvents();
    fetchMyEvents(session.user.id);
    if (!wasEditing && inserito?.id) {
      // Avvisa l'admin via email che c'e' un nuovo evento da verificare.
      // Fire-and-forget: se fallisce non deve bloccare ne' mostrare errori
      // a chi ha appena pubblicato l'evento.
      fetch("/api/notifica-nuovo-evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventoId: inserito.id }),
      }).catch(() => {});
    }
    return true;
  }

  async function generaDescrizioneIA() {
    if (!form.titolo.trim() || !form.luogo.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/genera-descrizione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo: form.titolo,
          categoria: form.categoria,
          luogo: form.luogo,
          data: form.data,
          organizzatore: form.organizzatore,
          bozza: form.descrizione,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nella generazione");
      setForm((f) => ({ ...f, descrizione: data.descrizione }));
    } catch (err) {
      setToast({ type: "error", msg: "IA non disponibile: " + err.message });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleReport(id) {
    const { error } = await supabase.rpc("segnala_evento", { event_id: id });
    if (!error) {
      setToast({ type: "info", msg: "Segnalazione registrata. Grazie per la verifica." });
      setTimeout(() => setToast(null), 3000);
      fetchEvents();
    }
  }

  // L'IA parte solo qui, cioe' su invio esplicito (Enter o click): mentre si
  // digita il filtro resta quello locale, istantaneo e a costo zero.
  async function chiediAllaIA(testo) {
    const content = (testo ?? query).trim();
    if (!content || aiLoadingRicerca) return;
    setShowSuggestions(false);
    setAiLoadingRicerca(true);
    setAiRisposta("");

    // La ricerca sul web parte in parallelo e vive di vita propria: e' molto
    // piu' lenta, quindi non deve far aspettare i risultati gia' pubblicati.
    cercaSulWeb(content);

    try {
      const res = await fetch("/api/assistente-ricerca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nella richiesta");
      setAiRisposta(data.risposta || "");
      setAiEventIds(Array.isArray(data.eventi) ? data.eventi : []);
    } catch (err) {
      setAiRisposta("Non riesco a rispondere ora (" + err.message + "). Intanto puoi cercare a mano.");
      setAiEventIds(null);
    } finally {
      setAiLoadingRicerca(false);
    }
  }

  async function cercaSulWeb(richiesta) {
    setWebLoading(true);
    setWebEvents(null);
    setWebErrore(false);
    setWebEsauriti(false);
    setWebRichiesta(richiesta);
    try {
      const res = await fetch("/api/eventi-dal-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ richiesta }),
      });
      if (!res.ok) throw new Error("richiesta fallita");
      const data = await res.json();
      setWebEvents(Array.isArray(data.eventi) ? data.eventi : []);
    } catch {
      // Distinguere il guasto dal "non c'e' nulla" evita di far credere che
      // sul web non ci sia niente quando in realta' la ricerca non e' riuscita.
      setWebErrore(true);
      setWebEvents([]);
    } finally {
      setWebLoading(false);
    }
  }

  // Il pulsante "Ancora": chiede due proposte in piu', passando i titoli gia'
  // mostrati perche' non vengano ripetuti.
  async function altreIdeeDalWeb() {
    if (webAncoraLoading || !webRichiesta) return;
    setWebAncoraLoading(true);
    try {
      const res = await fetch("/api/eventi-dal-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          richiesta: webRichiesta,
          quanti: 2,
          escludi: (webEvents || []).map((e) => e.titolo).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("richiesta fallita");
      const data = await res.json();
      const nuovi = Array.isArray(data.eventi) ? data.eventi : [];
      if (nuovi.length === 0) setWebEsauriti(true);
      else setWebEvents((prec) => [...(prec || []), ...nuovi]);
    } catch {
      setWebEsauriti(true);
    } finally {
      setWebAncoraLoading(false);
    }
  }

  function azzeraFiltri() {
    setQuery("");
    setAiEventIds(null);
    setAiRisposta("");
    setWebEvents(null);
    setSoloGratuiti(false);
    setVicinoA(null);
    setCategoryFilter("Tutte");
  }

  function attivaChip(chip) {
    setAiEventIds(null);
    setAiRisposta("");
    if (chip.tipo === "categoria") {
      setCategoryFilter((c) => (c === chip.valore ? "Tutte" : chip.valore));
      return;
    }
    if (chip.tipo === "gratis") {
      setSoloGratuiti((g) => !g);
      return;
    }
    if (chip.tipo === "vicino") {
      if (vicinoA) {
        setVicinoA(null);
        return;
      }
      if (!navigator.geolocation) {
        setToast({ type: "error", msg: "Il tuo browser non supporta la geolocalizzazione." });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => setVicinoA({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          setToast({ type: "error", msg: "Non riesco a leggere la tua posizione." });
          setTimeout(() => setToast(null), 3000);
        }
      );
    }
  }

  function toggleListening() {
    if (!speechSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "it-IT";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      chiediAllaIA(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const messaggi = {
        "not-allowed": "Permesso microfono negato. Consentilo nelle impostazioni del browser.",
        "service-not-allowed": "Permesso microfono negato. Consentilo nelle impostazioni del browser.",
        "no-speech": "Non ho sentito nulla, riprova.",
        "audio-capture": "Nessun microfono trovato.",
        network: "Problema di rete durante il riconoscimento vocale.",
      };
      setToast({ type: "error", msg: messaggi[event.error] || "Microfono non disponibile: " + event.error });
      setTimeout(() => setToast(null), 4000);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      setToast({ type: "error", msg: "Impossibile avviare il microfono: " + err.message });
      setTimeout(() => setToast(null), 4000);
    }
  }

  function trovaEventiVicino() {
    if (!navigator.geolocation) {
      setToast({ type: "error", msg: "Il tuo browser non supporta la geolocalizzazione." });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          let luogo = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
          if (MAPBOX_TOKEN) {
            try {
              const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&types=place&language=it`,
                { signal: AbortSignal.timeout(8000) }
              );
              const data = await res.json();
              luogo = data.features?.[0]?.text || luogo;
            } catch {
              // Geocoding fallito o troppo lento: si prosegue con le coordinate grezze.
            }
          }
          setNearbyLuogo(luogo);
          setNearbyVisibleCount(8);
          const res = await fetch("/api/eventi-vicino-a-me", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ luogo, lat: latitude, lng: longitude }),
            signal: AbortSignal.timeout(140000),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Errore nella ricerca");
          setNearbyEvents(data.eventi || []);
        } catch (err) {
          const msg = err.name === "TimeoutError" ? "la ricerca ha impiegato troppo tempo, riprova." : err.message;
          setToast({ type: "error", msg: "Ricerca non riuscita: " + msg });
          setTimeout(() => setToast(null), 4000);
          setNearbyEvents(null);
        } finally {
          setNearbyLoading(false);
        }
      },
      () => {
        setNearbyLoading(false);
        setToast({ type: "error", msg: "Permesso di localizzazione negato o non disponibile." });
        setTimeout(() => setToast(null), 4000);
      },
      { timeout: 10000 }
    );
  }

  const filtered = useMemo(() => {
    if (aiEventIds !== null) {
      return events.filter((e) => aiEventIds.includes(e.id));
    }
    const queryWords = wordsOf(query);
    const queryStems = queryWords.map(stem);
    return events
      .filter((e) => categoryFilter === "Tutte" || e.categoria === categoryFilter)
      .filter((e) => !soloGratuiti || e.gratuito)
      .filter((e) => {
        if (!vicinoA) return true;
        if (!Number.isFinite(e.luogo_lat) || !Number.isFinite(e.luogo_lng)) return false;
        return distanzaKm(vicinoA.lat, vicinoA.lng, e.luogo_lat, e.luogo_lng) <= RAGGIO_CHIP_KM;
      })
      .filter((e) => {
        if (!queryWords.length) return true;
        const haystack = [e.titolo, e.luogo, e.descrizione, e.categoria, e.organizzatore]
          .filter(Boolean)
          .join(" ");
        return matchesQuery(haystack, queryWords, queryStems);
      });
  }, [events, query, categoryFilter, aiEventIds, soloGratuiti, vicinoA]);

  // Suggerimenti mentre si digita: titoli, luoghi e categorie che combaciano
  // con la query (anche al plurale/singolare), utili quando la ricerca esatta non trova nulla
  const suggestions = useMemo(() => {
    const queryWords = wordsOf(query);
    if (!queryWords.length) return [];
    const queryStems = queryWords.map(stem);
    const pool = new Set(CATEGORIES);
    events.forEach((e) => {
      if (e.titolo) pool.add(e.titolo);
      if (e.luogo) pool.add(e.luogo);
    });
    return Array.from(pool)
      .filter((term) => normalize(term) !== normalize(query))
      .filter((term) => matchesQuery(term, queryWords, queryStems))
      .slice(0, 6);
  }, [events, query]);

  const formProps = {
    form,
    setForm,
    errors,
    aiLoading,
    onGenerateAI: generaDescrizioneIA,
    imagePreview,
    onImageChange: handleImageChange,
    onRemoveImage: handleRemoveImage,
    submitting,
    onSubmit: handleSubmit,
    editing: !!editingId,
    onCancelEdit: handleCancelEdit,
    policyAccettata,
    setPolicyAccettata,
    pendingSubmit,
    pendingEmail,
    authSending,
  };

  const publishPanelContent = !authChecked ? (
    <div className="p-6 text-sm text-white/80">Caricamento...</div>
  ) : (
    <>
      {session && (
        <div className="flex items-center justify-between px-6 pt-4 text-xs text-white/80">
          <span className="truncate">Accesso come {session.user.email}</span>
          <button onClick={signOut} className="underline font-semibold shrink-0 ml-2">
            Esci
          </button>
        </div>
      )}
      <PublishForm {...formProps} />
      {session && myEvents.length > 0 && (
        <MyEventsList events={myEvents} onEdit={handleEditClick} onDelete={handleDeleteMio} deletingId={deletingId} />
      )}
      {!session && !pendingSubmit && (
        <div className="px-6 pb-5 -mt-1">
          <button
            type="button"
            onClick={() => setShowLoginBox((v) => !v)}
            className="text-xs text-white/70 underline"
          >
            Hai gia' pubblicato un evento? Accedi per gestirlo
          </button>
          {showLoginBox && (
            <div className="mt-3 -mx-6">
              <LoginBox email={authEmail} setEmail={setAuthEmail} onSend={sendMagicLink} sending={authSending} sent={authSent} />
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "linear-gradient(160deg, #FF8000 0%, #FFAA00 22%, #A6C8FF 55%, #4D8AFF 78%, #4F5FEF 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <header className="border-b border-white/25 px-5 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-white/80 mb-1">fomoas</p>
            <h1 className="font-data text-3xl sm:text-5xl font-semibold">Cosa si fa stasera?</h1>
            <p className="font-data text-sm sm:text-base text-white/85 mt-2 max-w-md">
              Smetti di chiederti cosa fare stasera. Rispondi all'IA, prendi le chiavi ed esci.
            </p>
          </div>
          <button
            onClick={() => {
              if (editingId || pendingSubmit) handleCancelEdit();
              setShowForm(true);
            }}
            className="self-start shrink-0 inline-flex items-center gap-2 bg-white text-[#FF8000] font-semibold px-4 py-2.5 rounded-full hover:bg-[#FFE3B0] transition-colors"
          >
            <Plus size={18} /> Pubblica evento
          </button>
        </div>
        {events.length > 0 && (
          <div className="max-w-6xl mx-auto mt-4 -mb-1 flex items-center gap-3 overflow-x-auto pb-1">
            <span className="shrink-0 text-[10px] tracking-[0.15em] uppercase text-white/70">In arrivo</span>
            {events.slice(0, 6).map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setQuery(e.titolo);
                  setShowSuggestions(false);
                  setAiEventIds(null);
                }}
                className="shrink-0 inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3 py-1.5 text-xs whitespace-nowrap"
              >
                <span className="font-semibold">{titleCase(e.titolo)}</span>
                <span className="font-data text-white/70">
                  · {new Date(e.data).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      {confermaRicevuta && (
        <div className="max-w-6xl mx-auto px-5 sm:px-8 mt-6">
          <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-6 flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-[#FF8000]/15 flex items-center justify-center">
              <ShieldCheck size={20} className="text-[#FF8000]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold text-[#1B2444] mb-1">Email confermata, grazie!</h2>
              <p className="text-sm text-[#4A5578]">
                Abbiamo ricevuto il tuo evento. Ora e' <strong>in attesa di conferma da parte
                dell'amministratore</strong>: appena viene approvato compare in bacheca e lo vedono tutti.
                Ti bastano pochi minuti di pazienza.
              </p>
            </div>
            <button
              onClick={() => setConfermaRicevuta(false)}
              className="shrink-0 text-[#8A93AD] hover:text-[#1B2444] transition-colors"
              aria-label="Chiudi"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-5 sm:px-8 mt-6">
        <div>
          <div className="flex flex-col sm:flex-row gap-3">
            <form
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                chiediAllaIA();
              }}
            >
              <Sparkles size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FF8000]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                  setAiEventIds(null);
                  setAiRisposta("");
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder={listening ? "Ti ascolto..." : ESEMPI_RICERCA[placeholderIdx]}
                className="w-full bg-white border border-white text-[#1B2444] rounded-xl pl-10 pr-24 py-3 text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4D8AFF]"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`p-2 rounded-lg transition-colors ${
                      listening ? "bg-[#FF5252] text-white" : "text-[#4D8AFF] hover:bg-[#F1F5F9]"
                    }`}
                    aria-label={listening ? "Ferma ascolto" : "Cerca a voce"}
                  >
                    {listening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!query.trim() || aiLoadingRicerca}
                  className="p-2 rounded-lg bg-[#4D8AFF] text-white hover:bg-[#3A72E6] transition-colors disabled:opacity-40"
                  aria-label="Chiedi all'IA"
                >
                  {aiLoadingRicerca ? <Sparkles size={16} className="animate-pulse" /> : <Send size={16} />}
                </button>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xl z-10">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-[#1B2444] hover:bg-[#FFE3B0] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </form>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setAiEventIds(null);
                  setAiRisposta("");
                }}
                className="appearance-none bg-white border border-white text-[#1B2444] rounded-xl pl-4 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4D8AFF]"
              >
                <option>Tutte</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FF8000] pointer-events-none" />
            </div>
            <button
              onClick={trovaEventiVicino}
              disabled={nearbyLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold bg-[#4F5FEF] text-white shadow-lg hover:bg-[#4351D6] transition-colors disabled:opacity-60"
            >
              <LocateFixed size={16} />
              {nearbyLoading ? "Cerco..." : "Trova eventi vicino a me"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {CHIP_RAPIDI.map((chip) => {
              const attivo =
                chip.tipo === "categoria"
                  ? categoryFilter === chip.valore
                  : chip.tipo === "gratis"
                  ? soloGratuiti
                  : !!vicinoA;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => attivaChip(chip)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                    attivo
                      ? "bg-white text-[#4F5FEF] border-white shadow-sm"
                      : "bg-white/15 text-white border-white/30 hover:bg-white/25"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <main className="py-8">
            {nearbyLoading && (
              <div className="mb-5 flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-4 py-2.5 text-sm">
                <LocateFixed size={14} className="animate-pulse" />
                Sto cercando eventi sul web vicino a te, può richiedere fino a due minuti...
              </div>
            )}
            {aiLoadingRicerca && (
              <div className="mb-5 flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-4 py-2.5 text-sm">
                <Sparkles size={14} className="animate-pulse" />
                Sto leggendo la tua richiesta e cerco gli eventi giusti...
              </div>
            )}
            {!aiLoadingRicerca && (aiEventIds !== null || aiRisposta) && (
              <div className="mb-5 flex items-start justify-between gap-3 bg-white/15 border border-white/25 rounded-xl px-4 py-3 text-sm">
                <span className="flex items-start gap-2 min-w-0">
                  <Sparkles size={14} className="mt-0.5 shrink-0" />
                  <span>
                    {aiRisposta}
                    {aiEventIds !== null && (
                      <span className="block text-white/70 mt-1">
                        {aiEventIds.length > 0
                          ? `${aiEventIds.length} event${aiEventIds.length === 1 ? "o" : "i"} qui sotto.`
                          : "Nessun evento corrispondente in bacheca."}
                      </span>
                    )}
                  </span>
                </span>
                <button onClick={azzeraFiltri} className="underline font-semibold shrink-0">
                  Mostra tutti
                </button>
              </div>
            )}
            {loading ? (
              <p className="text-white/80 text-sm">Caricamento eventi...</p>
            ) : loadError ? (
              <div className="text-center py-16 border border-dashed border-white/50 rounded-2xl">
                <p className="font-display text-lg mb-1">Impossibile caricare gli eventi</p>
                <p className="text-sm text-white/80">{loadError} — controlla la connessione a Supabase nel file .env</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/50 rounded-2xl">
                {webLoading || (webEvents !== null && webEvents.length > 0) ? (
                  // C'e' una ricerca in rete in corso o andata a buon fine: invece
                  // di lasciare l'utente davanti a un vicolo cieco, gli diciamo che
                  // qui non c'e' nulla ma che sotto trova comunque delle proposte.
                  // Se invece la ricerca e' fallita o non ha trovato niente non
                  // promettiamo nulla: sotto c'e' gia' il messaggio che lo spiega.
                  <>
                    <p className="font-display text-lg mb-1">
                      Su fomoas non ci sono ancora eventi per questa ricerca
                    </p>
                    <p className="text-sm text-white/80 max-w-lg mx-auto">
                      {webLoading
                        ? "Nessuno li ha ancora pubblicati qui. Intanto l'IA sta cercando in rete qualche alternativa per te: la trovi qui sotto."
                        : "Nessuno li ha ancora pubblicati qui. Nel frattempo l'IA ne ha cercati in rete alcuni che potrebbero fare al caso tuo: li trovi qui sotto."}
                    </p>
                    <p className="text-white/60 mt-3" aria-hidden="true">
                      ↓
                    </p>
                  </>
                ) : events.length === 0 ? (
                  <>
                    <p className="font-display text-lg mb-1">La bacheca e ancora vuota qui</p>
                    <p className="text-sm text-white/80">Pubblica il primo evento per iniziare a riempirla.</p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-lg mb-1">Nessun evento con questi filtri</p>
                    <p className="text-sm text-white/80">
                      {query.trim()
                        ? "Premi Invio per chiedere all'IA: capisce anche le richieste scritte a parole tue."
                        : "Prova a togliere qualche filtro."}
                    </p>
                    <button onClick={azzeraFiltri} className="text-sm underline font-semibold mt-3">
                      Mostra tutti gli eventi
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-4">
                  <div className="inline-flex bg-white/15 rounded-xl p-1 gap-1">
                    <button
                      onClick={() => setViewMode("griglia")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        viewMode === "griglia" ? "bg-white text-[#FF8000]" : "text-white/80 hover:text-white"
                      }`}
                    >
                      <LayoutGrid size={14} /> Griglia
                    </button>
                    <button
                      onClick={() => setViewMode("mappa")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        viewMode === "mappa" ? "bg-white text-[#FF8000]" : "text-white/80 hover:text-white"
                      }`}
                    >
                      <MapIcon size={14} /> Mappa
                    </button>
                  </div>
                </div>
                {viewMode === "mappa" ? (
                  <MapView events={filtered} />
                ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((e) => {
                  const style = categoryStyle(e.categoria);
                  const CategoryIcon = style.icon;
                  return (
                  <article
                    key={e.id}
                    className="relative bg-[#4D8AFF] text-white rounded-2xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-200 overflow-hidden"
                  >
                    <div className="relative h-40 w-full bg-[#3A6FE0]">
                      {e.immagine_url ? (
                        <img
                          src={e.immagine_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(ev) => {
                            ev.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${style.from}, ${style.to})` }}
                        >
                          <CategoryIcon size={52} strokeWidth={1.5} className="text-white/50" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span
                          className="font-data text-[10px] tracking-wider uppercase text-white px-2 py-1 rounded-full font-semibold"
                          style={{ backgroundColor: style.accent }}
                        >
                          {e.categoria}
                        </span>
                        <span className="font-data text-[10px] tracking-wider uppercase bg-white text-[#4F5FEF] px-2 py-1 rounded-full">
                          {e.gratuito ? "Gratuito" : `€ ${Number(e.prezzo).toFixed(2)}`}
                        </span>
                      </div>
                      {e.verificato && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] bg-white/95 text-[#0A8A3B] font-semibold px-2 py-1 rounded-full">
                          <ShieldCheck size={12} /> Verificato
                        </span>
                      )}
                    </div>
                    <div className="p-5 pt-4">
                      <h3 className="font-display text-xl font-bold leading-snug mb-1.5">{titleCase(e.titolo)}</h3>
                      <div className="text-xs text-white/85 space-y-1 mb-3">
                        <p className="font-data flex items-center gap-1.5">
                          <Calendar size={13} />
                          {new Date(e.data).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                          {e.ora && (
                            <>
                              <Clock size={13} className="ml-1.5" /> {e.ora}
                            </>
                          )}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <MapPin size={13} />
                          <a
                            href={googleMapsUrl(e.luogo)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {e.luogo}
                          </a>
                        </p>
                      </div>
                      <div className="mb-3">
                        <DomandeEvento evento={e} />
                      </div>
                      {e.descrizione && <p className="text-sm text-white/85 mb-3 leading-relaxed">{e.descrizione}</p>}
                      <div className="flex items-center justify-between gap-3 text-xs pt-3 border-t border-white/30">
                        <a
                          href={e.link_verifica}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-white font-semibold hover:underline"
                        >
                          <LinkIcon size={12} /> Fonte
                        </a>
                        <button
                          onClick={() => handleReport(e.id)}
                          className="inline-flex items-center gap-1 text-[#FF5252] hover:underline"
                        >
                          <Flag size={12} /> Segnala {e.reports > 0 ? `(${e.reports})` : ""}
                        </button>
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
                )}
              </>
            )}

            {(webLoading || webEvents !== null) && (
              <div className="mt-10">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={15} />
                  <h2 className="font-display text-base font-semibold">
                    {filtered.length === 0 ? "Idee trovate in rete per te" : "Altre idee trovate sul web"}
                  </h2>
                </div>
                <p className="text-xs text-white/70 mb-4">
                  Non sono pubblicate su fomoas e non le abbiamo verificate: controlla sempre la fonte prima di
                  andarci.
                </p>
                {webLoading ? (
                  <p className="text-sm text-white/80">
                    Sto cercando idee in rete, ci vuole qualche decina di secondi.
                    {filtered.length > 0 && " Intanto puoi guardare i risultati qui sopra."}
                  </p>
                ) : webErrore ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-white/80">
                      La ricerca sul web non e' andata a buon fine questa volta.
                    </p>
                    <button
                      onClick={() => cercaSulWeb(query.trim())}
                      disabled={!query.trim()}
                      className="text-sm underline font-semibold disabled:opacity-50"
                    >
                      Riprova
                    </button>
                  </div>
                ) : webEvents.length === 0 ? (
                  <p className="text-sm text-white/80">Nessuna altra idea trovata sul web per questa ricerca.</p>
                ) : (
                  <>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {webEvents.map((e, i) => (
                      <div key={i} className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm">
                        <p className="font-semibold leading-snug mb-1">{e.titolo}</p>
                        <p className="font-data text-xs text-white/75 mb-1">
                          {e.data} · {e.luogo}
                        </p>
                        {e.descrizione && <p className="text-xs text-white/70 mb-2">{e.descrizione}</p>}
                        {e.fonte && (
                          <a
                            href={e.fonte}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-white font-semibold hover:underline"
                          >
                            <LinkIcon size={11} /> Fonte
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center mt-4">
                    {webEsauriti ? (
                      <p className="text-xs text-white/70">
                        Non ho trovato altre proposte diverse da queste per la tua ricerca.
                      </p>
                    ) : (
                      <button
                        onClick={altreIdeeDalWeb}
                        disabled={webAncoraLoading}
                        className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
                      >
                        <Sparkles size={14} className={webAncoraLoading ? "animate-pulse" : ""} />
                        {webAncoraLoading ? "Cerco altre due..." : "Ancora"}
                      </button>
                    )}
                  </div>
                  </>
                )}
              </div>
            )}

            {nearbyEvents !== null && (
              <div className="mt-10">
                <div className="flex items-center gap-2 mb-1">
                  <LocateFixed size={15} />
                  <h2 className="font-display text-base font-semibold">
                    Altri eventi trovati sul web vicino a {nearbyLuogo}
                  </h2>
                </div>
                <p className="text-xs text-white/70 mb-4">
                  Non registrati su fomoas e non verificati da noi, entro 50 km, ordinati per distanza. Controlla
                  sempre la fonte prima di andarci.
                </p>
                {nearbyEvents.length === 0 ? (
                  <p className="text-sm text-white/80">Non ho trovato eventi pertinenti entro 50 km.</p>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {nearbyEvents.slice(0, nearbyVisibleCount).map((e, i) => (
                        <div
                          key={i}
                          className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-semibold leading-snug">{e.titolo}</p>
                            {Number.isFinite(e.distanza_km) && (
                              <span className="font-data shrink-0 text-[10px] tracking-wide uppercase bg-white/20 rounded-full px-2 py-0.5">
                                {e.distanza_km < 1 ? "< 1 km" : `${e.distanza_km} km`}
                              </span>
                            )}
                          </div>
                          <p className="font-data text-xs text-white/75 mb-1">
                            {e.data} · {e.luogo}
                          </p>
                          {e.descrizione && <p className="text-xs text-white/70 mb-2">{e.descrizione}</p>}
                          {e.fonte && (
                            <a
                              href={e.fonte}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-white font-semibold hover:underline"
                            >
                              <LinkIcon size={11} /> Fonte
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                    {nearbyVisibleCount < nearbyEvents.length && (
                      <div className="flex justify-center mt-4">
                        <button
                          onClick={() => setNearbyVisibleCount((c) => c + 8)}
                          className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
                        >
                          Continua
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-6">
          <div className="bg-[#4D8AFF] text-white border border-white/25 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/25 sticky top-0 bg-[#4D8AFF]">
              <h2 className="font-display text-lg font-semibold">
                {editingId ? "Modifica evento" : "Pubblica un evento"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            {publishPanelContent}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#4D8AFF] text-white border border-white/25 px-4 py-2.5 rounded-full text-sm font-semibold shadow-xl">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function PublishForm({
  form,
  setForm,
  errors,
  aiLoading,
  onGenerateAI,
  imagePreview,
  onImageChange,
  onRemoveImage,
  submitting,
  onSubmit,
  editing,
  onCancelEdit,
  policyAccettata,
  setPolicyAccettata,
  pendingSubmit,
  pendingEmail,
  authSending,
}) {
  const luogoInputRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [showPlaceSuggestions, setShowPlaceSuggestions] = useState(false);

  // Prepara i servizi Google Places (il widget "Autocomplete" classico non e
  // piu disponibile per i progetti nuovi, quindi costruiamo un dropdown
  // personalizzato sopra ad AutocompleteService/PlacesService, che restano supportati)
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !google) return;
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        placesServiceRef.current = new google.maps.places.PlacesService(document.createElement("div"));
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
    };
  }, []);

  function handleLuogoChange(value) {
    setForm((f) => ({ ...f, luogo: value, placeLat: null, placeLng: null }));
    setShowPlaceSuggestions(true);
    clearTimeout(debounceRef.current);
    if (!autocompleteServiceRef.current || !value.trim()) {
      setPlaceSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        { input: value, componentRestrictions: { country: "it" }, sessionToken: sessionTokenRef.current },
        (predictions, status) => {
          setPlaceSuggestions(status === "OK" && predictions ? predictions : []);
        }
      );
    }, 300);
  }

  function selectPlace(prediction) {
    setShowPlaceSuggestions(false);
    setPlaceSuggestions([]);
    if (!placesServiceRef.current) return;
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ["formatted_address", "name", "geometry"], sessionToken: sessionTokenRef.current },
      (place, status) => {
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        if (status !== "OK" || !place?.geometry?.location) {
          setForm((f) => ({ ...f, luogo: prediction.description }));
          return;
        }
        const testo =
          place.name && place.formatted_address && !place.formatted_address.startsWith(place.name)
            ? `${place.name}, ${place.formatted_address}`
            : place.formatted_address || place.name || prediction.description;
        setForm((f) => ({
          ...f,
          luogo: testo,
          placeLat: place.geometry.location.lat(),
          placeLng: place.geometry.location.lng(),
        }));
      }
    );
  }

  return (
    <form onSubmit={onSubmit} className="p-6 space-y-4">
      <Field label="Titolo evento" error={errors.titolo}>
        <input
          value={form.titolo}
          onChange={(e) => setForm({ ...form, titolo: e.target.value })}
          className={inputCls(errors.titolo)}
          placeholder="Sagra della porchetta"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data" error={errors.data}>
          <input
            type="date"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            className={inputCls(errors.data)}
          />
        </Field>
        <Field label="Ora (opzionale)">
          <input
            type="time"
            value={form.ora}
            onChange={(e) => setForm({ ...form, ora: e.target.value })}
            className={inputCls()}
          />
        </Field>
      </div>

      <Field label="Categoria">
        <select
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          className={inputCls()}
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>

      <Field label="Luogo" error={errors.luogo}>
        <div className="relative">
          <input
            ref={luogoInputRef}
            value={form.luogo}
            onChange={(e) => handleLuogoChange(e.target.value)}
            onFocus={() => setShowPlaceSuggestions(true)}
            onBlur={() => setTimeout(() => setShowPlaceSuggestions(false), 150)}
            className={inputCls(errors.luogo)}
            placeholder="Piazza Garibaldi, Modena"
            autoComplete="off"
          />
          {showPlaceSuggestions && placeSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xl z-20 max-h-56 overflow-y-auto">
              {placeSuggestions.map((s) => (
                <button
                  key={s.place_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPlace(s)}
                  className="w-full text-left px-4 py-2 text-sm text-[#1B2444] hover:bg-[#FFE3B0] transition-colors"
                >
                  {s.description}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field label="Foto dell'evento (opzionale)">
        <div className="flex items-center gap-3">
          {imagePreview ? (
            <div className="relative shrink-0">
              <img src={imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/40" />
              <button
                type="button"
                onClick={onRemoveImage}
                className="absolute -top-2 -right-2 bg-white text-[#FF8000] rounded-full p-0.5 shadow"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="w-16 h-16 shrink-0 rounded-lg border border-dashed border-white/40 flex items-center justify-center text-white/60">
              <ImagePlus size={20} />
            </div>
          )}
          <label className="cursor-pointer text-xs font-semibold text-white bg-white/15 hover:bg-white/25 px-3 py-2 rounded-full transition-colors inline-flex items-center gap-1.5">
            <ImagePlus size={13} /> {imagePreview ? "Cambia foto" : "Carica foto"}
            <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
          </label>
        </div>
        <p className="text-[11px] text-white/60 mt-1.5">Se non carichi una foto, mostriamo automaticamente una mappa del luogo.</p>
      </Field>

      <Field label="Ingresso">
        <div className="flex items-center gap-4 mb-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.gratuito}
              onChange={(e) =>
                setForm({ ...form, gratuito: e.target.checked, prezzo: e.target.checked ? "" : form.prezzo })
              }
              className="accent-[#FF8000]"
            />
            Evento gratuito
          </label>
        </div>
        {!form.gratuito && (
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.prezzo}
            onChange={(e) => setForm({ ...form, prezzo: e.target.value })}
            className={inputCls(errors.prezzo)}
            placeholder="Prezzo in euro, es. 10"
          />
        )}
        {errors.prezzo && <span className="block text-xs text-[#FFE082] font-semibold mt-1">{errors.prezzo}</span>}
      </Field>

      <label className="block">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/80">Descrizione</span>
          <button
            type="button"
            onClick={onGenerateAI}
            disabled={aiLoading || !form.titolo.trim() || !form.luogo.trim()}
            className="text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded-full transition-colors inline-flex items-center gap-1"
          >
            <Sparkles size={12} />
            {aiLoading
              ? "Elaborazione..."
              : form.descrizione.trim()
              ? "Migliora con IA"
              : "Genera con IA"}
          </button>
        </div>
        <textarea
          value={form.descrizione}
          onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
          className={inputCls() + " min-h-[70px]"}
          placeholder="Scrivi una bozza e lascia che l'IA la elabori, oppure genera un testo da zero"
        />
      </label>

      <div className="pt-2 border-t border-white/25">
        <p className="text-xs text-white font-semibold mb-3">Dati per la verifica (non pubblicati integralmente)</p>

        <Field label="Chi organizza" error={errors.organizzatore}>
          <input
            value={form.organizzatore}
            onChange={(e) => setForm({ ...form, organizzatore: e.target.value })}
            className={inputCls(errors.organizzatore)}
            placeholder="Pro Loco Modena / Nome e cognome"
          />
        </Field>

        <div className="space-y-3 mt-3">
          <Field label="Email" error={errors.email}>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls(errors.email)}
              placeholder="tu@esempio.it"
            />
          </Field>
          <Field label="Telefono" error={errors.telefono}>
            <div className="flex gap-2">
              <select
                value={form.prefissoTel}
                onChange={(e) => setForm({ ...form, prefissoTel: e.target.value })}
                className={inputCls() + " !w-32 shrink-0 truncate"}
              >
                {PREFISSI_TEL.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} {p.paese}
                  </option>
                ))}
              </select>
              <input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className={inputCls(errors.telefono) + " flex-1 min-w-0"}
                placeholder="333 1234567"
              />
            </div>
          </Field>
        </div>

        <Field label="Link di riscontro (sito, pagina social, Google Maps...)" error={errors.link_verifica}>
          <input
            value={form.link_verifica}
            onChange={(e) => setForm({ ...form, link_verifica: e.target.value })}
            className={inputCls(errors.link_verifica)}
            placeholder="https://..."
          />
        </Field>
      </div>

      {pendingSubmit ? (
        <div className="bg-white/10 border border-white/20 rounded-xl p-4 space-y-2">
          <p className="text-sm">
            Ti abbiamo inviato un'email di conferma a <strong>{pendingEmail}</strong>. Apri il link che trovi
            dentro — anche dal telefono o da un altro browser: i dati sono salvati e il tuo evento passera'
            automaticamente in attesa di approvazione. Puoi chiudere questa pagina.
          </p>
        </div>
      ) : (
        <>
          {!editing && (
            <div>
              <label className="flex items-start gap-2 text-xs text-white/90">
                <input
                  type="checkbox"
                  checked={policyAccettata}
                  onChange={(e) => setPolicyAccettata(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Accetto i{" "}
                  <a href="/policy" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                    Termini e la Privacy Policy
                  </a>{" "}
                  di fomoas.
                </span>
              </label>
              {errors.policy && <p className="text-xs text-red-100 bg-red-500/30 rounded-lg px-2.5 py-1.5 mt-1.5">{errors.policy}</p>}
            </div>
          )}

          <div className="flex gap-2">
            {editing && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex-1 bg-white/15 text-white font-semibold py-3 rounded-xl hover:bg-white/25 transition-colors"
              >
                Annulla
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || authSending}
              className="flex-1 bg-white text-[#FF8000] font-semibold py-3 rounded-xl hover:bg-[#FFE3B0] transition-colors disabled:opacity-60"
            >
              {submitting
                ? "Invio in corso..."
                : authSending
                ? "Invio email di conferma..."
                : editing
                ? "Aggiorna evento"
                : "Invia per la verifica"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function MapView({ events }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const markersRef = useRef([]);
  const [pronta, setPronta] = useState(false);
  const [erroreCaricamento, setErroreCaricamento] = useState(false);

  // mapbox-gl e' una libreria pesante: la carichiamo solo quando la vista
  // mappa viene effettivamente aperta, non nel bundle principale del sito.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let cancellato = false;
    Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")])
      .then(([mod]) => {
        if (cancellato) return;
        const mapboxgl = mod.default;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        mapboxglRef.current = mapboxgl;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v11",
          center: [12.5, 43.5],
          zoom: 5,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        mapRef.current = map;
        setPronta(true);
      })
      .catch(() => setErroreCaricamento(true));
    return () => {
      cancellato = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const conCoordinate = events.filter((e) => Number.isFinite(e.luogo_lat) && Number.isFinite(e.luogo_lng));
    if (conCoordinate.length === 0) return;

    const applica = () => {
      const bounds = new mapboxgl.LngLatBounds();
      conCoordinate.forEach((e) => {
        const style = categoryStyle(e.categoria);
        const el = document.createElement("div");
        el.style.width = "26px";
        el.style.height = "26px";
        el.style.borderRadius = "50%";
        el.style.background = style.accent;
        el.style.border = "2.5px solid white";
        el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
        el.style.cursor = "pointer";
        const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
          `<strong>${titleCase(e.titolo)}</strong><br/><span style="font-size:12px;color:#555;">${e.luogo}</span>`
        );
        const marker = new mapboxgl.Marker(el).setLngLat([e.luogo_lng, e.luogo_lat]).setPopup(popup).addTo(map);
        markersRef.current.push(marker);
        bounds.extend([e.luogo_lng, e.luogo_lat]);
      });
      if (conCoordinate.length > 1) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      } else {
        map.flyTo({ center: [conCoordinate[0].luogo_lng, conCoordinate[0].luogo_lat], zoom: 11 });
      }
    };

    if (map.isStyleLoaded()) applica();
    else map.once("load", applica);
  }, [events, pronta]);

  if (!MAPBOX_TOKEN || erroreCaricamento) {
    return (
      <div className="flex items-center justify-center h-96 bg-white/10 border border-white/20 rounded-2xl text-sm text-white/70">
        Mappa non disponibile.
      </div>
    );
  }

  const senzaCoordinate = events.filter((e) => !Number.isFinite(e.luogo_lat) || !Number.isFinite(e.luogo_lng)).length;

  return (
    <div>
      <div className="relative h-[420px] w-full rounded-2xl overflow-hidden border border-white/20">
        <div ref={containerRef} className="h-full w-full" />
        {!pronta && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/10 text-sm text-white/80">
            Carico la mappa...
          </div>
        )}
      </div>
      {senzaCoordinate > 0 && (
        <p className="text-xs text-white/70 mt-2">
          {senzaCoordinate} event{senzaCoordinate === 1 ? "o" : "i"} senza una posizione precisa non{" "}
          {senzaCoordinate === 1 ? "compare" : "compaiono"} in mappa.
        </p>
      )}
    </div>
  );
}

function LoginBox({ email, setEmail, onSend, sending, sent }) {
  if (sent) {
    return (
      <div className="p-6 text-sm text-white/90 space-y-2">
        <p className="font-semibold">Controlla la tua email</p>
        <p>
          Ti abbiamo inviato un link di accesso a <strong>{email}</strong>. Aprilo per accedere ai tuoi
          eventi — va bene anche da un altro dispositivo.
        </p>
      </div>
    );
  }
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        if (email.trim()) onSend(email.trim());
      }}
      className="p-6 space-y-3"
    >
      <p className="text-sm text-white/90">
        Per pubblicare un evento accedi con la tua email: ti mandiamo un link, nessuna password da ricordare.
      </p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@esempio.it"
        className="w-full bg-white border border-white text-[#1B2444] rounded-xl px-3.5 py-2.5 text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#4D8AFF]"
      />
      <button
        type="submit"
        disabled={sending}
        className="w-full bg-white text-[#FF8000] font-semibold py-3 rounded-xl hover:bg-[#FFE3B0] transition-colors disabled:opacity-60"
      >
        {sending ? "Invio in corso..." : "Invia link di accesso"}
      </button>
    </form>
  );
}

function MyEventsList({ events, onEdit, onDelete, deletingId }) {
  return (
    <div className="border-t border-white/25 px-6 py-4">
      <h3 className="text-xs uppercase tracking-wider text-white/80 mb-3">I tuoi eventi</h3>
      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 bg-white/10 rounded-lg px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="font-semibold truncate">{e.titolo}</p>
              <p className="text-white/70">
                <span className="font-data">
                  {new Date(e.data).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </span>
                {" · "}
                {e.verificato ? "Verificato" : "In attesa di verifica"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onEdit(e)}
                className="p-1.5 hover:bg-white/20 rounded"
                title="Modifica"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(e.id)}
                disabled={deletingId === e.id}
                className="p-1.5 hover:bg-white/20 rounded disabled:opacity-50"
                title="Elimina"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Domande veloci su un singolo evento. Le proposte pronte coprono le cose
// che i dati sanno davvero dire; per tutto il resto l'IA risponde che il
// dato non c'e' e rimanda alla fonte, invece di inventare.
const DOMANDE_PRONTE = ["A che ora inizia?", "Si paga?", "Dove si trova esattamente?", "Adatto ai bambini?"];

function DomandeEvento({ evento }) {
  const [aperto, setAperto] = useState(false);
  const [domanda, setDomanda] = useState("");
  const [risposta, setRisposta] = useState("");
  const [caricamento, setCaricamento] = useState(false);

  async function chiedi(testo) {
    const q = (testo ?? domanda).trim();
    if (!q || caricamento) return;
    setCaricamento(true);
    setRisposta("");
    try {
      const res = await fetch("/api/domanda-evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventoId: evento.id, domanda: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore nella richiesta");
      setRisposta(data.risposta);
    } catch (err) {
      setRisposta("Non riesco a rispondere ora (" + err.message + ").");
    } finally {
      setCaricamento(false);
      setDomanda("");
    }
  }

  if (!aperto) {
    return (
      <button
        onClick={() => setAperto(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#4D8AFF] px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-[#EAF1FF] transition-colors"
      >
        <Sparkles size={13} /> Chiedi all'IA
      </button>
    );
  }

  return (
    <div className="w-full bg-white/10 border border-white/25 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Sparkles size={12} /> Chiedi su questo evento
        </span>
        <button
          onClick={() => setAperto(false)}
          className="text-white/70 hover:text-white"
          aria-label="Chiudi"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {DOMANDE_PRONTE.map((d) => (
          <button
            key={d}
            onClick={() => chiedi(d)}
            disabled={caricamento}
            className="rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50"
          >
            {d}
          </button>
        ))}
      </div>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          chiedi();
        }}
        className="flex gap-1.5"
      >
        <input
          value={domanda}
          onChange={(ev) => setDomanda(ev.target.value)}
          placeholder="Oppure scrivi la tua domanda..."
          maxLength={200}
          className="flex-1 min-w-0 bg-white/90 text-[#1B2444] rounded-lg px-2.5 py-1.5 text-xs placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-white"
        />
        <button
          type="submit"
          disabled={caricamento || !domanda.trim()}
          className="shrink-0 bg-white text-[#4D8AFF] rounded-lg px-2.5 py-1.5 disabled:opacity-40"
          aria-label="Invia domanda"
        >
          <Send size={13} />
        </button>
      </form>

      {caricamento && <p className="text-[11px] text-white/70 mt-2">Sto guardando i dati dell'evento...</p>}
      {risposta && <p className="text-[11px] bg-white/15 rounded-lg px-2.5 py-2 mt-2 leading-relaxed">{risposta}</p>}
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/80 mb-1.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-[#FFE082] font-semibold mt-1">{error}</span>}
    </label>
  );
}

function inputCls(error) {
  return `w-full bg-white border ${
    error ? "border-[#DC2626]" : "border-white"
  } rounded-lg px-3.5 py-2.5 text-sm text-[#1B2444] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FF8000]`;
}
