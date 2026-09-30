/**
 * sessione.js — dispositivo fidato e "Esci" (01/10/2026). Va caricato
 * nell'<head>, subito dopo tema.js, PRIMA degli script della pagina.
 *
 * Ogni browser crea una volta un codice casuale (localStorage) e lo manda a
 * ogni chiamata verso Supabase nell'intestazione "x-dispositivo". Dopo la
 * prima password giusta il database considera fidato questo dispositivo:
 * chi prova password a caso può bloccare i dispositivi nuovi (5 errori → 15
 * minuti) ma non i tuoi. Nel database resta solo l'impronta del codice
 * (sql/dispositivi_fidati.sql nel repo privato; le Edge Function inoltrano
 * l'intestazione).
 *
 * SessioneAste.esci(): toglie questo dispositivo dai fidati, cancella le
 * password ricordate e il codice, e ricarica la pagina.
 */
(function () {
  'use strict';

  const CHIAVE_CODICE = 'aste_dispositivo_v1';
  const CHIAVI_PASSWORD = ['aste_password_v2', 'aste_password_lettura_v1'];
  const ORIGINE_SUPABASE = 'https://igemwrrcmsgaotoqvdzt.supabase.co/';

  function nuovoCodice() {
    const byte = new Uint8Array(32);
    crypto.getRandomValues(byte);
    return Array.from(byte, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Codice del dispositivo: letto una volta; se il browser non permette di
  // salvarlo vale solo per questa pagina (il dispositivo non resta fidato).
  let codice = null;
  try { codice = localStorage.getItem(CHIAVE_CODICE); } catch (e) { /* storage negato */ }
  if (!codice || !/^[0-9a-f]{64}$/.test(codice)) {
    codice = nuovoCodice();
    try { localStorage.setItem(CHIAVE_CODICE, codice); } catch (e) { /* solo in memoria */ }
  }

  // Aggiunge l'intestazione alle sole chiamate verso Supabase (database e
  // Edge Function); tutte le altre richieste restano come sono.
  const fetchOriginale = window.fetch.bind(window);
  window.fetch = function (risorsa, opzioni) {
    if (typeof risorsa === 'string' && risorsa.startsWith(ORIGINE_SUPABASE)) {
      const intestazioni = new Headers((opzioni && opzioni.headers) || {});
      intestazioni.set('x-dispositivo', codice);
      opzioni = { ...(opzioni || {}), headers: intestazioni };
    }
    return fetchOriginale(risorsa, opzioni);
  };

  async function esci() {
    try {
      // SUPABASE_ANON_KEY è definita dallo script di ogni pagina.
      if (typeof SUPABASE_ANON_KEY !== 'undefined') {
        await window.fetch(`${ORIGINE_SUPABASE}rest/v1/rpc/esci_dispositivo`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
      }
    } catch (e) { /* senza rete: il codice locale si cancella comunque, quello nel database scade da solo */ }
    try {
      CHIAVI_PASSWORD.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem(CHIAVE_CODICE);
    } catch (e) { /* storage negato: niente da cancellare */ }
    location.reload();
  }

  window.SessioneAste = { esci };
})();
