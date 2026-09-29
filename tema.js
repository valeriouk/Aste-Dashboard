/**
 * tema.js — tema chiaro / scuro (29/09/2026). Va caricato nell'<head>, PRIMA
 * che la pagina si disegni (niente lampo di colore sbagliato).
 *
 * Scelta per dispositivo, da Configurazione → "Tema": Automatico (segue il
 * telefono/computer, predefinito) · Chiaro · Scuro. Salvata nel browser.
 * Imposta su <html>:
 *   data-tema="chiaro" | "scuro"  (nessun attributo = automatico)
 *   classe "tema-scuro" quando il tema scuro è davvero attivo
 * I colori sono in colori.css. Aggiorna anche il colore della barra del
 * browser (meta theme-color).
 */
(function () {
  'use strict';

  const CHIAVE = 'aste_tema_v1';
  const COLORE_BARRA = { chiaro: '#ffffff', scuro: '#1b1f1c' };
  const scuroDispositivo = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function leggi() {
    try {
      const v = localStorage.getItem(CHIAVE);
      return v === 'chiaro' || v === 'scuro' ? v : 'automatico';
    } catch (e) { return 'automatico'; }
  }

  function applica() {
    const scelta = leggi();
    const radice = document.documentElement;
    if (scelta === 'automatico') radice.removeAttribute('data-tema');
    else radice.setAttribute('data-tema', scelta);
    const scuro = scelta === 'scuro' || (scelta === 'automatico' && !!(scuroDispositivo && scuroDispositivo.matches));
    radice.classList.toggle('tema-scuro', scuro);
    const colore = scuro ? COLORE_BARRA.scuro : COLORE_BARRA.chiaro;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', colore));
  }

  function imposta(scelta) {
    try {
      if (scelta === 'chiaro' || scelta === 'scuro') localStorage.setItem(CHIAVE, scelta);
      else localStorage.removeItem(CHIAVE);
    } catch (e) { /* vale solo per questa visita */ }
    applica();
  }

  applica();
  // Col tema automatico segue il telefono anche se cambia mentre la pagina è aperta (es. al tramonto).
  if (scuroDispositivo) {
    const aggiorna = () => { if (leggi() === 'automatico') applica(); };
    if (scuroDispositivo.addEventListener) scuroDispositivo.addEventListener('change', aggiorna);
    else if (scuroDispositivo.addListener) scuroDispositivo.addListener(aggiorna);
  }
  // Il meta theme-color può essere dopo questo script: si riapplica a pagina pronta.
  document.addEventListener('DOMContentLoaded', applica);

  window.Tema = { leggi, imposta };
})();
