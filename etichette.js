/**
 * etichette.js — testi leggibili condivisi tra le pagine (01/10/2026):
 * nomi delle tipologie PVP, lotto, tribunale, numeri e date all'italiana.
 * Solo per mostrare: ricerca, filtri e CSV continuano a usare i valori grezzi.
 *
 * Etichette.tipologia("POSTO_AUTO, POSTO_AUTO")  → "Posto auto"
 * Etichette.lotto("LOTTO UNICO")                 → "Lotto unico"
 * Etichette.tribunale("Tribunale di CATANIA")    → "Tribunale di Catania"
 * Etichette.nomeTribunale("Tribunale di CATANIA")→ "Catania"
 * Etichette.numero(16.6)                         → "16,6"
 * Etichette.data("2026-05-03")                   → "03/05/2026"
 */
(function () {
  'use strict';

  // Nomi leggibili dei codici PVP. Codice sconosciuto: minuscolo senza trattini bassi.
  const NOMI_TIPOLOGIA = {
    ABITAZIONE_TIPO_CIV: "Abitazione civile", ABITAZIONE_TIPO_ECO: "Abitazione economica",
    ABITAZIONE_TIPO_POP: "Abitazione popolare", ABITAZIONE_TIPO_UPOP: "Abitazione ultrapopolare",
    ABITAZIONE_TIPO_RUR: "Abitazione rurale", ABITAZIONE_IN_VILLINI: "Villino", APPARTAMENTO: "Appartamento",
    GARAGE_AUTORIMESSA: "Garage", POSTO_AUTO: "Posto auto", TETTOIE_CHIUSE_APERTE: "Tettoia",
    NEGOZIO: "Negozio", NEGOZI_BOTTEGHE: "Negozio", UFFICIO: "Ufficio", UFFICI_E_STUDI: "Ufficio o studio",
    LABORATORI_ARTI: "Laboratorio", LABORATORIO_ARTIGIANO: "Laboratorio artigiano", ISTITUTO_CREDITO_CAMBIO: "Istituto di credito",
    TERRENO: "Terreno", DEPOSITO: "Deposito", MAGAZZINO: "Magazzino", MAGAZZINI_E_DEPOSITO: "Magazzino o deposito",
    CANTINA: "Cantina", STALLE_SCUDERIE_RIMESSE: "Rimessa", FABBRICATI_COSTRUITI_PER_ESIGENZE_IND: "Fabbricato industriale",
    FABBRICATO: "Fabbricato", FABBRICATO_IN_COSTR: "Fabbricato in costruzione", FABBRICATI_COMMERCIALI: "Fabbricato commerciale",
    COMPENDIO_PIGNORATO: "Compendio pignorato", LASTRICO_SOLARE: "Lastrico solare", PORZIONE_DI_IMMOBILE: "Porzione di immobile",
  };

  // "POSTO_AUTO, GARAGE_AUTORIMESSA" → "Posto auto + Garage" (senza ripetizioni).
  function tipologia(grezza) {
    const voci = String(grezza || "").split(",").map((t) => t.trim()).filter((t) => t && t !== "N/D");
    if (!voci.length) return "N/D";
    const nomi = voci.map((t) => NOMI_TIPOLOGIA[t] || (t.charAt(0) + t.slice(1).toLowerCase()).replace(/_/g, " "));
    return [...new Set(nomi)].join(" + ");
  }

  // Testo tutto maiuscolo → iniziali maiuscole ("SANTA MARIA CAPUA VETERE" →
  // "Santa Maria Capua Vetere", "BARCELLONA POZZO DI GOTTO" → "... di Gotto",
  // "L'AQUILA" → "L'Aquila"). Un testo già scritto normalmente resta com'è.
  const MINUSCOLE = new Set(["di", "del", "della", "dei", "degli", "delle", "de", "e", "in", "sul", "sulla"]);
  function iniziali(testo) {
    const t = String(testo || "");
    if (!t || t !== t.toUpperCase()) return t;
    return t.toLowerCase().split(" ").map((parola, i) => (i > 0 && MINUSCOLE.has(parola) ? parola
      : parola.replace(/(^|['’-])(\p{L})/gu, (m, prima, lettera) => prima + lettera.toUpperCase()))).join(" ");
  }

  // Il PVP a volte scrive già "Lotto…" nel numero di lotto ("LOTTO UNICO").
  function lotto(grezzo) {
    const t = String(grezzo || "").trim();
    if (!t) return "";
    const senzaParola = t.replace(/^lotto\s*/i, "");
    if (!senzaParola) return "Lotto";
    // parole in maiuscolo ("UNICO") in minuscolo; numeri e lettere ("4", "A", "3B") restano
    return "Lotto " + (/^[A-ZÀ-Ý ]{3,}$/.test(senzaParola) ? senzaParola.toLowerCase() : senzaParola);
  }

  function tribunale(grezzo) {
    const t = String(grezzo || "").trim();
    const m = t.match(/^(tribunale\s+(?:di|del|della)\s+)(.+)$/i);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + iniziali(m[2]) : iniziali(t);
  }

  function nomeTribunale(grezzo) {
    return tribunale(grezzo).replace(/^Tribunale\s+(?:di|del|della)\s+/, "");
  }

  // Numero con la virgola decimale e il punto delle migliaia.
  function numero(n, decimali) {
    const v = Number(n);
    if (n === null || n === undefined || n === "" || !isFinite(v)) return "—";
    // a mano: con toLocaleString "1234" resterebbe senza punto (le pagine lo mettono sempre)
    const fattore = Math.pow(10, decimali == null ? 1 : decimali);
    const arrotondato = Math.round(Math.abs(v) * fattore) / fattore;
    const [intera, dec] = String(arrotondato).split(".");
    return (v < 0 && arrotondato ? "-" : "") + intera.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? "," + dec : "");
  }

  // "2026-05-03" (anche con l'ora) → "03/05/2026"; altro testo resta com'è.
  function data(valore) {
    const m = String(valore || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valore || "");
  }

  const api = { NOMI_TIPOLOGIA, tipologia, lotto, tribunale, nomeTribunale, numero, data, iniziali };
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.Etichette = api;
})();
