// operazioni.js — stati dell'operazione e checklist predefinita, condivisi
// da index.html (sezione "Operazione" della scheda) e config.html (riquadro
// "Checklist"). I dati stanno nella tabella operazioni (sql/operazioni.sql
// nel repo dello scanner); le voci predefinite si possono cambiare in
// Configurazione (parametro checklist_modello della tabella config).
(function () {
  // Percorso principale, in ordine; "persa" e "non_partecipo" sono uscite.
  const PERCORSO = ["valutazione", "offerta", "aggiudicata", "saldo", "consegna", "cantiere", "in_vendita", "venduta"];
  const STATI = {
    valutazione:   { etichetta: "In valutazione",      icona: "🔍" },
    offerta:       { etichetta: "Offerta presentata",  icona: "📨" },
    aggiudicata:   { etichetta: "Aggiudicata",         icona: "🏆" },
    persa:         { etichetta: "Persa",               icona: "✖" },
    saldo:         { etichetta: "Saldo versato",       icona: "💶" },
    consegna:      { etichetta: "Immobile consegnato", icona: "🔑" },
    cantiere:      { etichetta: "Cantiere",            icona: "🔨" },
    in_vendita:    { etichetta: "In vendita",          icona: "🏷️" },
    venduta:       { etichetta: "Venduta",             icona: "✅" },
    non_partecipo: { etichetta: "Non partecipo",       icona: "🚫" },
  };
  // Stati protetti da "Elimina scadute" (stessa lista di _asta_con_operazione).
  const PROTETTI = ["offerta", "aggiudicata", "persa", "saldo", "consegna", "cantiere", "in_vendita", "venduta"];
  // "Operazioni in corso" nel filtro del registro.
  const IN_CORSO = ["valutazione", "offerta", "aggiudicata", "saldo", "consegna", "cantiere", "in_vendita"];

  const CHECKLIST_PREDEFINITA = {
    prima: [
      "Perizia letta per intero",
      "Avviso di vendita letto (condizioni, termini, cauzione)",
      "Visura ipotecaria aggiornata",
      "Accesso agli atti in Comune",
      "Arretrati confermati dall'amministratore",
      "Stato degli impianti",
      "Confini e catasto",
      "Occupazione verificata con il custode",
      "Fondi o mutuo pronti",
    ],
    dopo: [
      "Saldo del prezzo",
      "Decreto di trasferimento",
      "Cambio serratura",
      "Volture delle utenze",
    ],
  };
  // Voce automatica: spuntata dalla visita segnata come fatta.
  const VOCE_VISITA = "Visita fatta";

  // checklist_modello della tabella config (testo JSON) → {prima, dopo};
  // se manca o non è valido, le voci predefinite.
  function modelloChecklist(testo) {
    const pulisci = (lista) => Array.isArray(lista)
      ? [...new Set(lista.map(v => String(v || "").trim()).filter(v => v && v !== VOCE_VISITA))] : null;
    try {
      const m = typeof testo === "string" ? JSON.parse(testo) : testo;
      const prima = pulisci(m && m.prima), dopo = pulisci(m && m.dopo);
      if (prima && dopo) return { prima, dopo };
    } catch (e) { /* predefinite */ }
    return { prima: [...CHECKLIST_PREDEFINITA.prima], dopo: [...CHECKLIST_PREDEFINITA.dopo] };
  }

  window.Operazioni = { PERCORSO, STATI, PROTETTI, IN_CORSO, CHECKLIST_PREDEFINITA, VOCE_VISITA, modelloChecklist };
})();
