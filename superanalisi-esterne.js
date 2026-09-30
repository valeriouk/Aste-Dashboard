/**
 * superanalisi-esterne.js — risultati delle superanalisi fatte con AI esterne
 * (Claude, Gemini, ChatGPT…), salvati nel database (tabella
 * superanalisi_esterne, sql/superanalisi_esterne.sql nel repo privato).
 *
 * Usato da:
 *   - superanalisi.html e superanalisi-gruppo.html: sezione "Salva il
 *     risultato" (incolla, anteprima, salva, elenco con Apri ed Elimina);
 *   - index.html: nome dei pulsanti nei dettagli ("🧠 Giudizio Claude: PULITA");
 *   - risultato-superanalisi.html: il risultato a tutta pagina.
 *
 * Formato: si salva il testo in Markdown, come lo copia il pulsante "Copia"
 * sotto la risposta della chat; se si incolla una selezione fatta col mouse
 * (HTML negli appunti) viene riconvertita in Markdown (turndown). Si mostra
 * impaginato con marked, passando sempre da DOMPurify (niente script).
 * Librerie caricate solo quando servono, da jsdelivr, versioni bloccate.
 *
 * Funziona nel browser (window.SuperanalisiEsterne) e in Node (require) per
 * i test delle funzioni che leggono giudizio e classifica.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SuperanalisiEsterne = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GIUDIZI = ['PULITA', 'GESTIBILE', 'COMPLESSA', 'DA SCARTARE'];
  const AI_NOTE = ['Claude', 'ChatGPT', 'Gemini', 'Perplexity', 'Mistral Le Chat', 'DeepSeek', 'Grok', 'Copilot', 'Altra AI'];
  const LIBRERIE = {
    marked: 'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js',
    purify: 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js',
    turndown: 'https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js',
    gfm: 'https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js',
  };
  // Impronte dei file (SHA-384): se la CDN servisse un file diverso, il
  // browser non lo esegue. Cambiando versione vanno ricalcolate.
  const IMPRONTE = {
    [LIBRERIE.marked]: 'sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+',
    [LIBRERIE.purify]: 'sha384-JEyTNhjM6R1ElGoJns4U2Ln4ofPcqzSsynQkmEc/KGy6336qAZl70tDLufbkla+3',
    [LIBRERIE.turndown]: 'sha384-OGauEFaI5hnS8jXK4qdSGShAUAObMBKoLXgcL1ORhRh7ulx5jPZH35qVpacIEA4Z',
    [LIBRERIE.gfm]: 'sha384-2TroN1N6OfLQ+K4qttptnIfMREzUlMa3hW/nZqDZXv7Sm9BkESfGEupDEqCbzyRl',
  };

  // ------------------------------------------------------------ lettura del testo
  // Toglie la formattazione Markdown più comune da una riga (**, __, `, #, >, «»).
  function rigaPulita(riga) {
    return String(riga).replace(/[*_`#>«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // "Giudizio: DA SCARTARE" nelle prime righe → "DA SCARTARE" (o null).
  function leggiGiudizio(testo) {
    const righe = String(testo || '').split(/\r?\n/).slice(0, 25);
    for (const riga of righe) {
      const m = rigaPulita(riga).match(/^(?:[-–•]\s*)?giudizio(?:\s+sintetico|\s+finale)?\s*[:：\-–]\s*(pulita|gestibile|complessa|da\s+scartare)\b/i);
      if (m) return m[1].toUpperCase().replace(/\s+/g, ' ');
    }
    return null;
  }

  // "Classifica: 4630516, 4605396, …" nelle prime righe → [id, id, …] tra
  // quelli del gruppo, in ordine e senza ripetizioni (o null).
  function leggiClassifica(testo, idGruppo) {
    const ammessi = new Set((idGruppo || []).map(String));
    const righe = String(testo || '').split(/\r?\n/).slice(0, 25);
    for (const riga of righe) {
      const pulita = rigaPulita(riga);
      const m = pulita.match(/^(?:[-–•]\s*)?classifica(?:\s+finale)?\s*[:：\-–]\s*(.+)$/i);
      if (!m) continue;
      const ids = [];
      for (const id of m[1].match(/\d{5,}/g) || []) {
        if ((!ammessi.size || ammessi.has(id)) && !ids.includes(id)) ids.push(id);
      }
      return ids.length ? ids : null;
    }
    return null;
  }

  const dataBreve = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Nome del pulsante nei dettagli dell'asta idAsta.
  function etichetta(voce, idAsta) {
    const ai = voce.ai || 'AI';
    if (voce.tipo === 'gruppo') {
      const n = (voce.id_annunci || []).length;
      const pos = (voce.classifica || []).map(String).indexOf(String(idAsta));
      return pos >= 0
        ? `🧠 Gruppo ${ai}: ${pos + 1}ª di ${n}`
        : `🧠 Superanalisi di gruppo ${ai} · ${dataBreve(voce.creato)} (${n} aste)`;
    }
    return voce.giudizio ? `🧠 Giudizio ${ai}: ${voce.giudizio}` : `🧠 Superanalisi ${ai} · ${dataBreve(voce.creato)}`;
  }

  // Il testo incollato sembra già Markdown (titoli, tabelle, elenchi, grassetti)?
  function pareMarkdown(testo) {
    return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|\|.*\|)|\*\*[^*]+\*\*/.test(String(testo || ''));
  }

  // ------------------------------------------------------------ browser
  const caricate = {};
  function caricaScript(url) {
    if (!caricate[url]) {
      caricate[url] = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = url;
        if (IMPRONTE[url]) { s.integrity = IMPRONTE[url]; s.crossOrigin = 'anonymous'; }
        s.onload = ok;
        s.onerror = () => ko(new Error('libreria non caricata: ' + url));
        document.head.appendChild(s);
      });
    }
    return caricate[url];
  }
  const caricaLettura = () => Promise.all([caricaScript(LIBRERIE.marked), caricaScript(LIBRERIE.purify)]);
  const caricaIncolla = () => caricaScript(LIBRERIE.turndown).then(() => caricaScript(LIBRERIE.gfm));

  // Markdown → HTML ripulito (DOMPurify); link in una nuova scheda. Da
  // chiamare dopo caricaLettura().
  function inHtml(testo) {
    const html = window.marked.parse(String(testo || ''), { gfm: true, breaks: false });
    const pulito = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    const box = document.createElement('div');
    box.innerHTML = pulito;
    box.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    box.querySelectorAll('table').forEach((t) => {
      const involucro = document.createElement('div');
      involucro.className = 'sae-tabella';
      t.parentNode.insertBefore(involucro, t);
      involucro.appendChild(t);
    });
    return box.innerHTML;
  }

  // Incolla: se negli appunti c'è HTML e il testo semplice non è già
  // Markdown (selezione fatta col mouse), converte l'HTML in Markdown.
  // Decisione SENZA attese (01/10/2026): l'incolla normale del browser va
  // bloccato subito, prima di aspettare le librerie; dopo un await era
  // troppo tardi e al primo incolla il testo compariva due volte.
  // null = lascia fare al browser.
  function datiDaIncollare(evento) {
    const dati = evento && evento.clipboardData;
    if (!dati) return null;
    const semplice = dati.getData('text/plain') || '';
    const html = dati.getData('text/html') || '';
    if (!html || pareMarkdown(semplice)) return null;
    return { semplice, html };
  }

  async function htmlInMarkdown(html) {
    await caricaIncolla();
    const td = new window.TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    td.use(window.turndownPluginGfm.gfm);
    td.remove(['script', 'style', 'button']);
    return td.turndown(html);
  }

  const STILE = `
  .sae-testo { font-size: .93rem; line-height: 1.6; overflow-wrap: anywhere; }
  .sae-testo h1, .sae-testo h2, .sae-testo h3, .sae-testo h4 { font-family: var(--font-display, Georgia, serif); line-height: 1.3; margin: 1.2em 0 .5em; }
  .sae-testo h1 { font-size: 1.4rem; } .sae-testo h2 { font-size: 1.2rem; } .sae-testo h3 { font-size: 1.05rem; text-transform: none; letter-spacing: 0; color: inherit; } .sae-testo h4 { font-size: .95rem; }
  .sae-testo p, .sae-testo ul, .sae-testo ol { margin: .5em 0; }
  .sae-testo ul, .sae-testo ol { padding-left: 1.4em; }
  .sae-testo li { margin: .2em 0; }
  .sae-testo blockquote { margin: .6em 0; padding: .2em 0 .2em .9em; border-left: 3px solid var(--border, #d5dad1); color: var(--ink-muted, #5b615a); }
  .sae-testo code { font-family: var(--font-mono, monospace); font-size: .85em; background: var(--surface-2, #e3e7e0); border-radius: 4px; padding: 0 4px; }
  .sae-testo pre { background: var(--surface-2, #e3e7e0); border-radius: 8px; padding: 10px; overflow-x: auto; }
  .sae-testo pre code { background: none; padding: 0; }
  .sae-testo hr { border: none; border-top: 1px solid var(--border, #d5dad1); margin: 1.2em 0; }
  .sae-testo .sae-tabella { overflow-x: auto; margin: .6em 0; }
  .sae-testo table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  .sae-testo th, .sae-testo td { border: 1px solid var(--border, #d5dad1); padding: 6px 8px; text-align: left; vertical-align: top; white-space: normal;
    overflow-wrap: normal; word-break: normal; min-width: 6.5em; }
  .sae-testo th { background: var(--surface-2, #e3e7e0); font-weight: 600; color: inherit; text-transform: none; letter-spacing: 0; font-size: .82rem; }
  .sae-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .sae-form select { max-width: 240px; padding: 8px 10px; border: 1px solid var(--border, #d5dad1); border-radius: 8px; background: var(--bg, #eef1ec); font: inherit; font-size: .9rem; }
  .sae-form textarea { min-height: 180px; }
  .sae-anteprima { border: 1px dashed var(--border, #d5dad1); border-radius: 8px; padding: 4px 14px; max-height: 420px; overflow-y: auto; background: var(--bg, #eef1ec); }
  .sae-elenco { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; }
  .sae-elenco li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .9rem; }
  .sae-elenco .sae-data { color: var(--ink-faint, #8c9289); font-size: .8rem; }
  .sae-elenco button { font: inherit; font-size: .8rem; padding: 3px 10px; border: 1px solid var(--border, #d5dad1); border-radius: 6px; background: var(--surface, #fff); cursor: pointer; color: var(--danger, #8b3d2e); }
  `;
  function aggiungiStile() {
    if (document.getElementById('sae-stile')) return;
    const s = document.createElement('style');
    s.id = 'sae-stile';
    s.textContent = STILE;
    document.head.appendChild(s);
  }

  const escape = (t) => { const d = document.createElement('div'); d.textContent = t === null || t === undefined ? '' : String(t); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  const dataOra = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); };

  /**
   * Sezione "Salva il risultato" nelle pagine di superanalisi.
   * opzioni: {
   *   contenitore: elemento in cui disegnare,
   *   tipo: 'asta' | 'gruppo',
   *   idAnnunci: () => [id, …]  (per il gruppo: le aste della classifica),
   *   chiamaRpc: (nome, payload) => Promise,
   *   password: () => password di scrittura,
   *   idAstaElenco: id dell'asta per cui elencare i risultati (solo tipo 'asta'),
   * }
   */
  function montaSalvataggio(o) {
    aggiungiStile();
    const el = o.contenitore;
    const gruppo = o.tipo === 'gruppo';
    el.innerHTML = `
      <h2>💾 Salva il risultato dell'AI</h2>
      <p class="nota">Nella chat usa il pulsante «Copia» sotto la risposta e incollala qui: titoli, elenchi e tabelle restano impaginati.
        ${gruppo ? 'Se la risposta comincia con «Classifica: id, id…», nei dettagli di ogni asta il pulsante mostra la sua posizione.'
                 : 'Se la risposta comincia con «Giudizio: …», il pulsante nei dettagli dell\'asta mostra il giudizio.'}
        Il risultato si legge dai dettagli dell'asta nel registro; si elimina solo da qui.</p>
      <div class="sae-form">
        <label class="campo">AI usata <select class="sae-ai"><option value="">— scegli —</option>${AI_NOTE.map((n) => `<option>${escape(n)}</option>`).join('')}</select></label>
        <textarea class="sae-testo-incollato" placeholder="Incolla qui la risposta dell'AI"></textarea>
        <p class="nota sae-rilevato"></p>
        <div class="sae-anteprima sae-testo nascosto"></div>
        <div><button class="bottone sae-salva" type="button">Salva il risultato</button></div>
        <p class="messaggio nascosto sae-messaggio"></p>
      </div>
      <h3>Risultati salvati</h3>
      <ul class="sae-elenco"><li class="nota">Caricamento…</li></ul>`;
    const q = (s) => el.querySelector(s);
    const area = q('.sae-testo-incollato'), anteprima = q('.sae-anteprima'), rilevato = q('.sae-rilevato');
    const selezione = q('.sae-ai'), messaggio = q('.sae-messaggio');

    const mostra = (classe, testo) => { messaggio.className = 'messaggio sae-messaggio ' + classe; messaggio.textContent = testo; };
    let attesa = null;
    const aggiornaAnteprima = () => {
      clearTimeout(attesa);
      attesa = setTimeout(async () => {
        const testo = area.value.trim();
        if (!testo) { anteprima.classList.add('nascosto'); rilevato.textContent = ''; return; }
        if (gruppo) {
          const c = leggiClassifica(testo, o.idAnnunci());
          rilevato.textContent = c ? `Classifica letta: ${c.join(', ')}.` : 'Nessuna riga «Classifica:» con gli id delle aste: il pulsante nei dettagli mostrerà AI e data.';
        } else {
          const g = leggiGiudizio(testo);
          rilevato.textContent = g ? `Giudizio letto: ${g}.` : 'Nessuna riga «Giudizio:» trovata: il pulsante nei dettagli mostrerà AI e data.';
        }
        try { await caricaLettura(); anteprima.innerHTML = inHtml(testo); anteprima.classList.remove('nascosto'); }
        catch (e) { anteprima.classList.add('nascosto'); rilevato.textContent += ' Anteprima non disponibile (' + e.message + ').'; }
      }, 250);
    };
    area.addEventListener('input', aggiornaAnteprima);
    area.addEventListener('paste', async (ev) => {
      const incolla = datiDaIncollare(ev);
      if (!incolla) return;   // incolla normale del browser
      ev.preventDefault();
      const inizio = area.selectionStart, fine = area.selectionEnd;
      let testo = incolla.semplice;   // se la conversione non riesce: il testo semplice
      try { testo = await htmlInMarkdown(incolla.html); } catch (e) { /* resta il testo semplice */ }
      area.value = area.value.slice(0, inizio) + testo + area.value.slice(fine);
      aggiornaAnteprima();
    });

    async function aggiornaElenco() {
      const elenco = q('.sae-elenco');
      try {
        const risposta = await o.chiamaRpc('leggi_superanalisi_esterne', {
          password_tentativo: o.password(), tipo: 'scrittura', id_annuncio_input: gruppo ? null : Number(o.idAstaElenco),
        });
        if (!risposta || !risposta.ok) { elenco.innerHTML = '<li class="nota">Elenco non disponibile.</li>'; return; }
        let voci = risposta.elenco || [];
        if (gruppo) {
          const chiave = o.idAnnunci().map(String).sort().join(',');
          voci = voci.filter((v) => v.tipo === 'gruppo' && (v.id_annunci || []).map(String).sort().join(',') === chiave);
        }
        elenco.innerHTML = voci.length ? voci.slice().reverse().map((v) => `<li>
            <a href="risultato-superanalisi.html?id=${v.id}">${escape(gruppo
              ? `🧠 ${v.ai}${(v.classifica || []).length ? ` · classifica: ${v.classifica.join(', ')}` : ''}`
              : etichetta(v, o.idAstaElenco))}</a>
            <span class="sae-data">${escape(dataOra(v.creato))}${v.tipo === 'gruppo' && !gruppo ? ` · gruppo di ${(v.id_annunci || []).length} aste` : ''}</span>
            ${v.tipo === o.tipo ? `<button type="button" data-elimina="${v.id}">Elimina</button>` : ''}</li>`).join('')
          : `<li class="nota">${gruppo ? 'Nessun risultato salvato per questo gruppo di aste.' : 'Nessun risultato salvato per questa asta.'}</li>`;
      } catch (e) {
        elenco.innerHTML = `<li class="nota">Elenco non disponibile (${escape(e.message)}).</li>`;
      }
    }
    q('.sae-elenco').addEventListener('click', async (ev) => {
      const bottone = ev.target.closest && ev.target.closest('[data-elimina]');
      const id = bottone && bottone.getAttribute('data-elimina');
      if (!id || bottone.disabled || !confirm('Eliminare questo risultato? Dalla pagina non si può annullare: resta nella cronologia del database per 12 mesi (recupero su richiesta).')) return;
      bottone.disabled = true;
      bottone.textContent = 'Eliminazione…';
      try {
        const r = await o.chiamaRpc('elimina_superanalisi_esterna', { password_tentativo: o.password(), id_input: Number(id) });
        if (r && r.result === 'success') { mostra('ok', 'Risultato eliminato.'); aggiornaElenco(); return; }
        mostra('errore', (r && r.message) || 'Eliminazione non riuscita.');
      } catch (e) {
        mostra('errore', `Eliminazione non riuscita (${e.message}).`);
      }
      bottone.disabled = false;
      bottone.textContent = 'Elimina';
    });

    q('.sae-salva').addEventListener('click', async () => {
      const testo = area.value.trim();
      if (!testo) { mostra('errore', 'Incolla prima la risposta dell\'AI.'); return; }
      // Nessuna AI preselezionata: va scelta, altrimenti il risultato finirebbe sotto il nome sbagliato.
      if (!selezione.value) { mostra('errore', 'Scegli prima quale AI hai usato.'); selezione.focus(); return; }
      const ids = o.idAnnunci().map(Number);
      const bottone = q('.sae-salva');
      bottone.disabled = true;
      try {
        const r = await o.chiamaRpc('salva_superanalisi_esterna', {
          password_tentativo: o.password(), tipo_input: o.tipo, id_annunci_input: ids, ai_input: selezione.value,
          testo_input: testo,
          giudizio_input: gruppo ? null : leggiGiudizio(testo),
          classifica_input: gruppo ? (leggiClassifica(testo, ids) || []).map(Number) : null,
        });
        if (r && r.result === 'success') {
          mostra('ok', 'Risultato salvato: lo trovi nei dettagli dell\'asta nel registro.');
          if (window.Feedback) window.Feedback.salvato();
          area.value = ''; aggiornaAnteprima(); aggiornaElenco();
        } else mostra('errore', (r && r.message) || 'Salvataggio non riuscito.');
      } catch (e) { mostra('errore', `Salvataggio non riuscito (${e.message}).`); }
      finally { bottone.disabled = false; }
    });

    aggiornaElenco();
  }

  // Chiamata dalle pagine quando si apre un'AI: la preseleziona nel campo "AI usata".
  function aiAperta(nome) {
    if (typeof document === 'undefined' || !AI_NOTE.includes(nome)) return;
    document.querySelectorAll('.sae-ai').forEach((s) => { s.value = nome; });
  }

  return { GIUDIZI, AI_NOTE, aiAperta, leggiGiudizio, leggiClassifica, etichetta, pareMarkdown, datiDaIncollare, caricaLettura, inHtml, aggiungiStile, montaSalvataggio };
});
