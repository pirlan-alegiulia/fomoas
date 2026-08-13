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
} from "lucide-react";
import { supabase } from "./supabaseClient";

const CATEGORIES = ["Musica", "Sagra", "Mercatino", "Sport", "Arte & Cultura", "Famiglia", "Nightlife", "Altro"];
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

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

  useEffect(() => {
    fetchEvents();
  }, []);

  // Aggiorna i dati strutturati (Schema.org) ogni volta che la lista eventi cambia,
  // cosi Google e gli altri crawler possono leggere gli eventi come tali
  useEffect(() => {
    if (events.length === 0) return;

    const siteUrl = window.location.origin;

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: events.map((e, i) => ({
        "@type": "Event",
        position: i + 1,
        name: e.titolo,
        startDate: e.data,
        location: {
          "@type": "Place",
          name: e.luogo,
          address: e.luogo,
        },
        image: [new URL(eventImageUrl(e), siteUrl).toString()],
        description:
          e.descrizione || `${e.titolo} a ${e.luogo}, organizzato da ${e.organizzatore}.`,
        organizer: {
          "@type": "Organization",
          name: e.organizzatore,
        },
        performer: {
          "@type": "Organization",
          name: e.organizzatore,
        },
        offers: {
          "@type": "Offer",
          url: e.link_verifica || siteUrl,
          price: e.gratuito ? "0" : String(e.prezzo ?? "0"),
          priceCurrency: "EUR",
          availability: "https://schema.org/InStock",
        },
        url: e.link_verifica || undefined,
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
    }
    if (!form.organizzatore.trim()) e.organizzatore = "Inserisci chi organizza";
    if (!isValidEmail(form.email)) e.email = "Email non valida";
    if (!isValidPhone(form.telefono)) e.telefono = "Numero non valido (es. 333 1234567)";
    if (!isValidUrl(form.link_verifica)) e.link_verifica = "Serve un link valido (sito, pagina social, Maps...)";
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
    setSubmitting(true);

    let immagine_url = null;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("eventi-immagini")
        .upload(path, imageFile);
      if (uploadError) {
        setSubmitting(false);
        setToast({ type: "error", msg: "Errore nel caricamento della foto: " + uploadError.message });
        setTimeout(() => setToast(null), 4000);
        return;
      }
      immagine_url = supabase.storage.from("eventi-immagini").getPublicUrl(path).data.publicUrl;
    }

    // La mappa del luogo serve solo come fallback quando non c'e una foto caricata.
    // Se il luogo e stato scelto dal suggerimento Google Maps abbiamo gia le coordinate
    // esatte, altrimenti proviamo a geocodificare il testo inserito manualmente
    const hasPlaceCoords = Number.isFinite(form.placeLat) && Number.isFinite(form.placeLng);
    const coords = immagine_url
      ? null
      : hasPlaceCoords
      ? { lat: form.placeLat, lng: form.placeLng }
      : await geocodeLuogo(form.luogo);

    const { prefissoTel, telefono, placeLat, placeLng, ...restForm } = form;
    const { error } = await supabase.from("eventi").insert([
      {
        ...restForm,
        telefono: `${prefissoTel} ${telefono}`.trim(),
        ora: form.ora || null,
        prezzo: form.gratuito ? null : Number(form.prezzo),
        immagine_url,
        luogo_lat: coords?.lat ?? null,
        luogo_lng: coords?.lng ?? null,
        reports: 0,
        verificato: false,
      },
    ]);
    setSubmitting(false);
    if (error) {
      setToast({ type: "error", msg: "Errore nell'invio: " + error.message });
      return;
    }
    setForm(emptyForm);
    handleRemoveImage();
    setShowForm(false);
    setToast({ type: "success", msg: "Evento inviato. Sara visibile dopo una rapida verifica." });
    setTimeout(() => setToast(null), 4000);
    fetchEvents();
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

  const filtered = useMemo(() => {
    const queryWords = wordsOf(query);
    const queryStems = queryWords.map(stem);
    return events
      .filter((e) => categoryFilter === "Tutte" || e.categoria === categoryFilter)
      .filter((e) => {
        if (!queryWords.length) return true;
        const haystack = [e.titolo, e.luogo, e.descrizione, e.categoria, e.organizzatore]
          .filter(Boolean)
          .join(" ");
        return matchesQuery(haystack, queryWords, queryStems);
      });
  }, [events, query, categoryFilter]);

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
  };

  return (
    <div className="min-h-screen bg-[#FF7E04] text-white">
      <header className="border-b border-white/25 px-5 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-white/80 mb-1">fomoas</p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold">Cosa si fa stasera?</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="lg:hidden shrink-0 inline-flex items-center gap-2 bg-white text-[#FF7E04] font-semibold px-4 py-2.5 rounded-full hover:bg-[#FFE8D1] transition-colors"
          >
            <Plus size={18} /> Pubblica evento
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 mt-6 lg:grid lg:grid-cols-[1fr_380px] lg:gap-8 lg:items-start">
        <div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FF7E04]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Cerca per nome, luogo, tipo di evento..."
                className="w-full bg-white border border-white text-[#102937] rounded-xl pl-10 pr-4 py-3 text-sm placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
              />
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
                      className="w-full text-left px-4 py-2 text-sm text-[#102937] hover:bg-[#FFE8D1] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none bg-white border border-white text-[#102937] rounded-xl pl-4 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
              >
                <option>Tutte</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FF7E04] pointer-events-none" />
            </div>
          </div>

          <main className="py-8">
            {loading ? (
              <p className="text-white/80 text-sm">Caricamento eventi...</p>
            ) : loadError ? (
              <div className="text-center py-16 border border-dashed border-white/50 rounded-2xl">
                <p className="font-display text-lg mb-1">Impossibile caricare gli eventi</p>
                <p className="text-sm text-white/80">{loadError} — controlla la connessione a Supabase nel file .env</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/50 rounded-2xl">
                <p className="font-display text-lg mb-1">La bacheca e ancora vuota qui</p>
                <p className="text-sm text-white/80">Pubblica il primo evento per iniziare a riempirla.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6">
                {filtered.map((e) => (
                  <article key={e.id} className="relative bg-[#00AEEF] text-white rounded-sm shadow-lg overflow-hidden">
                    <div className="relative h-40 w-full bg-[#0C86BA]">
                      <img
                        src={eventImageUrl(e)}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(ev) => {
                          ev.currentTarget.src = "/event-placeholder.png";
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className="text-[10px] tracking-wider uppercase bg-white text-[#FF7E04] px-2 py-1 rounded-full">
                          {e.categoria}
                        </span>
                        <span className="text-[10px] tracking-wider uppercase bg-white text-[#0277BD] px-2 py-1 rounded-full">
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
                      <h3 className="font-display text-lg font-semibold leading-snug mb-1">{e.titolo}</h3>
                      <div className="text-xs text-white/85 space-y-1 mb-3">
                        <p className="flex items-center gap-1.5">
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
                      {e.descrizione && <p className="text-sm text-white/85 mb-3 leading-relaxed">{e.descrizione}</p>}
                      <div className="flex items-center justify-between text-xs pt-3 border-t border-white/30">
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
                ))}
              </div>
            )}
          </main>
        </div>

        <aside className="hidden lg:block sticky top-6 mb-8">
          <div className="bg-[#00AEEF] text-white border border-white/25 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-white/25">
              <Sparkles size={16} />
              <h2 className="font-display text-lg font-semibold">Pubblica un evento con l'IA</h2>
            </div>
            <PublishForm {...formProps} />
          </div>
        </aside>
      </div>

      {showForm && (
        <div className="lg:hidden fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-6">
          <div className="bg-[#00AEEF] text-white border border-white/25 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/25 sticky top-0 bg-[#00AEEF]">
              <h2 className="font-display text-lg font-semibold">Pubblica un evento</h2>
              <button onClick={() => setShowForm(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <PublishForm {...formProps} />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#00AEEF] text-white border border-white/25 px-4 py-2.5 rounded-full text-sm font-semibold shadow-xl">
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
                  className="w-full text-left px-4 py-2 text-sm text-[#102937] hover:bg-[#FFE8D1] transition-colors"
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
                className="absolute -top-2 -right-2 bg-white text-[#FF7E04] rounded-full p-0.5 shadow"
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
              className="accent-[#FF7E04]"
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

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-white text-[#FF7E04] font-semibold py-3 rounded-xl hover:bg-[#FFE8D1] transition-colors disabled:opacity-60"
      >
        {submitting ? "Invio in corso..." : "Invia per la verifica"}
      </button>
    </form>
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
  } rounded-lg px-3.5 py-2.5 text-sm text-[#102937] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FF7E04]`;
}
