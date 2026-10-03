/**
 * menu.js — menu uguale in tutte le pagine (Registro · Configurazione ·
 * Statistiche · Calendario · Manuale) e ritorno alla pagina precedente.
 *
 * Va incluso come PRIMO elemento del <body>: aggiunge in cima una barra
 * sottile (che scorre via con la pagina) ed evidenzia la pagina attuale.
 * Colori dalle variabili CSS della pagina, con valori di riserva.
 *
 * Sulle pagine lunghe elencate in PAGINE_TORNA_SU aggiunge anche il tasto
 * "↑" in basso a destra, che riporta all'inizio della pagina.
 *
 * MenuPagine.torna(evento, pagina): per i link "← Dettaglio asta" /
 * "← Registro". Se si arriva da quella pagina dello stesso sito torna
 * indietro nella cronologia (la pagina ricompare com'era, per esempio il
 * registro con la scheda dell'asta aperta); altrimenti segue il link.
 * Uso: <a href="index.html#ID" onclick="return MenuPagine.torna(event, 'index.html')">.
 */
(function () {
  'use strict';

  const VOCI = [
    { pagina: 'index.html', testo: 'Registro' },
    { pagina: 'config.html', testo: 'Configurazione' },
    { pagina: 'statistiche.html', testo: 'Statistiche' },
    { pagina: 'calendario.html', testo: 'Calendario' },
    { pagina: 'manuale.html', testo: 'Manuale' },
  ];

  const nomePagina = (percorso) => {
    const nome = String(percorso || '').split('/').pop();
    return nome === '' ? 'index.html' : nome;
  };

  const STILE = `
  .menu-pagine { background: var(--surface, #fff); border-bottom: 1px solid var(--border, #d5dad1); padding-top: env(safe-area-inset-top); }
  .menu-pagine-interno { max-width: 1240px; margin: 0 auto; padding: 6px 16px; display: flex; gap: 4px; }
  .menu-pagine a { flex: 0 1 auto; display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px;
    border-radius: 8px; font-family: var(--font-body, system-ui, sans-serif); font-size: .85rem; font-weight: 500;
    color: var(--ink-muted, #5b615a); text-decoration: none; white-space: nowrap; }
  .menu-pagine a:hover { background: var(--surface-2, #e3e7e0); color: var(--ink, #1e2320); }
  .menu-pagine a[aria-current="page"] { background: var(--surface-2, #e3e7e0); color: var(--ink, #1e2320); font-weight: 700; }
  .menu-pagine a { -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; transition: transform .1s ease; }
  @media (pointer: coarse) { .menu-pagine a:active { transform: scale(.96); } }
  @media (max-width: 640px) {
    .menu-pagine-interno { padding: 6px 8px; gap: 2px; overflow-x: auto; }
    .menu-pagine a { flex: 1 1 0; min-height: 44px; padding: 0 3px; font-size: .74rem; }
  }
  @media print { .menu-pagine { display: none !important; } }`;

  // Pagine lunghe dove compare il tasto "torna su" (index.html ha già il
  // suo e resta fuori da questo elenco). Posizione, colori e soglia di
  // comparsa sono gli stessi del tasto del registro (.bottone-torna-su).
  const PAGINE_TORNA_SU = ['statistiche.html', 'superanalisi.html', 'risultato-superanalisi.html', 'superanalisi-gruppo.html', 'manuale.html', 'calendario.html'];

  const STILE_TORNA_SU = `
  .menu-torna-su { position: fixed; right: 20px; bottom: 70px; z-index: 850; width: 42px; height: 42px;
    padding: 0; border-radius: 50%; border: 1px solid var(--border, #d5dad1); background: var(--surface, #fff);
    color: var(--ink-muted, #5b615a); font-size: 1.1rem; cursor: pointer; box-shadow: 0 6px 16px -4px rgba(0,0,0,.2); }
  .menu-torna-su:hover { color: var(--primary, var(--ink, #1e2320)); border-color: var(--primary, var(--ink, #1e2320)); }
  .menu-torna-su.nascosto { display: none; }
  @media (max-width: 640px) { .menu-torna-su { bottom: calc(76px + env(safe-area-inset-bottom)); } }
  @media print { .menu-torna-su { display: none !important; } }`;

  // Stessa soglia del registro: compare dopo 600px di scroll.
  function montaTornaSu() {
    const stile = document.createElement('style');
    stile.textContent = STILE_TORNA_SU;
    document.head.appendChild(stile);
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'menu-torna-su nascosto';
    bottone.setAttribute('aria-label', "Torna all'inizio");
    bottone.textContent = '↑';
    bottone.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(bottone);
    const aggiorna = () => bottone.classList.toggle('nascosto', window.scrollY < 600);
    window.addEventListener('scroll', aggiorna, { passive: true });
    aggiorna();
  }

  function monta() {
    if (document.querySelector('.menu-pagine')) return;
    const stile = document.createElement('style');
    stile.textContent = STILE;
    document.head.appendChild(stile);
    const attuale = nomePagina(location.pathname);
    const nav = document.createElement('nav');
    nav.className = 'menu-pagine';
    nav.setAttribute('aria-label', 'Pagine');
    nav.innerHTML = `<div class="menu-pagine-interno">${VOCI.map((v) =>
      `<a href="${v.pagina}"${v.pagina === attuale ? ' aria-current="page"' : ''}>${v.testo}</a>`).join('')}</div>`;
    document.body.prepend(nav);
    if (PAGINE_TORNA_SU.includes(attuale)) montaTornaSu();
  }

  function torna(evento, pagina) {
    try {
      const provenienza = new URL(document.referrer);
      if (provenienza.origin === location.origin && nomePagina(provenienza.pathname) === pagina && history.length > 1) {
        if (evento) evento.preventDefault();
        history.back();
        return false;
      }
    } catch (e) { /* nessuna provenienza: si segue il link */ }
    return true;
  }

  window.MenuPagine = { torna };
  if (document.body) monta();
  else document.addEventListener('DOMContentLoaded', monta);
})();
