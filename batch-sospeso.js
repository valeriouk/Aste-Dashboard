/**
 * batch-sospeso.js — indicatore "batch in attesa" (registro e Configurazione).
 *
 * Le aste inviate a un batch (Gemini o Claude) restano in coda finché verifica_batch.py non
 * ha scritto i risultati e mandato le notifiche. Questo script legge solo i
 * numeri (funzione leggi_batch_in_sospeso, sql/batch_in_sospeso.sql nel
 * repository privato, password come le altre letture) e mostra una riga:
 * "📦 N aste in attesa del batch · inviato 2 ore fa". La riga compare se la
 * coda non è vuota e sparisce da sola quando si svuota. Dopo 24 ore di attesa
 * diventa un avviso ("da più di 24 ore").
 * La coda comprende anche i batch del ricontrollo delle perizie.
 * Si rilegge ogni minuto (scheda visibile) e quando si torna sulla scheda.
 * Un errore o una password mancante nascondono la riga: non blocca mai la pagina.
 *
 * Uso:
 *   BatchInSospeso.avvia({
 *     elemento: document.getElementById("indicatore-batch"),   // un <button class="nascosto">
 *     url: SUPABASE_URL, chiave: SUPABASE_ANON_KEY,
 *     tipo: "lettura" | "scrittura",
 *     password: () => passwordCorrente,                        // "" se non ancora nota
 *     alClic: () => { ... },
 *   });
 */
(function () {
  'use strict';

  const SOGLIA_ORE = 24;
  const INTERVALLO_MS = 60000;

  const stile = document.createElement('style');
  stile.textContent =
    '.indicatore-batch{display:block;width:100%;text-align:left;background:var(--secondary-soft,rgba(208,138,102,.16));' +
    'color:inherit;border:1px solid var(--secondary,#d08a66);border-radius:12px;padding:8px 14px;margin:0 0 14px;' +
    'font:inherit;font-size:.88rem;font-weight:600;cursor:pointer}' +
    '.indicatore-batch.in-ritardo{border-color:var(--danger,#e07a66);color:var(--danger,#e07a66)}' +
    '.indicatore-batch.nascosto{display:none}';
  document.head.appendChild(stile);

  function testoAttesa(ore) {
    if (ore < 1) return 'inviato meno di un\'ora fa';
    const intere = Math.floor(ore);
    return 'inviato ' + (intere === 1 ? '1 ora' : intere + ' ore') + ' fa';
  }

  function avvia(opzioni) {
    const el = opzioni.elemento;
    if (!el) return;
    let numeroRichiesta = 0;

    function nascondi() { el.classList.add('nascosto'); }

    function mostra(r) {
      const aste = Number(r.aste) || 0;
      if (aste <= 0) { nascondi(); return; }
      const adesso = new Date(r.ora).getTime();
      const inviato = new Date(r.piu_vecchio).getTime();
      const ore = isNaN(adesso) || isNaN(inviato) ? null : Math.max(0, (adesso - inviato) / 3600000);
      const nome = aste === 1 ? '1 asta' : aste + ' aste';
      const ritardo = ore !== null && ore >= SOGLIA_ORE;
      el.classList.toggle('in-ritardo', ritardo);
      el.textContent = ritardo
        ? '⚠ ' + nome + ' in attesa del batch da più di ' + SOGLIA_ORE + ' ore · controlla il batch'
        : '📦 ' + nome + ' in attesa del batch' + (ore === null ? '' : ' · ' + testoAttesa(ore));
      el.title = 'Batch in corso (Gemini o Claude): le aste vengono scritte e notificate quando il risultato è pronto (da pochi minuti a 24 ore). ' +
                 'Si controlla da solo ogni ora; a mano con "Controlla batch ora" in Configurazione.';
      el.classList.remove('nascosto');
    }

    async function aggiorna() {
      const password = opzioni.password ? opzioni.password() : '';
      if (!password) { nascondi(); return; }
      const mia = ++numeroRichiesta;
      try {
        const risposta = await fetch(opzioni.url + '/rest/v1/rpc/leggi_batch_in_sospeso', {
          method: 'POST',
          headers: { apikey: opzioni.chiave, Authorization: 'Bearer ' + opzioni.chiave, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password_tentativo: password, tipo: opzioni.tipo || 'lettura' }),
        });
        if (!risposta.ok) throw new Error('HTTP ' + risposta.status);
        const dati = await risposta.json();
        if (mia !== numeroRichiesta) return;   // risposta fuori ordine: vale l'ultima richiesta
        if (dati && dati.result === 'success') mostra(dati); else nascondi();
      } catch (e) {
        if (mia === numeroRichiesta) nascondi();
      }
    }

    el.addEventListener('click', () => { if (opzioni.alClic) opzioni.alClic(); });
    setInterval(() => { if (!document.hidden) aggiorna(); }, INTERVALLO_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) aggiorna(); });
    aggiorna();
    return { aggiorna };
  }

  window.BatchInSospeso = { avvia };
})();
