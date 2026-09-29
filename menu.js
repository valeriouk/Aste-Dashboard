/**
 * menu.js — menu uguale in tutte le pagine (Registro · Statistiche ·
 * Configurazione · Manuale) e ritorno alla pagina precedente.
 *
 * Va incluso come PRIMO elemento del <body>: aggiunge in cima una barra
 * sottile (che scorre via con la pagina) ed evidenzia la pagina attuale.
 * Colori dalle variabili CSS della pagina, con valori di riserva.
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
    { pagina: 'statistiche.html', testo: 'Statistiche' },
    { pagina: 'config.html', testo: 'Configurazione' },
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
    .menu-pagine-interno { padding: 6px 8px; gap: 2px; }
    .menu-pagine a { flex: 1 1 0; min-height: 44px; padding: 0 4px; font-size: .8rem; }
  }
  @media print { .menu-pagine { display: none !important; } }`;

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
