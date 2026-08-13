import { useState, useEffect, useMemo } from "react";
import { MapPin, Calendar, Link as LinkIcon, Flag, ShieldCheck, Search, Plus, X, Clock, ChevronDown } from "lucide-react";
import { supabase } from "./supabaseClient";

const CATEGORIES = ["Musica", "Sagra", "Mercatino", "Sport", "Arte & Cultura", "Famiglia", "Nightlife", "Altro"];

const emptyForm = {
  titolo: "",
  categoria: CATEGORIES[0],
  data: "",
  ora: "",
  luogo: "",
  descrizione: "",
  gratuito: true,
  prezzo: "",
  organizzatore: "",
  email: "",
  telefono: "",
  link_verifica: "",
};

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isValidPhone(v) {
  return /^[+\d][\d\s]{6,}$/.test(v);
}
function isValidUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Tutte");
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  // Aggiorna i dati strutturati (Schema.org) ogni volta che la lista eventi cambia,
  // cosi Google e gli altri crawler possono leggere gli eventi come tali
  useEffect(() => {
    if (events.length === 0) return;

    const siteUrl = window.location.origin;
    const fallbackImage = `${siteUrl}/event-placeholder.png`;

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
        image: [fallbackImage],
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
    if (!isValidPhone(form.telefono)) e.telefono = "Numero non valido (es. +39 333 1234567)";
    if (!isValidUrl(form.link_verifica)) e.link_verifica = "Serve un link valido (sito, pagina social, Maps...)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const { error } = await supabase.from("eventi").insert([
      {
        ...form,
        ora: form.ora || null,
        prezzo: form.gratuito ? null : Number(form.prezzo),
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
    setShowForm(false);
    setToast({ type: "success", msg: "Evento inviato. Sara visibile dopo una rapida verifica." });
    setTimeout(() => setToast(null), 4000);
    fetchEvents();
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
    return events
      .filter((e) => categoryFilter === "Tutte" || e.categoria === categoryFilter)
      .filter((e) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          (e.titolo || "").toLowerCase().includes(q) ||
          (e.luogo || "").toLowerCase().includes(q) ||
          (e.descrizione || "").toLowerCase().includes(q)
        );
      });
  }, [events, query, categoryFilter]);

  return (
    <div className="min-h-screen bg-[#12203D] text-[#F4EFE6]">
      <header className="border-b border-[#2A3B60] px-5 py-6 sm:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-1">fomoas</p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold">Cosa si fa stasera?</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="shrink-0 inline-flex items-center gap-2 bg-[#E8A33D] text-[#12203D] font-semibold px-4 py-2.5 rounded-full hover:bg-[#F4C669] transition-colors"
          >
            <Plus size={18} /> Pubblica evento
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 mt-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8FA0C4]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca per nome, luogo, tipo di evento..."
              className="w-full bg-[#1A2C4E] border border-[#2A3B60] rounded-xl pl-10 pr-4 py-3 text-sm placeholder-[#7186B0] focus:outline-none focus:ring-2 focus:ring-[#E8A33D]"
            />
          </div>
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none bg-[#1A2C4E] border border-[#2A3B60] rounded-xl pl-4 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8A33D]"
            >
              <option>Tutte</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8FA0C4] pointer-events-none" />
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        {loading ? (
          <p className="text-[#8FA0C4] text-sm">Caricamento eventi...</p>
        ) : loadError ? (
          <div className="text-center py-16 border border-dashed border-[#B4544A] rounded-2xl">
            <p className="font-display text-lg mb-1">Impossibile caricare gli eventi</p>
            <p className="text-sm text-[#8FA0C4]">{loadError} — controlla la connessione a Supabase nel file .env</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[#2A3B60] rounded-2xl">
            <p className="font-display text-lg mb-1">La bacheca e ancora vuota qui</p>
            <p className="text-sm text-[#8FA0C4]">Pubblica il primo evento per iniziare a riempirla.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {filtered.map((e) => (
              <article key={e.id} className="relative bg-[#FBF6EC] text-[#1C2740] rounded-sm shadow-lg p-5 pt-6">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] tracking-wider uppercase bg-[#12203D] text-[#E8A33D] px-2 py-1 rounded-full">
                      {e.categoria}
                    </span>
                    <span className="text-[10px] tracking-wider uppercase bg-[#E3D9C4] text-[#5B4636] px-2 py-1 rounded-full">
                      {e.gratuito ? "Gratuito" : `€ ${Number(e.prezzo).toFixed(2)}`}
                    </span>
                  </div>
                  {e.verificato && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                      <ShieldCheck size={13} /> Verificato
                    </span>
                  )}
                </div>
                <h3 className="font-display text-lg font-semibold leading-snug mb-1">{e.titolo}</h3>
                <div className="text-xs text-[#5B4636] space-y-1 mb-3">
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
                    <MapPin size={13} /> {e.luogo}
                  </p>
                </div>
                {e.descrizione && <p className="text-sm text-[#3A3128] mb-3 leading-relaxed">{e.descrizione}</p>}
                <div className="flex items-center justify-between text-xs pt-3 border-t border-[#E3D9C4]">
                  <a
                    href={e.link_verifica}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#7A5A2E] hover:underline"
                  >
                    <LinkIcon size={12} /> Fonte
                  </a>
                  <button
                    onClick={() => handleReport(e.id)}
                    className="inline-flex items-center gap-1 text-[#8A2E2E] hover:underline"
                  >
                    <Flag size={12} /> Segnala {e.reports > 0 ? `(${e.reports})` : ""}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-6">
          <div className="bg-[#1A2C4E] border border-[#2A3B60] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A3B60] sticky top-0 bg-[#1A2C4E]">
              <h2 className="font-display text-lg font-semibold">Pubblica un evento</h2>
              <button onClick={() => setShowForm(false)} className="text-[#8FA0C4] hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                <input
                  value={form.luogo}
                  onChange={(e) => setForm({ ...form, luogo: e.target.value })}
                  className={inputCls(errors.luogo)}
                  placeholder="Piazza Garibaldi, Modena"
                />
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
                      className="accent-[#E8A33D]"
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
                {errors.prezzo && <span className="block text-xs text-[#F0857A] mt-1">{errors.prezzo}</span>}
              </Field>

              <Field label="Descrizione">
                <textarea
                  value={form.descrizione}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  className={inputCls() + " min-h-[70px]"}
                  placeholder="Due righe su cosa succede"
                />
              </Field>

              <div className="pt-2 border-t border-[#2A3B60]">
                <p className="text-xs text-[#E8A33D] font-medium mb-3">Dati per la verifica (non pubblicati integralmente)</p>

                <Field label="Chi organizza" error={errors.organizzatore}>
                  <input
                    value={form.organizzatore}
                    onChange={(e) => setForm({ ...form, organizzatore: e.target.value })}
                    className={inputCls(errors.organizzatore)}
                    placeholder="Pro Loco Modena / Nome e cognome"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Field label="Email" error={errors.email}>
                    <input
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputCls(errors.email)}
                      placeholder="tu@esempio.it"
                    />
                  </Field>
                  <Field label="Telefono" error={errors.telefono}>
                    <input
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      className={inputCls(errors.telefono)}
                      placeholder="+39 333 1234567"
                    />
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
                className="w-full bg-[#E8A33D] text-[#12203D] font-semibold py-3 rounded-xl hover:bg-[#F4C669] transition-colors disabled:opacity-60"
              >
                {submitting ? "Invio in corso..." : "Invia per la verifica"}
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1A2C4E] border border-[#2A3B60] px-4 py-2.5 rounded-full text-sm shadow-xl">
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#8FA0C4] mb-1.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-[#F0857A] mt-1">{error}</span>}
    </label>
  );
}

function inputCls(error) {
  return `w-full bg-[#12203D] border ${
    error ? "border-[#B4544A]" : "border-[#2A3B60]"
  } rounded-lg px-3.5 py-2.5 text-sm text-[#F4EFE6] placeholder-[#5F729C] focus:outline-none focus:ring-2 focus:ring-[#E8A33D]`;
}
