/**
 * underwriting.js — Scanner aste v2
 *
 * Motore di calcolo DETERMINISTICO. Qui dentro non c'è AI: solo formule esplicite
 * e parametri dichiarati, verificabili con test_underwriting.js.
 *
 * Flusso:
 *   estrazione Gemini v2 (fatti) + dati annuncio PVP + parametri utente
 *   → normalizza → qualità dati → superficie → costi → ARV
 *   → MAX_BID / HEADROOM → classe operazione → verdetto
 *
 * Funziona nel browser (window.Underwriting) e in Node (require).
 *
 * I parametri marcati (STIMA) sono ipotesi di default, NON dati:
 * vanno tarati sulle tabelle già presenti in index.html e sulle operazioni reali.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Underwriting = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ===========================================================================
  // PARAMETRI (per utente / progetto)
  // ===========================================================================
  const PARAMETRI_DEFAULT = {
    // Obiettivo
    utileTarget: 20000,              // utile richiesto nello scenario CENTRALE
    utileMinimoPrudenziale: 10000,   // utile minimo accettabile anche nello scenario PRUDENZIALE
    targetNetto: false,              // true = l'utile target è al netto della stima d'imposta sulla plusvalenza
    aliquotaPlusvalenza: 0.26,       // (STIMA) imposta sostitutiva plusvalenze: verificare regime personale col commercialista

    // Acquisto
    acquirente: 'persona_fisica',    // 'persona_fisica' | 'societa' (prezzo-valore solo persone fisiche; regime società NON modellato)
    primaCasa: false,
    speseProceduraAggiudicatario: 'auto', // 'auto' = compenso delegato con le STESSE fasce di index.html (compensoDelegato) + speseVarieProcedura; oppure un importo fisso
    speseVarieProcedura: 300,         // (STIMA) bolli, copie, visure, marche: si somma al compenso delegato quando 'auto'
    tecnicoPratiche: 2500,           // (STIMA) tecnico, CILA/SCIA, APE, aggiornamenti catastali

    // Lavori
    costoLavoriMq: {                 // (STIMA) €/mq di superficie lorda → sostituire con la tabella di index.html
      A_pronto: 0,
      B_rinfrescare: 80,
      C_rimodernare: 250,
      D_ristrutturare: 480,
      E_degrado: 700,
    },
    ricaricoLavoriCtu: 0.30,         // (STIMA) la stima lavori CTU serve a "rendere fruibile", non a produrre un immobile da flip
    imprevistiPct: 0.10,             // (STIMA) su lavori + regolarizzazione
    ricaricoRegolarizzazione: 0.25,  // (STIMA) margine prudenziale sulle stime CTU di sanatoria/ripristino

    // Detenzione
    costoMensileHolding: 150,        // (STIMA) IMU seconda casa, utenze, condominio, assicurazione
    mesiOperazione: {                // (STIMA) aggiudicazione → rogito di vendita
      libero:                      { prudenziale: 12, centrale: 9,  ottimistico: 7 },
      occupato_debitore:           { prudenziale: 18, centrale: 12, ottimistico: 9 },
      occupato_terzi_senza_titolo: { prudenziale: 24, centrale: 15, ottimistico: 10 },
      locato_non_opponibile:       { prudenziale: 24, centrale: 15, ottimistico: 10 },
      locato_opponibile:           { prudenziale: 36, centrale: 24, ottimistico: 18 },
      altro:                       { prudenziale: 24, centrale: 18, ottimistico: 12 },
      non_indicato:                { prudenziale: 18, centrale: 12, ottimistico: 9 },
    },
    mesiExtraCondono: 12,            // (STIMA) aggiunti allo scenario prudenziale se c'è un condono pendente

    // Vendita
    commissioneVenditaPct: 0.0366,   // 3% + IVA
    costiVenditaFissi: 500,          // (STIMA) APE, dichiarazioni di conformità, visure

    // Superficie e ARV
    coefficientiSuperficie: { balconi: 0.30, giardino: 0.10, box: 0.50, cantina: 0.25 },
    posizioneRangeOmi: { prudenziale: 0.50, centrale: 0.75, ottimistico: 1.00 }, // (STIMA) da calibrare
    proxyCtu: { prudenziale: 0.85, centrale: 0.95, ottimistico: 1.05 },         // (STIMA) solo se perizia recente e manca OMI
    moltiplicatoreLavori: { prudenziale: 1.20, centrale: 1.00, ottimistico: 1.00 },

    // Filtro "operazione pulita"
    comuniTarget: [],                // es. ['Mascalucia', 'Viagrande', 'Zafferana Etnea']; vuoto = nessun filtro zona
    maxEtaPeriziaAnni: 3,
    maxCostoRegolarizzazionePulita: 5000,
    griglieTarget: [15000, 20000, 25000],

    dataRiferimento: null,           // 'AAAA-MM-GG' per test; null = oggi
  };

  const SCENARI = ['prudenziale', 'centrale', 'ottimistico'];

  const ENUM = {
    occupazione: ['libero', 'occupato_debitore', 'occupato_terzi_senza_titolo', 'locato_opponibile',
      'locato_non_opponibile', 'altro', 'non_indicato'],
    classe: ['A_pronto', 'B_rinfrescare', 'C_rimodernare', 'D_ristrutturare', 'E_degrado', 'non_valutabile'],
    tipoDifformita: ['sanabile', 'da_rimuovere', 'non_sanabile', 'condono_pendente', 'non_determinato'],
    conformita: ['conforme', 'difforme', 'non_verificato_dal_ctu', 'non_indicato'],
    agibilita: ['presente', 'assente', 'non_verificato_dal_ctu', 'non_indicato'],
    tipoDocumento: ['perizia', 'avviso_di_vendita', 'ordinanza', 'altro', 'non_indicato'],
    siNo: ['si', 'no', 'non_indicato'],
  };

  // ===========================================================================
  // UTILITÀ
  // ===========================================================================
  const arr = (v) => (Array.isArray(v) ? v : []);
  const somma = (o) => Object.values(o).reduce((a, b) => a + (b || 0), 0);
  const r2 = (x) => Math.round(x * 100) / 100;

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[€\s]/g, '').replace(/mq|m²|m2/gi, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 8.500,50
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function bool(v) {
    if (v === true || v === false) return v;
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase();
    if (['true', 'si', 'sì', 'yes', '1'].includes(s)) return true;
    if (['false', 'no', '0'].includes(s)) return false;
    return null;
  }

  function enumOr(v, lista, def, avvisi, campo) {
    if (v === null || v === undefined || v === '') return def;
    const s = String(v).trim().replace(/^sì$/i, 'si');
    if (lista.includes(s)) return s;
    avvisi.push(`Valore non previsto per ${campo}: "${s}" → trattato come "${def}"`);
    return def;
  }

  function data(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[1], 0, 1));
    m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return null;
  }

  const anniTra = (d1, d2) => (d2 - d1) / (365.25 * 24 * 3600 * 1000);
  const testoNorm = (s) => String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

  function merge(base, over) {
    const out = { ...base };
    for (const [k, v] of Object.entries(over || {})) {
      const b = base[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
        out[k] = merge(b, v);
      } else out[k] = v;
    }
    return out;
  }

  // ===========================================================================
  // 1. NORMALIZZAZIONE DELL'OUTPUT GEMINI
  // Tutto ciò che non rispetta lo schema diventa null / "non_indicato" + avviso.
  // ===========================================================================
  function normalizza(raw) {
    const avvisi = [];
    const valido = raw && typeof raw === 'object';
    if (!valido) avvisi.push('Estrazione Gemini assente o non valida');
    const e = valido ? raw : {};
    const P = e.perizia || {}, I = e.identificazione || {}, CAT = e.catasto || {}, S = e.superfici || {};
    const U = e.urbanistica || {}, CP = U.condono_pendente || {}, O = e.occupazione || {};
    const C = e.condominio || {}, M = e.stato_manutentivo || {}, L = e.lavori_ctu || {};
    const V = e.valutazione_ctu || {}, F = e.formalita || {};

    const d = {
      perizia: {
        tipoDocumento: enumOr(P.tipo_documento, ENUM.tipoDocumento, 'non_indicato', avvisi, 'perizia.tipo_documento'),
        data: data(P.data_perizia),
        dataIntegrazione: data(P.data_ultima_integrazione),
        lottoTrovato: bool(P.lotto_trovato),
        fotoPresenti: bool(P.foto_presenti),
        planimetriaPresente: bool(P.planimetria_presente),
      },
      comune: I.comune || null,
      catasto: {
        unita: arr(CAT.unita).map((u) => ({
          ruolo: u.ruolo || null,
          categoria: u.categoria || null,
          rendita: num(u.rendita_euro),
        })),
        conformita: enumOr(CAT.conformita_catastale, ENUM.conformita, 'non_indicato', avvisi, 'conformita_catastale'),
      },
      superfici: {
        lorda: num(S.lorda_coperta_mq),
        utile: num(S.utile_netta_mq),
        catTot: num(S.catastale_totale_mq),
        catEscl: num(S.catastale_escl_scoperte_mq),
        commerciale: num(S.commerciale_ctu_mq),
        balconi: num(S.balconi_terrazzi_mq),
        giardino: num(S.giardino_corte_mq),
        box: num(S.box_garage_mq),
        cantina: num(S.cantina_mq),
        nonQualificata: num(S.superficie_non_qualificata_mq),
        includeDaDemolire: enumOr(S.superficie_include_parti_da_demolire, ENUM.siNo, 'non_indicato', avvisi,
          'superficie_include_parti_da_demolire'),
        mqDaDemolire: num(S.mq_da_demolire),
      },
      urbanistica: {
        conformita: enumOr(U.conformita_urbanistica, ENUM.conformita, 'non_indicato', avvisi, 'conformita_urbanistica'),
        agibilita: enumOr(U.agibilita, ENUM.agibilita, 'non_indicato', avvisi, 'agibilita'),
        difformita: arr(U.difformita).map((x, i) => ({
          descrizione: x.descrizione || `difformità ${i + 1}`,
          tipo: enumOr(x.tipo, ENUM.tipoDifformita, 'non_determinato', avvisi, 'difformita.tipo'),
          costo: num(x.costo_ctu_euro),
          riduceMq: num(x.riduce_superficie_mq),
          prospetti: bool(x.interessa_prospetti_o_parti_comuni),
          pagina: num(x.pagina),
        })),
        condono: {
          presente: bool(CP.presente) === true,
          costo: num(CP.costo_stimato_ctu_euro),
          integrazioniMancanti: bool(CP.integrazioni_richieste_non_presentate),
          anno: num(CP.anno_domanda),
        },
        costoTotale: num(U.costo_totale_regolarizzazione_ctu_euro),
      },
      occupazione: {
        stato: enumOr(O.stato, ENUM.occupazione, 'non_indicato', avvisi, 'occupazione.stato'),
        data: data(O.data_rilevazione),
      },
      condominio: {
        amministratore: enumOr(C.amministratore, ENUM.siNo, 'non_indicato', avvisi, 'condominio.amministratore'),
        speseAnnue: num(C.spese_ordinarie_annue_euro),
        arretrati: num(C.arretrati_euro),
        straordinarie: enumOr(C.straordinarie_deliberate, ENUM.siNo, 'non_indicato', avvisi,
          'condominio.straordinarie_deliberate'),
      },
      statoManutentivo: enumOr(M.classe, ENUM.classe, 'non_valutabile', avvisi, 'stato_manutentivo.classe'),
      lavoriCtu: num(L.importo_euro),
      valoreCtu: { mercato: num(V.valore_mercato_euro), finale: num(V.valore_finale_euro) },
      formalitaNonCancellabili: arr(F.non_cancellabili).filter((x) => x && String(x).trim()),
      discordanze: arr(e.discordanze),
    };
    return { d, avvisi };
  }

  // Mappa il testo libero dell'annuncio PVP sullo stato di occupazione
  function occupazioneDaAnnuncio(testo) {
    if (!testo) return null;
    const t = testoNorm(testo);
    if (t.includes('liber')) return 'libero';
    if (t.includes('esecutat') || t.includes('debitor')) return 'occupato_debitore';
    if (t.includes('terzi')) return 'occupato_terzi_senza_titolo';
    if (t.includes('locat') || t.includes('contratt')) return 'altro'; // opponibilità da verificare in perizia
    return null;
  }

  function occupazioneEffettiva(d, annuncio) {
    const p = d.occupazione.stato;
    const a = occupazioneDaAnnuncio(annuncio.occupazione);
    if (!a || a === p) return { stato: p, avviso: null };
    if (p === 'locato_opponibile' || p === 'locato_non_opponibile') {
      return { stato: p, avviso: `Annuncio: "${annuncio.occupazione}", perizia: ${p}. Tenuto il dato della perizia (contratto): verificare col custode.` };
    }
    const quando = d.occupazione.data ? ` (rilevato ${d.occupazione.data.toISOString().slice(0, 10)})` : '';
    return {
      stato: a,
      avviso: `Perizia: ${p}${quando}; annuncio: ${a}. Usato il dato dell'annuncio (più recente): confermare col custode.`,
    };
  }

  // ===========================================================================
  // 2. QUALITÀ DEI DATI (A–D) — regole, non giudizio dell'AI
  // ===========================================================================
  function qualitaDati(d, oggi) {
    const dataRif = d.perizia.dataIntegrazione || d.perizia.data;
    const eta = dataRif ? anniTra(dataRif, oggi) : null;
    const s = d.superfici;
    const supAffidabile = [s.commerciale, s.lorda, s.catTot, s.catEscl].some((v) => v != null);
    const supQualsiasi = supAffidabile || s.nonQualificata != null;

    const bloccanti = [];
    if (d.perizia.lottoTrovato === false) bloccanti.push('lotto non individuato nella perizia');
    if (!supQualsiasi) bloccanti.push('nessuna superficie utilizzabile');
    if (d.occupazione.stato === 'non_indicato' &&
        ['non_indicato', 'non_verificato_dal_ctu'].includes(d.urbanistica.conformita)) {
      bloccanti.push('né occupazione né conformità urbanistica indicate');
    }
    if (bloccanti.length) return { livello: 'D', motivi: bloccanti, etaPeriziaAnni: eta };

    const gravi = [];
    const lievi = [];
    const tipo = d.perizia.tipoDocumento;
    if (tipo === 'non_indicato') lievi.push('tipo di documento non indicato');
    else if (tipo !== 'perizia') gravi.push(`documento analizzato: ${tipo.replace(/_/g, ' ')}, non la perizia`);
    if (eta != null && eta > 7) gravi.push(`perizia di ${Math.round(eta)} anni`);
    if (!supAffidabile) gravi.push('solo superficie non qualificata');
    if (['non_indicato', 'non_verificato_dal_ctu'].includes(d.urbanistica.conformita)) gravi.push('conformità urbanistica non verificata');
    if (d.occupazione.stato === 'non_indicato') gravi.push('occupazione non indicata in perizia');
    if (d.statoManutentivo === 'non_valutabile') gravi.push('stato manutentivo non valutabile');

    if (eta == null) lievi.push('data perizia non indicata');
    else if (eta > 3 && eta <= 7) lievi.push(`perizia di ${eta.toFixed(1)} anni`);
    if (!d.catasto.unita.length || d.catasto.unita.some((u) => u.rendita == null)) lievi.push('rendita catastale mancante');
    if (d.perizia.fotoPresenti === false) lievi.push('perizia senza foto');
    if (d.perizia.planimetriaPresente === false) lievi.push('perizia senza planimetria');
    if (d.condominio.amministratore === 'si' && d.condominio.arretrati == null) lievi.push('arretrati condominiali non indicati');
    if (d.discordanze.length) lievi.push(`${d.discordanze.length} discordanze da chiarire`);

    const livello = gravi.length || lievi.length >= 3 ? 'C' : lievi.length ? 'B' : 'A';
    return { livello, motivi: [...gravi, ...lievi], etaPeriziaAnni: eta };
  }

  // ===========================================================================
  // 3. SUPERFICIE COMMERCIALE VENDIBILE
  // ===========================================================================
  function superficieCommerciale(d, params) {
    const s = d.superfici;
    const k = params.coefficientiSuperficie;
    let mq = null;
    let fonte = 'nessuna';
    let approssimata = false;
    if (s.commerciale != null) {
      mq = s.commerciale; fonte = 'commerciale CTU';
    } else if (s.lorda != null) {
      mq = s.lorda + k.balconi * (s.balconi || 0) + k.giardino * (s.giardino || 0) +
        k.box * (s.box || 0) + k.cantina * (s.cantina || 0);
      fonte = 'lorda coperta + pertinenze con coefficienti';
    } else if (s.catTot != null) {
      mq = s.catTot; fonte = 'catastale totale (DPR 138/98)';
    } else if (s.catEscl != null) {
      mq = s.catEscl + k.balconi * (s.balconi || 0); fonte = 'catastale escl. scoperte + balconi';
    } else if (s.nonQualificata != null) {
      mq = s.nonQualificata; fonte = 'superficie non qualificata'; approssimata = true;
    }
    if (mq == null) return { mq: null, mqPrimaRiduzione: null, riduzione: 0, fonte, approssimata: true };

    // Se la superficie CTU comprende parti da demolire, si vende solo ciò che resta
    let riduzione = 0;
    if (s.includeDaDemolire !== 'no') {
      const daDiff = d.urbanistica.difformita.reduce((a, x) => a + (x.riduceMq || 0), 0);
      riduzione = Math.max(s.mqDaDemolire || 0, daDiff);
    }
    return { mq: r2(mq - riduzione), mqPrimaRiduzione: r2(mq), riduzione, fonte, approssimata };
  }

  // ===========================================================================
  // 4. COSTI
  // ===========================================================================
  function renditaTotale(d) {
    const u = d.catasto.unita;
    if (!u.length || u.some((x) => x.rendita == null)) return null; // se ne manca una, niente prezzo-valore (prudenziale)
    return u.reduce((a, x) => a + x.rendita, 0);
  }

  // Imposta di registro: 9% (2% prima casa) su min(prezzo, valore catastale) se persona fisica
  // e rendita nota (prezzo-valore, esteso alle vendite giudiziarie da Corte Cost. 6/2014);
  // altrimenti sul prezzo (art. 44 DPR 131/1986). Minimo €1.000. Ipotecaria e catastale €50 + €50.
  function imposteAcquisto(prezzo, renditaTot, params) {
    const aliquota = params.primaCasa ? 0.02 : 0.09;
    const valoreCatastale = renditaTot != null ? renditaTot * 1.05 * (params.primaCasa ? 110 : 120) : null;
    const pvAmmesso = params.acquirente === 'persona_fisica' && valoreCatastale != null;
    const base = pvAmmesso ? Math.min(prezzo, valoreCatastale) : prezzo;
    const registro = Math.max(1000, aliquota * base);
    return {
      base: r2(base),
      valoreCatastale: valoreCatastale != null ? r2(valoreCatastale) : null,
      prezzoValoreApplicato: pvAmmesso && valoreCatastale < prezzo,
      registro: r2(registro),
      ipocatastali: 100,
      totale: r2(registro + 100),
    };
  }

  function costoRegolarizzazione(d, params) {
    const u = d.urbanistica;
    let base;
    let fonte;
    let nonDeterminato = false;
    if (u.costoTotale != null) {
      base = u.costoTotale; fonte = 'totale indicato dal CTU';
    } else {
      base = 0; fonte = 'somma delle voci CTU';
      for (const x of u.difformita) {
        if (x.costo != null) base += x.costo;
        else if (x.tipo !== 'non_sanabile') nonDeterminato = true;
      }
      const condonoGiaContato = u.difformita.some((x) => x.tipo === 'condono_pendente' && x.costo != null);
      if (u.condono.presente && !condonoGiaContato) {
        if (u.condono.costo != null) base += u.condono.costo; else nonDeterminato = true;
      }
    }
    return {
      baseCtu: base,
      conRicarico: Math.round(base * (1 + params.ricaricoRegolarizzazione)),
      nonDeterminato,
      fonte,
    };
  }

  function costoLavori(d, supLavori, params, override) {
    if (override != null) return { importo: override, fonte: 'override utente', nota: null };
    let classe = d.statoManutentivo;
    let nota = null;
    if (classe === 'non_valutabile') {
      classe = 'D_ristrutturare';
      nota = 'stato non valutabile: usata la classe D (prudenziale)';
    }
    const daTabella = supLavori != null ? params.costoLavoriMq[classe] * supLavori : null;
    const daCtu = d.lavoriCtu != null ? d.lavoriCtu * (1 + params.ricaricoLavoriCtu) : null;
    const candidati = [daTabella, daCtu].filter((v) => v != null);
    if (!candidati.length) return { importo: null, fonte: 'non determinabile', nota };
    const importo = Math.round(Math.max(...candidati));
    const fonte = importo === Math.round(daTabella) ? `tabella ${classe} × ${supLavori} mq` : 'stima CTU + ricarico';
    return { importo, fonte, nota };
  }

  // STESSE fasce e aliquote di compensoDelegato() in index.html (DM 227/2015,
  // quota a carico dell'aggiudicatario): €550 fino a €100.000, €660 fino a
  // €500.000, + 4% cassa + 22% IVA. Qui si applica al prezzo di
  // aggiudicazione; oltre €500.000 null (fascia non verificata).
  function compensoDelegato(prezzo) {
    let base;
    if (prezzo <= 100000) base = 550;
    else if (prezzo <= 500000) base = 660;
    else return null;
    const cassa = base * 0.04;
    return base + cassa + (base + cassa) * 0.22;
  }

  function speseProcedura(prezzo, params) {
    if (params.speseProceduraAggiudicatario !== 'auto') return params.speseProceduraAggiudicatario;
    const delegato = compensoDelegato(prezzo);
    return (delegato == null ? 1500 : delegato) + params.speseVarieProcedura;
  }

  // art. 63 disp. att. c.c.: l'aggiudicatario risponde in solido per l'anno in corso e il precedente
  // (approssimato a 2 annualità di spese ordinarie).
  function arretratiACarico(d) {
    const c = d.condominio;
    if (c.arretrati == null) return 0;
    const tetto = c.speseAnnue != null ? 2 * c.speseAnnue : c.arretrati;
    return Math.min(c.arretrati, tetto);
  }

  // ===========================================================================
  // 5. ARV — priorità: override (comparabili Fase 2) > OMI > proxy valore CTU
  // ===========================================================================
  function arvScenari(sup, d, annuncio, params, etaPerizia) {
    if (annuncio.arvOverride) {
      return { ...annuncio.arvOverride, fonte: 'override (comparabili verificati)', affidabilita: 'media' };
    }
    if (annuncio.omi && sup.mq != null) {
      const { min, max } = annuncio.omi;
      const f = (p) => Math.round(sup.mq * (min + p * (max - min)));
      return {
        prudenziale: f(params.posizioneRangeOmi.prudenziale),
        centrale: f(params.posizioneRangeOmi.centrale),
        ottimistico: f(params.posizioneRangeOmi.ottimistico),
        fonte: `OMI ${min}–${max} €/mq × ${sup.mq} mq`,
        affidabilita: sup.approssimata ? 'bassa' : 'screening',
      };
    }
    const vCtu = d.valoreCtu.mercato != null ? d.valoreCtu.mercato : d.valoreCtu.finale;
    if (vCtu != null && etaPerizia != null && etaPerizia <= params.maxEtaPeriziaAnni) {
      const k = params.proxyCtu;
      return {
        prudenziale: Math.round(vCtu * k.prudenziale),
        centrale: Math.round(vCtu * k.centrale),
        ottimistico: Math.round(vCtu * k.ottimistico),
        fonte: `proxy valore CTU €${vCtu}`,
        affidabilita: 'bassa',
      };
    }
    return null;
  }

  // ===========================================================================
  // 6. CONTO ECONOMICO, MAX_BID, HEADROOM
  // ===========================================================================
  function contoEconomico(prezzo, ctx, scenario) {
    const p = ctx.params;
    const imp = imposteAcquisto(prezzo, ctx.renditaTot, p);
    const lavori = ctx.lavori.importo * p.moltiplicatoreLavori[scenario];
    const regolarizzazione = ctx.reg.conRicarico;
    const mesi = ctx.mesi[scenario];
    const arv = ctx.arv[scenario];
    const voci = {
      prezzo,
      imposte: imp.totale,
      speseProcedura: speseProcedura(prezzo, p),
      arretratiCondominiali: ctx.arretrati,
      regolarizzazione,
      tecnico: p.tecnicoPratiche,
      lavori,
      imprevisti: p.imprevistiPct * (lavori + regolarizzazione),
      holding: p.costoMensileHolding * mesi,
      vendita: p.commissioneVenditaPct * arv + p.costiVenditaFissi,
    };
    const totale = somma(voci);
    const capitale = totale - voci.vendita;            // cassa necessaria prima della vendita
    const utile = arv - totale;                         // utile operativo lordo
    // (STIMA grossolana) plusvalenza ≈ utile + costi di gestione non deducibili per un privato
    const imposta = Math.max(0, p.aliquotaPlusvalenza * (utile + voci.holding + voci.arretratiCondominiali));
    return {
      scenario, arv, mesi,
      voci: Object.fromEntries(Object.entries(voci).map(([k, v]) => [k, Math.round(v)])),
      prezzoValoreApplicato: imp.prezzoValoreApplicato,
      totale: Math.round(totale),
      capitale: Math.round(capitale),
      utile: Math.round(utile),
      roiPct: r2((utile / capitale) * 100),
      roiAnnuoPct: r2((utile / capitale) * 100 * (12 / mesi)),
      impostaPlusvalenzaStimata: Math.round(imposta),
      utileNettoStimato: Math.round(utile - imposta),
    };
  }

  // Prezzo massimo di aggiudicazione che lascia almeno `target` di utile. Ricerca binaria:
  // l'utile è decrescente nel prezzo, e così gestiamo imposta minima e prezzo-valore senza formule a tratti.
  function maxBid(ctx, scenario, target, netto) {
    const f = (prezzo) => {
      const c = contoEconomico(prezzo, ctx, scenario);
      return (netto ? c.utileNettoStimato : c.utile) - target;
    };
    let lo = 0;
    let hi = ctx.arv[scenario];
    if (f(lo) < 0) return null; // target irraggiungibile anche a prezzo zero
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) >= 0) lo = mid; else hi = mid;
    }
    return Math.floor(lo);
  }

  // ===========================================================================
  // 7. CLASSE DELL'OPERAZIONE — pensata per chi vuole iniziare con operazioni pulite
  // ===========================================================================
  function classificaOperazione(d, occupazione, qualita, reg, params) {
    const eta = qualita.etaPeriziaAnni;
    const diff = d.urbanistica.difformita;
    const scarta = [];
    const complessa = [];
    const gestibile = [];

    if (diff.some((x) => x.tipo === 'non_sanabile')) scarta.push('difformità dichiarate non sanabili');
    if (d.formalitaNonCancellabili.length) scarta.push(`pesi a carico dell'acquirente: ${d.formalitaNonCancellabili.join('; ')}`);
    if (occupazione === 'locato_opponibile') scarta.push('locazione opponibile: non vendibile libero fino a scadenza');
    if (qualita.livello === 'D') scarta.push(`documentazione insufficiente (${qualita.motivi.join('; ')})`);

    if (d.urbanistica.condono.presente || diff.some((x) => x.tipo === 'condono_pendente')) complessa.push('condono/sanatoria pendente');
    if (['occupato_terzi_senza_titolo', 'locato_non_opponibile', 'altro'].includes(occupazione)) complessa.push('occupato da terzi');
    if (reg.nonDeterminato) complessa.push('costo di regolarizzazione non determinato');
    if (diff.some((x) => x.tipo === 'non_determinato')) complessa.push('difformità senza giudizio di sanabilità');
    if (diff.some((x) => x.prospetti === true)) complessa.push('difformità su prospetti o parti comuni');
    if (d.superfici.includeDaDemolire === 'si' || diff.some((x) => (x.riduceMq || 0) > 0)) complessa.push('superficie ridotta dopo il ripristino');
    if (eta != null && eta > 7) complessa.push(`perizia di ${Math.round(eta)} anni: stato attuale ignoto`);
    if (d.statoManutentivo === 'E_degrado') complessa.push('stato di degrado');

    if (occupazione === 'occupato_debitore') gestibile.push('occupato dal debitore (liberazione a cura del custode)');
    if (diff.some((x) => x.tipo === 'da_rimuovere')) gestibile.push('opere da rimuovere/ripristinare');
    if (reg.baseCtu > params.maxCostoRegolarizzazionePulita) gestibile.push(`regolarizzazione CTU €${reg.baseCtu}`);
    if (eta != null && eta > params.maxEtaPeriziaAnni && eta <= 7) gestibile.push(`perizia di ${eta.toFixed(1)} anni`);
    if (d.statoManutentivo === 'D_ristrutturare') gestibile.push('ristrutturazione completa');
    if (d.condominio.straordinarie === 'si') gestibile.push('lavori straordinari condominiali deliberati');
    if (occupazione === 'non_indicato') gestibile.push('occupazione non indicata');
    if (qualita.livello === 'C') gestibile.push(`qualità documentale C (${qualita.motivi.join('; ')})`);

    const classe = scarta.length ? 'DA_SCARTARE' : complessa.length ? 'COMPLESSA' : gestibile.length ? 'GESTIBILE' : 'PULITA';
    return { classe, motivi: [...scarta, ...complessa, ...gestibile] };
  }

  // Numero di tentativo stimato ipotizzando ribassi costanti del 25%.
  function stimaTentativo(valoreStima, prezzoBase) {
    if (!valoreStima || !prezzoBase || prezzoBase > valoreStima * 1.001) return null;
    const n = Math.log(prezzoBase / valoreStima) / Math.log(0.75);
    const r = Math.round(n);
    if (Math.abs(n - r) > 0.05) {
      return { tentativo: null, nota: 'ribassi non compatibili con −25% costante: verificare lo storico sul PVP' };
    }
    return { tentativo: r + 1, ribassoTotalePct: Math.round((1 - prezzoBase / valoreStima) * 100), nota: 'ipotesi: ribassi costanti del 25%' };
  }

  // Per non rompere la dashboard attuale: punteggio 0–100 calcolato, non generato dall'AI.
  function punteggioCompatibile(classe, headroom, livelloQualita) {
    if (classe === 'DA_SCARTARE') return 0;
    const base = { PULITA: 70, GESTIBILE: 50, COMPLESSA: 30 }[classe];
    const bonus = headroom == null ? -20 : Math.max(-30, Math.min(30, headroom / 1000));
    let p = Math.round(base + bonus);
    if (livelloQualita === 'C') p = Math.min(p, 50);
    return Math.max(0, Math.min(100, p));
  }

  // ===========================================================================
  // 8. ORCHESTRAZIONE
  // annuncio = { comune, offertaMinima, prezzoBase, valoreStima, occupazione (testo PVP),
  //              omi: {min, max} | null, arvOverride: {prudenziale, centrale, ottimistico} | null,
  //              lavoriOverride: numero | null }
  // ===========================================================================
  function analizzaAsta(estrazioneGemini, annuncio, parametriUtente) {
    const params = merge(PARAMETRI_DEFAULT, parametriUtente || {});
    const oggi = params.dataRiferimento ? data(params.dataRiferimento) : new Date();
    annuncio = annuncio || {};

    const { d, avvisi } = normalizza(estrazioneGemini);
    const occ = occupazioneEffettiva(d, annuncio);
    if (occ.avviso) avvisi.push(occ.avviso);

    const qualita = qualitaDati(d, oggi);
    const sup = superficieCommerciale(d, params);
    const reg = costoRegolarizzazione(d, params);
    const supLavori = d.superfici.lorda != null ? d.superfici.lorda : sup.mqPrimaRiduzione;
    const lavori = costoLavori(d, supLavori, params, annuncio.lavoriOverride);
    const arv = arvScenari(sup, d, annuncio, params, qualita.etaPeriziaAnni);
    const classificazione = classificaOperazione(d, occ.stato, qualita, reg, params);

    const mesi = { ...(params.mesiOperazione[occ.stato] || params.mesiOperazione.non_indicato) };
    if (d.urbanistica.condono.presente) mesi.prudenziale += params.mesiExtraCondono;

    // Prima il comune estratto dalla perizia: deve INIZIARE con il nome in
    // elenco ("Mascalucia (CT)" va bene, "Gravina di Catania" non vale per
    // "Catania"). Se la perizia non lo indica, basta che l'indirizzo
    // dell'annuncio (via, CAP, provincia) contenga il nome.
    const inZonaTarget = !params.comuniTarget.length ? null
      : d.comune ? params.comuniTarget.some((c) => testoNorm(d.comune).startsWith(testoNorm(c)))
      : params.comuniTarget.some((c) => testoNorm(annuncio.comune).includes(testoNorm(c)));

    const esito = {
      versione: '2.0',
      classe: classificazione.classe,
      motivi: classificazione.motivi,
      qualita,
      occupazione: occ.stato,
      superficie: sup,
      regolarizzazione: reg,
      lavori,
      arv,
      tentativo: stimaTentativo(annuncio.valoreStima, annuncio.prezzoBase),
      inZonaTarget,
      scenariAlMinimo: null,
      maxBid: null,
      offertaMassima: null,
      vincoloOffertaMassima: null,
      headroom: null,
      grigliaMaxBid: null,
      idealePerIniziare: false,
      punteggio: null,
      verdetto: null,
      avvisi,
    };

    if (!arv || lavori.importo == null) {
      esito.verdetto = `CALCOLO NON AFFIDABILE: ${!arv ? 'manca l\'ARV (inserisci i valori dai comparabili: il valore del CTU si usa solo con una perizia recente)' : 'costo lavori non determinabile'}`;
      esito.punteggio = punteggioCompatibile(esito.classe, null, qualita.livello);
      return esito;
    }
    if (reg.nonDeterminato) avvisi.push('Costi di regolarizzazione incompleti: MAX_BID sovrastimato');
    if (arv.affidabilita === 'bassa') avvisi.push(`ARV a bassa affidabilità (${arv.fonte})`);

    const ctx = { params, arv, lavori, reg, mesi, arretrati: arretratiACarico(d), renditaTot: renditaTotale(d) };
    const offerta = annuncio.offertaMinima;

    esito.scenariAlMinimo = {};
    esito.maxBid = {};
    for (const s of SCENARI) {
      esito.scenariAlMinimo[s] = offerta != null ? contoEconomico(offerta, ctx, s) : null;
      esito.maxBid[s] = maxBid(ctx, s, params.utileTarget, params.targetNetto);
    }
    esito.grigliaMaxBid = {};
    for (const t of params.griglieTarget) {
      esito.grigliaMaxBid[t] = Object.fromEntries(SCENARI.map((s) => [s, maxBid(ctx, s, t, params.targetNetto)]));
    }

    // Offerta massima consigliata = il più basso tra:
    //  - prezzo che garantisce l'utile target nello scenario centrale
    //  - prezzo che garantisce l'utile minimo nello scenario prudenziale
    const mbCentrale = esito.maxBid.centrale;
    const mbPrudMinimo = maxBid(ctx, 'prudenziale', params.utileMinimoPrudenziale, params.targetNetto);
    esito.offertaMassima = mbCentrale == null || mbPrudMinimo == null ? null : Math.min(mbCentrale, mbPrudMinimo);
    esito.vincoloOffertaMassima = esito.offertaMassima == null ? 'target irraggiungibile'
      : mbPrudMinimo < mbCentrale ? 'scenario prudenziale' : 'scenario centrale';
    esito.headroom = offerta != null ? (esito.offertaMassima != null ? esito.offertaMassima : 0) - offerta : null;

    const h = esito.headroom;
    esito.idealePerIniziare = esito.classe === 'PULITA' && h != null && h >= 0 &&
      ['A', 'B'].includes(qualita.livello) && inZonaTarget !== false && arv.affidabilita !== 'bassa';
    esito.punteggio = punteggioCompatibile(esito.classe, h, qualita.livello);

    const eur = (x) => `€${Math.round(x).toLocaleString('it-IT')}`;
    const tgt = `${eur(params.utileTarget)} ${params.targetNetto ? 'netti' : 'lordi'}`;
    if (esito.classe === 'DA_SCARTARE') {
      esito.verdetto = `SCARTARE — ${classificazione.motivi[0]}`;
    } else if (h != null && h >= 0) {
      esito.verdetto = `${esito.classe} — offerta massima ${eur(esito.offertaMassima)} (rilancio possibile ${eur(h)} sul minimo)`;
    } else if (mbCentrale != null && offerta != null && mbCentrale >= offerta) {
      esito.verdetto = `${esito.classe} — ${tgt} solo nello scenario centrale; nel prudenziale l'utile scende sotto ${eur(params.utileMinimoPrudenziale)}`;
    } else {
      esito.verdetto = `${esito.classe} — al prezzo minimo non raggiunge ${tgt} nello scenario centrale`;
    }
    if (inZonaTarget === false) esito.verdetto += ' · FUORI ZONA';

    return esito;
  }

  return {
    PARAMETRI_DEFAULT,
    normalizza,
    qualitaDati,
    superficieCommerciale,
    imposteAcquisto,
    compensoDelegato,
    costoRegolarizzazione,
    costoLavori,
    contoEconomico,
    maxBid,
    classificaOperazione,
    stimaTentativo,
    analizzaAsta,
  };
});
