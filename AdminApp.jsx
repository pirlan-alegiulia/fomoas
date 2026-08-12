import { useState, useEffect } from "react";
import { ShieldCheck, Trash2, Flag, LogOut, Loader2, Lock } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#12203D] flex items-center justify-center text-[#8FA0C4]">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return session ? <Dashboard /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(ev) {
    ev.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("Email o password non corrette.");
  }

  return (
    <div className="min-h-screen bg-[#12203D] flex items-center justify-center p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-[#1A2C4E] border border-[#2A3B60] rounded-2xl p-7"
      >
        <div className="flex items-center gap-2 mb-1 text-[#E8A33D]">
          <Lock size={18} />
          <span className="text-xs tracking-[0.2em] uppercase">Area riservata</span>
        </div>
        <h1 className="font-display text-xl font-semibold text-[#F4EFE6] mb-6">Accesso amministratore</h1>

        <label className="block mb-3">
          <span className="block text-xs text-[#8FA0C4] mb-1.5">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#12203D] border border-[#2A3B60] rounded-lg px-3.5 py-2.5 text-sm text-[#F4EFE6] focus:outline-none focus:ring-2 focus:ring-[#E8A33D]"
          />
        </label>

        <label className="block mb-5">
          <span className="block text-xs text-[#8FA0C4] mb-1.5">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#12203D] border border-[#2A3B60] rounded-lg px-3.5 py-2.5 text-sm text-[#F4EFE6] focus:outline-none focus:ring-2 focus:ring-[#E8A33D]"
          />
        </label>

        {error && <p className="text-xs text-[#F0857A] mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#E8A33D] text-[#12203D] font-semibold py-2.5 rounded-lg hover:bg-[#F4C669] transition-colors disabled:opacity-60"
        >
          {loading ? "Accesso in corso..." : "Accedi"}
        </button>
      </form>
    </div>
  );
}

function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("da_verificare");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    setLoading(true);
    const { data } = await supabase.from("eventi").select("*").order("created_at", { ascending: false });
    setEvents(data || []);
    setLoading(false);
  }

  async function toggleVerificato(id, current) {
    setBusyId(id);
    await supabase.from("eventi").update({ verificato: !current }).eq("id", id);
    await fetchEvents();
    setBusyId(null);
  }

  async function deleteEvent(id) {
    if (!confirm("Eliminare definitivamente questo evento?")) return;
    setBusyId(id);
    await supabase.from("eventi").delete().eq("id", id);
    await fetchEvents();
    setBusyId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const filtered = events.filter((e) => {
    if (filter === "da_verificare") return !e.verificato;
    if (filter === "verificati") return e.verificato;
    if (filter === "segnalati") return (e.reports || 0) > 0;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#12203D] text-[#F4EFE6]">
      <header className="border-b border-[#2A3B60] px-5 py-5 sm:px-8 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-1">fomoas</p>
          <h1 className="font-display text-xl font-semibold">Pannello moderazione</h1>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 text-xs text-[#8FA0C4] hover:text-[#F4EFE6] border border-[#2A3B60] rounded-full px-3 py-1.5"
        >
          <LogOut size={13} /> Esci
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6">
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            ["da_verificare", "Da verificare"],
            ["verificati", "Verificati"],
            ["segnalati", "Segnalati"],
            ["tutti", "Tutti"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3.5 py-2 rounded-full border transition-colors ${
                filter === key
                  ? "bg-[#E8A33D] text-[#12203D] border-[#E8A33D] font-semibold"
                  : "border-[#2A3B60] text-[#8FA0C4] hover:text-[#F4EFE6]"
              }`}
            >
              {label} {key !== "tutti" && `(${events.filter((e) => (key === "da_verificare" ? !e.verificato : key === "verificati" ? e.verificato : (e.reports || 0) > 0)).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[#8FA0C4] text-sm">Caricamento...</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#8FA0C4] text-sm">Nessun evento in questa categoria.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="bg-[#1A2C4E] border border-[#2A3B60] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-display font-semibold">{e.titolo}</h3>
                    {e.verificato && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <ShieldCheck size={12} /> Verificato
                      </span>
                    )}
                    {e.reports > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#F0857A]">
                        <Flag size={12} /> {e.reports} segnalazion{e.reports === 1 ? "e" : "i"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8FA0C4] mb-1">
                    {e.categoria} · {new Date(e.data).toLocaleDateString("it-IT")} · {e.luogo}
                  </p>
                  <p className="text-xs text-[#8FA0C4]">
                    Organizzatore: {e.organizzatore} · {e.email} · {e.telefono}
                  </p>
                  <a
                    href={e.link_verifica}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#E8A33D] hover:underline"
                  >
                    Verifica fonte →
                  </a>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={busyId === e.id}
                    onClick={() => toggleVerificato(e.id, e.verificato)}
                    className={`text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                      e.verificato
                        ? "border-[#2A3B60] text-[#8FA0C4] hover:text-[#F4EFE6]"
                        : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                    }`}
                  >
                    {e.verificato ? "Rimuovi verifica" : "Approva"}
                  </button>
                  <button
                    disabled={busyId === e.id}
                    onClick={() => deleteEvent(e.id)}
                    className="text-xs px-3 py-2 rounded-lg border border-[#B4544A]/40 text-[#F0857A] hover:bg-[#B4544A]/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
