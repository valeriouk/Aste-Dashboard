// operazioni.js — stati dell'operazione e checklist predefinita, condivisi
// da index.html (sezione "Operazione" della scheda) e config.html (riquadro
// "Checklist"). I dati stanno nella tabella operazioni (sql/operazioni.sql
// nel repo dello scanner); le voci predefinite si possono cambiare in
// Configurazione (parametro checklist_modello della tabella config).
// Contiene anche il conto reale dell'operazione e il consuntivo (stima
// all'offerta contro numeri veri): funzioni pure, provate da
// test_operazioni.js nel repo dello scanner (per questo si caricano anche
// con require).
(function (radice) {
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

  // ------------------------------------------------------------ conto reale
  // Finanziamento e spese reali (operazioni.conto), in quest'ordine nel modulo.
  const CAMPI_CONTO = [
    ["capitale_proprio", "Capitale tuo investito", "euro"],
    ["mutuo_importo", "Mutuo o prestito", "euro"],
    ["mutuo_tasso", "Tasso annuo (%)", "percentuale"],
    ["mutuo_spese", "Spese del mutuo (istruttoria, perizia, notaio)", "euro"],
    ["mutuo_dal", "Mutuo erogato il", "data"],
    ["mutuo_al", "Mutuo estinto il", "data"],
    ["imposte_acquisto", "Imposte d'acquisto pagate", "euro"],
    ["spese_procedura", "Delegato e spese di procedura", "euro"],
    ["notaio_tecnico", "Tecnico, pratiche, notaio", "euro"],
    ["condominio_arretrato", "Condominio arretrato pagato", "euro"],
    ["spese_mensili", "Spese di detenzione al mese (IMU, utenze, condominio)", "euro"],
    ["agenzia_vendita", "Agenzia e spese di vendita", "euro"],
    ["altre_spese", "Altre spese", "euro"],
  ];
  const GIORNI_MESE = 30.44;
  const numero = (v) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
  const giorno = (v) => { if (!v) return null; const d = v instanceof Date ? new Date(v) : new Date(`${String(v).slice(0, 10)}T12:00:00`); return isNaN(d) ? null : d; };
  const giorniTra = (a, b) => (a && b ? Math.max(0, Math.round((b - a) / 86400000)) : 0);

  // o = riga di operazioni; opzioni = {regimeFiscale: 'privato'|'impresa',
  // aliquotaPlusvalenza (0.26), aliquotaImpresa (0.279), oggi, rivenditaStimata}.
  // Periodo: dall'aggiudicazione (o dal saldo) alla vendita, o a oggi.
  // Interessi semplici sul mutuo per i giorni in cui è aperto. Imposte come
  // nella Superanalisi: privato 26% sulla plusvalenza (utile + detenzione,
  // interessi, spese del mutuo e condominio, che per un privato non si
  // deducono); impresa: aliquota sull'utile. null senza prezzo di aggiudicazione.
  function contoReale(o, opzioni) {
    const op = Object.assign({ regimeFiscale: "privato", aliquotaPlusvalenza: 0.26, aliquotaImpresa: 0.279, oggi: new Date(), rivenditaStimata: null }, opzioni || {});
    const prezzo = numero(o && o.prezzo_aggiudicazione);
    if (!prezzo) return null;
    const c = (o && o.conto) || {};
    const v = (k) => numero(c[k]) || 0;
    const oggi = giorno(op.oggi) || new Date();
    const inizio = giorno(o.aggiudicata_il) || giorno(o.saldo_versato_il);
    const venduta = numero(o.prezzo_vendita) > 0;
    const fine = (venduta && giorno(o.venduta_il)) || oggi;
    const mesi = inizio ? giorniTra(inizio, fine) / GIORNI_MESE : 0;
    const inizioMutuo = giorno(c.mutuo_dal) || giorno(o.saldo_versato_il) || inizio;
    const fineMutuo = giorno(c.mutuo_al) || fine;
    const interessi = v("mutuo_importo") * v("mutuo_tasso") / 100 * giorniTra(inizioMutuo, fineMutuo) / 365;
    const voci = {
      prezzo, imposte_acquisto: v("imposte_acquisto"), spese_procedura: v("spese_procedura"), notaio_tecnico: v("notaio_tecnico"),
      condominio_arretrato: v("condominio_arretrato"), lavori: numero(o.costo_lavori_reale) || 0, detenzione: v("spese_mensili") * mesi,
      interessi, mutuo_spese: v("mutuo_spese"), agenzia_vendita: v("agenzia_vendita"), altre_spese: v("altre_spese"),
    };
    const costi = Object.values(voci).reduce((s, x) => s + x, 0);
    const ricavo = venduta ? numero(o.prezzo_vendita) : numero(op.rivenditaStimata);
    const utile = ricavo === null ? null : ricavo - costi;
    const imposta = utile === null ? null : op.regimeFiscale === "impresa"
      ? Math.max(0, op.aliquotaImpresa * utile)
      : Math.max(0, op.aliquotaPlusvalenza * (utile + voci.detenzione + voci.interessi + voci.mutuo_spese + voci.condominio_arretrato));
    const netto = utile === null ? null : utile - imposta;
    const capitaleTuo = v("capitale_proprio");
    const capitale = capitaleTuo > 0 ? capitaleTuo : Math.max(0, costi - voci.agenzia_vendita - v("mutuo_importo"));
    const rendimento = netto !== null && capitale > 0 ? netto / capitale : null;
    return {
      voci, costi, ricavo, ricavoStimato: !venduta && ricavo !== null, venduta, utile, imposta, netto,
      capitale, capitaleStimato: !(capitaleTuo > 0), mesi,
      rendimentoPct: rendimento === null ? null : rendimento * 100,
      rendimentoAnnuoPct: rendimento === null || mesi < 1 ? null : rendimento * 100 * 12 / mesi,
      regimeFiscale: op.regimeFiscale === "impresa" ? "impresa" : "privato",
    };
  }

  // Consuntivo: la stima salvata all'offerta (o.stima_offerta) contro i
  // numeri veri, voce per voce, solo dove ci sono entrambi.
  function consuntivo(o, reale) {
    const s = o && o.stima_offerta;
    if (!s) return [];
    const righe = [
      ["Prezzo d'acquisto", s.prezzo, numero(o.prezzo_aggiudicazione), "euro"],
      ["Lavori", s.lavori, numero(o.costo_lavori_reale), "euro"],
      ["Prezzo di vendita", s.arv, numero(o.prezzo_vendita), "euro"],
      ["Mesi dall'aggiudicazione alla vendita", s.mesi, reale && reale.venduta ? Math.round(reale.mesi * 10) / 10 : null, "mesi"],
      ["Utile netto", s.utile_netto, reale && reale.venduta ? Math.round(reale.netto) : null, "euro"],
    ];
    return righe.filter(([, stimato, vero]) => numero(stimato) !== null && vero !== null)
      .map(([voce, stimato, vero, tipo]) => ({ voce, stimato: Number(stimato), reale: vero, tipo,
        scarto: vero - Number(stimato), scartoPct: Number(stimato) ? (vero - Number(stimato)) / Math.abs(Number(stimato)) * 100 : null }));
  }

  // Parametri dei conti dalla tabella config (testi) → numeri, con i predefiniti.
  function parametriConti(grezzi) {
    const g = grezzi || {};
    const n = (v, predefinito) => { const x = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(x) ? predefinito : x; };
    return {
      regimeFiscale: g.regime_fiscale === "impresa" ? "impresa" : "privato",
      aliquotaImpresa: n(g.aliquota_impresa, 0.279),
      registroImpresa: n(g.registro_impresa, 0.09),
      scontoTrattativaComparabili: n(g.sconto_trattativa_comparabili, 0.05),
    };
  }

  const API = { PERCORSO, STATI, PROTETTI, IN_CORSO, CHECKLIST_PREDEFINITA, VOCE_VISITA, modelloChecklist,
    CAMPI_CONTO, contoReale, consuntivo, parametriConti };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (radice) radice.Operazioni = API;
})(typeof window !== "undefined" ? window : null);
