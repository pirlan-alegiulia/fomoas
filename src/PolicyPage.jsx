export default function PolicyPage() {
  return (
    <div className="min-h-screen bg-[#FF8000] text-white">
      <header className="border-b border-white/25 px-5 py-6 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs tracking-[0.2em] uppercase text-white/80 mb-1">fomoas</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Termini e Privacy Policy</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10">
        <div className="bg-[#4D8AFF] border border-white/25 rounded-2xl p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-white/95">
          <p className="text-xs text-white/70">
            Bozza iniziale, in attesa della versione definitiva. Ultimo aggiornamento: agosto 2026.
          </p>

          <section>
            <h2 className="font-display text-lg font-semibold mb-2">1. Chi siamo</h2>
            <p>
              fomoas è una bacheca di eventi locali. Pubblicando un evento accetti queste condizioni e il
              trattamento dei tuoi dati come descritto di seguito.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold mb-2">2. Dati che raccogliamo</h2>
            <p>
              Quando ti registri raccogliamo la tua email, usata solo per l'accesso tramite link magico (nessuna
              password viene mai richiesta o salvata). Quando pubblichi un evento raccogliamo inoltre: titolo,
              luogo, data, descrizione, nome dell'organizzatore, email e telefono di contatto, ed eventuale foto
              caricata. Questi dati sono necessari per mostrare l'evento e permetterti di modificarlo o
              cancellarlo in futuro.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold mb-2">3. Come usiamo i tuoi dati</h2>
            <p>
              I dati dell'evento sono pubblici e visibili a chiunque visiti il sito. L'email di accesso non viene
              mai mostrata pubblicamente e non viene condivisa con terzi né usata per scopi diversi dall'accesso al
              tuo account. Non vendiamo i tuoi dati a nessuno.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold mb-2">4. Servizi di terze parti</h2>
            <p>
              Per far funzionare fomoas ci appoggiamo a: Supabase (database, autenticazione e archiviazione
              immagini), Anthropic (generazione assistita di descrizioni e ricerca eventi), Google Maps e Mapbox
              (geolocalizzazione e mappe). Ciascuno di questi servizi tratta i dati secondo le proprie policy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold mb-2">5. Cancellazione automatica</h2>
            <p>
              Gli eventi vengono rimossi automaticamente dal sito una volta passata la loro data. Puoi anche
              modificare o cancellare un tuo evento in qualsiasi momento accedendo con la tua email.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold mb-2">6. I tuoi diritti</h2>
            <p>
              Puoi richiedere in qualsiasi momento la cancellazione del tuo account e di tutti i dati associati
              scrivendo a{" "}
              <a href="mailto:alessio.bortolan@gmail.com" className="underline font-semibold">
                alessio.bortolan@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
