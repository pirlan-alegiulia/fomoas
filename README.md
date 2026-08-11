# fomoas — versione beta

Bacheca eventi con form di pubblicazione, verifica base e ricerca/filtri.

## 1. Crea il progetto Supabase (database)

1. Vai su https://supabase.com → crea un account gratuito → "New project".
2. Dai un nome al progetto (es. `fomoas`) e imposta una password del database (salvala da parte, non serve nel codice ma serve se accedi al database direttamente).
3. Attendi 1-2 minuti che il progetto sia pronto.
4. Vai su **SQL Editor** (menu a sinistra) → **New query** → incolla tutto il contenuto del file `supabase_setup.sql` incluso in questo progetto → **Run**.
   Questo crea la tabella `eventi` con le colonne giuste e le regole di accesso base.
5. Vai su **Project Settings → API**. Ti servono due valori:
   - **Project URL**
   - **anon public key**

## 2. Configura il progetto in locale

1. Installa [Node.js](https://nodejs.org) se non ce l'hai già (versione 18 o superiore).
2. Apri il terminale nella cartella del progetto ed esegui:
   ```
   npm install
   ```
3. Copia `.env.example` in un nuovo file chiamato `.env`:
   ```
   cp .env.example .env
   ```
4. Apri `.env` e incolla i due valori presi da Supabase al passo 1.5:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=la-tua-chiave-anon-pubblica
   ```
5. Avvia il sito in locale per controllare che funzioni:
   ```
   npm run dev
   ```
   Apri l'indirizzo che appare nel terminale (di solito `http://localhost:5173`) e prova a pubblicare un evento di test.

## 3. Metti il sito online (Vercel)

1. Crea un account su https://vercel.com (puoi accedere con GitHub).
2. Carica questo progetto su un repository GitHub (crea un repo vuoto su github.com, poi da terminale nella cartella del progetto:
   ```
   git init
   git add .
   git commit -m "Prima versione fomoas"
   git branch -M main
   git remote add origin <url-del-tuo-repo>
   git push -u origin main
   ```
   ATTENZIONE: il file `.env` non va mai caricato su GitHub (contiene le tue chiavi) — è già escluso automaticamente se usi il `.gitignore` incluso in questo progetto.
3. Su Vercel: **Add New Project** → seleziona il repository appena creato.
4. Prima di fare deploy, apri **Environment Variables** e inserisci le stesse due variabili del file `.env` (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`).
5. Clicca **Deploy**. In 1-2 minuti il sito è online su un indirizzo tipo `fomoas.vercel.app`.

## 4. Collega il dominio fomoas

1. Su Vercel, dentro il progetto: **Settings → Domains** → aggiungi il tuo dominio.
2. Vercel ti mostrerà i record DNS da impostare (di solito un record A o CNAME).
3. Vai dal tuo registrar (dove hai comprato il dominio) → sezione gestione DNS → inserisci i record indicati da Vercel.
4. La propagazione può richiedere da pochi minuti a qualche ora.

## Cosa manca ancora (fasi successive)

- Verifica reale via OTP di email/telefono (oggi è solo controllo di formato)
- Pannello admin per approvare eventi ed esaminare le segnalazioni
- Server MCP per l'accesso diretto delle IA al contenitore
- Generazione automatica di pagina evento (testo + immagini) e pubblicazione sui social
