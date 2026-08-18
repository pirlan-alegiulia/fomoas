import { useState } from "react";
import { Link as LinkIcon, Check, Download } from "lucide-react";
import { dataEstesa } from "./eventoStile";

// Kit per far girare l'evento sui social. Facebook e WhatsApp mostrano
// l'anteprima leggendo i tag Open Graph della pagina, quindi li' basta il
// link. Instagram invece non fa anteprime dei link: serve un'immagine vera
// da scaricare e pubblicare, ed e' quella che generiamo in formato verticale.
export default function PannelloSocial({ evento }) {
  const [copiato, setCopiato] = useState(false);
  // Sempre il permalink dell'evento, non l'indirizzo della pagina corrente:
  // questo pannello compare anche subito dopo la pubblicazione, quando si
  // e' ancora sulla bacheca.
  const url = `${typeof window !== "undefined" ? window.location.origin : "https://www.fomoas.com"}/evento/${evento.id}`;
  const locandinaPost = `/api/locandina?id=${evento.id}&formato=post`;
  const testo = `${evento.titolo} — ${dataEstesa(evento.data)} a ${evento.luogo}`;

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      // niente permessi sugli appunti: il link resta comunque selezionabile
    }
  }

  return (
    <section className="mt-6 bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-[#1B2444]">
      <h2 className="font-display text-xl font-bold mb-1">Fai girare l'evento</h2>
      <p className="text-sm text-[#4A5578] mb-5">
        Abbiamo preparato una locandina con tutti i dati: pronta da pubblicare.
      </p>

      <div className="sm:flex sm:gap-6">
        <img
          src={locandinaPost}
          alt={`Locandina di ${evento.titolo}`}
          className="w-full sm:w-56 shrink-0 rounded-xl border border-[#E2E8F0] mb-5 sm:mb-0"
        />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8A93AD] mb-2">Instagram</p>
          <p className="text-sm text-[#4A5578] mb-3">
            Instagram non mostra l'anteprima dei link: scarica la locandina e pubblicala, mettendo il link nella
            bio o nelle storie.
          </p>
          <a
            href={locandinaPost}
            download={`fomoas-${evento.id}.png`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#2F63D4] text-white font-bold rounded-xl px-4 py-2.5 text-sm hover:bg-[#3A72E6] transition-colors mb-6"
          >
            <Download size={15} /> Scarica la locandina
          </a>

          <p className="text-xs font-bold uppercase tracking-wider text-[#8A93AD] mb-2">Facebook e WhatsApp</p>
          <p className="text-sm text-[#4A5578] mb-3">
            Qui basta il link: l'anteprima con la locandina compare da sola.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-[#F1F5F9] transition-colors"
            >
              Facebook
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${testo} ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-[#F1F5F9] transition-colors"
            >
              WhatsApp
            </a>
            <button
              onClick={copiaLink}
              className="inline-flex items-center gap-2 border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-[#F1F5F9] transition-colors"
            >
              {copiato ? <Check size={15} /> : <LinkIcon size={15} />}
              {copiato ? "Link copiato" : "Copia il link"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
