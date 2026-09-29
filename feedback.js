/**
 * feedback.js — suoni e vibrazione alle azioni principali (29/09/2026).
 *
 * Si accendono e spengono da Configurazione → "Suoni e vibrazione" e valgono
 * solo per il dispositivo su cui li imposti (salvati nel browser). Di
 * partenza: vibrazione accesa, suoni spenti.
 *
 * Vibrazione:
 *   - Android (Chrome): navigator.vibrate.
 *   - iPhone: Safari non permette alle pagine di far vibrare il telefono.
 *     Da iOS 18 toccare un interruttore di sistema (<input type="checkbox"
 *     switch>) dà il "tic" del telefono: qui se ne usa uno invisibile.
 *     Funziona solo durante un tocco vero (non dopo un'attesa di rete) ed è
 *     un comportamento non ufficiale: può smettere con un aggiornamento.
 * Suoni: brevi toni generati al momento (Web Audio), nessun file da scaricare.
 *
 * Uso: Feedback.tocco() · .preferito() · .scartato() · .salvato() · .errore()
 * Nessuna funzione della pagina dipende da questo file: se manca, nulla cambia.
 */
(function () {
  'use strict';

  const CHIAVE = 'aste_feedback_v1';
  const PREDEFINITE = { vibrazione: true, suoni: false };

  function leggi() {
    try { return { ...PREDEFINITE, ...(JSON.parse(localStorage.getItem(CHIAVE) || '{}')) }; }
    catch (e) { return { ...PREDEFINITE }; }
  }
  function imposta(nuove) {
    const valori = { ...leggi(), ...nuove };
    try { localStorage.setItem(CHIAVE, JSON.stringify(valori)); } catch (e) { /* solo per questa visita */ }
    return valori;
  }

  // ---------------------------------------------------------------- vibrazione
  let interruttoreIos = null;
  function ticIos() {
    try {
      if (!interruttoreIos) {
        const etichetta = document.createElement('label');
        etichetta.setAttribute('aria-hidden', 'true');
        etichetta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
        const casella = document.createElement('input');
        casella.type = 'checkbox';
        casella.setAttribute('switch', '');
        casella.tabIndex = -1;
        etichetta.appendChild(casella);
        document.body.appendChild(etichetta);
        interruttoreIos = etichetta;
      }
      interruttoreIos.click();
    } catch (e) { /* niente vibrazione */ }
  }
  function vibra(schema) {
    if (!leggi().vibrazione) return;
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(schema); } catch (e) { /* ignorato */ }
    } else {
      ticIos();
    }
  }

  // ---------------------------------------------------------------- suoni
  let audio = null;
  function contesto() {
    const Classe = window.AudioContext || window.webkitAudioContext;
    if (!Classe) return null;
    if (!audio) audio = new Classe();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }
  // Un tono breve che scivola da una frequenza all'altra, volume basso.
  function tono(da, a, durata, ritardo = 0, tipo = 'sine', volume = 0.08) {
    const c = contesto();
    if (!c) return;
    const t = c.currentTime + ritardo;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(da, t);
    osc.frequency.exponentialRampToValueAtTime(a, t + durata);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durata);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + durata + 0.02);
  }
  function suona(fn) {
    if (!leggi().suoni) return;
    try { fn(); } catch (e) { /* niente suono */ }
  }

  // ---------------------------------------------------------------- azioni
  const Feedback = {
    leggi,
    imposta,
    tocco() { vibra(8); },
    preferito() { vibra(12); suona(() => tono(880, 1320, 0.09)); },
    scartato() { vibra(12); suona(() => tono(330, 220, 0.11)); },
    salvato() { vibra([10, 40, 10]); suona(() => { tono(660, 660, 0.07); tono(990, 990, 0.09, 0.08); }); },
    errore() { vibra([40, 60, 40]); suona(() => tono(200, 150, 0.18, 0, 'triangle', 0.1)); },
    // Dalla Configurazione: fa sentire l'effetto anche se è appena stato spento/acceso.
    prova() { vibra([10, 40, 10]); suona(() => { tono(660, 660, 0.07); tono(990, 990, 0.09, 0.08); }); },
  };
  window.Feedback = Feedback;
})();
