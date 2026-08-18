// Indirizzi leggibili per le pagine evento:
//   /evento/sagra-del-gatto-ignorante-19-agosto-2026
// invece del solo codice interno. Aiutano chi legge il link prima di
// aprirlo e danno ai motori di ricerca le parole dell'evento nell'URL.
//
// Lo spicchio di data in fondo non e' decorativo: e' quello che rende
// possibile ritrovare l'evento senza aggiungere colonne al database. Dallo
// slug si ricava la data, si chiedono i pochi eventi di quel giorno e si
// cerca fra loro quello col titolo corrispondente.

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export function slugifica(testo) {
  return String(testo || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

// "2026-08-19" -> "19-agosto-2026"
export function dataInParole(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""));
  if (!m) return "";
  const [, anno, mese, giorno] = m;
  return `${Number(giorno)}-${MESI[Number(mese) - 1]}-${anno}`;
}

export function slugEvento(e) {
  const titolo = slugifica(e.titolo);
  const data = dataInParole(e.data);
  return [titolo, data].filter(Boolean).join("-") || String(e.id);
}

export function urlEvento(e, siteUrl = "") {
  return `${siteUrl}/evento/${slugEvento(e)}`;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function eUnCodice(param) {
  return RE_UUID.test(String(param || ""));
}

// Dallo slug ricava la data ISO e la parte di titolo, per poter cercare
// l'evento. Restituisce null se lo slug non finisce con una data valida
// (per esempio un vecchio indirizzo o un link storpiato).
export function leggiSlug(slug) {
  const pezzi = String(slug || "").split("-");
  if (pezzi.length < 3) return null;

  const anno = pezzi[pezzi.length - 1];
  const mese = pezzi[pezzi.length - 2];
  const giorno = pezzi[pezzi.length - 3];
  const iMese = MESI.indexOf(mese);
  if (!/^\d{4}$/.test(anno) || iMese === -1 || !/^\d{1,2}$/.test(giorno)) return null;

  return {
    data: `${anno}-${String(iMese + 1).padStart(2, "0")}-${String(Number(giorno)).padStart(2, "0")}`,
    titolo: pezzi.slice(0, -3).join("-"),
  };
}
