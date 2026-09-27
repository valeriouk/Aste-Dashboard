/**
 * test_underwriting.js — eseguire con: node test_underwriting.js
 *
 * I casi vengono da fixture_v2.json, condiviso con test_analisi_v2.py.
 * Sono i dati riportati nella conversazione con ChatGPT, NON le perizie
 * originali: servono a verificare che il motore calcoli correttamente,
 * non a valutare le aste.
 */
const assert = require('assert');
const U = require('./underwriting');
const { casi: C } = require('./fixture_v2.json');

const OGGI = '2026-09-26';
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log(`  ✓ ${nome}`); };
const vicino = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: atteso ${b}, ottenuto ${a}`);

console.log('\nTest underwriting.js');

t('imposte: prezzo-valore Mascalucia (rendita €267,27)', () => {
  const i = U.imposteAcquisto(49620, 267.27, U.PARAMETRI_DEFAULT);
  vicino(i.valoreCatastale, 33676.02, 0.01, 'valore catastale');
  vicino(i.totale, 3130.84, 0.01, 'imposte totali');
  assert.strictEqual(i.prezzoValoreApplicato, true);
});
t('imposte: senza rendita → 9% sul prezzo', () => {
  vicino(U.imposteAcquisto(12714, null, U.PARAMETRI_DEFAULT).totale, 1244.26, 0.01, 'Tremestieri');
});
t('imposte: minimo €1.000 di registro', () => {
  assert.strictEqual(U.imposteAcquisto(8000, null, U.PARAMETRI_DEFAULT).totale, 1100);
});
t('imposte: prezzo-valore non usato se valore catastale > prezzo', () => {
  const i = U.imposteAcquisto(20000, 300, U.PARAMETRI_DEFAULT);
  assert.strictEqual(i.prezzoValoreApplicato, false);
  vicino(i.registro, 1800, 0.01, 'registro');
});
t('compenso delegato: stesse fasce di index.html (550 + 4% + 22%)', () => {
  vicino(U.compensoDelegato(49620), 697.84, 0.01, 'fino a 100k');
  vicino(U.compensoDelegato(120000), 837.41, 0.01, 'fino a 500k');
  assert.strictEqual(U.compensoDelegato(600000), null);
});
t('tentativo con ribassi 25%: Tremestieri 7°, Siracusa 2°, Mascalucia 2°', () => {
  assert.strictEqual(U.stimaTentativo(95240, 16952).tentativo, 7);
  assert.strictEqual(U.stimaTentativo(66900, 50000).tentativo, 2);
  assert.strictEqual(U.stimaTentativo(88211, 66159).tentativo, 2);
});

// Ricalcolo con le STESSE ipotesi usate da ChatGPT per Siracusa
const parChatGPT = {
  dataRiferimento: OGGI, imprevistiPct: 0.05, commissioneVenditaPct: 0.03, costiVenditaFissi: 0,
  costoMensileHolding: 0, speseProceduraAggiudicatario: 0, tecnicoPratiche: 2500,
  moltiplicatoreLavori: { prudenziale: 1, centrale: 1, ottimistico: 1 },
};
const annSir = { ...C.siracusa.annuncio, lavoriOverride: 13500, arvOverride: { prudenziale: 80000, centrale: 85000, ottimistico: 90000 } };
const sir = U.analizzaAsta(C.siracusa.estrazione, annSir, parChatGPT);

t('Siracusa: MAX_BID €20k con ARV €85k ≈ €41.9k (ChatGPT diceva €59–64k)', () => {
  vicino(sir.maxBid.centrale, 41903, 2, 'max bid centrale');
});
t('Siracusa: MAX_BID €20k con ARV €90k ≈ €46.4k', () => {
  vicino(sir.maxBid.ottimistico, 46353, 2, 'max bid ottimistico');
});
t('Siracusa: utile al minimo (€37.500, ARV €85k) ≈ €24.8k', () => {
  vicino(sir.scenariAlMinimo.centrale.utile, 24800, 2, 'utile');
});
t('Siracusa: aggiudicando a €59k l\'utile sarebbe ~€1,4k, non €20k', () => {
  const r = U.analizzaAsta(C.siracusa.estrazione, { ...annSir, offertaMinima: 59000 }, parChatGPT);
  vicino(r.scenariAlMinimo.centrale.utile, 1365, 2, 'utile a 59k');
});

t('normalizzazione: valori fuori schema → default + avviso', () => {
  const { d, avvisi } = U.normalizza({ occupazione: { stato: 'boh' }, superfici: { lorda_coperta_mq: '1.250,5' } });
  assert.strictEqual(d.occupazione.stato, 'non_indicato');
  assert.strictEqual(d.superfici.lorda, 1250.5);
  assert.ok(avvisi.length >= 1);
});
t('superficie: si vende ciò che resta dopo la demolizione', () => {
  const x = JSON.parse(JSON.stringify(C.gravina.estrazione));
  x.urbanistica.difformita[1].riduce_superficie_mq = 8;
  assert.strictEqual(U.superficieCommerciale(U.normalizza(x).d, U.PARAMETRI_DEFAULT).mq, 96.5);
});

const par = { dataRiferimento: OGGI, comuniTarget: ['Mascalucia', 'Viagrande', 'Zafferana Etnea', 'Tremestieri Etneo', 'Gravina di Catania', 'Trecastagni'] };
const ARV = {
  siracusa: { prudenziale: 80000, centrale: 85000, ottimistico: 90000 },
  mascalucia: { prudenziale: 80000, centrale: 90000, ottimistico: 100000 },
  tremestieri: { prudenziale: 80000, centrale: 90000, ottimistico: 100000 },
  gravina: { prudenziale: 100000, centrale: 110000, ottimistico: 120000 },
};
const r = Object.fromEntries(Object.keys(ARV).map((k) => [k, U.analizzaAsta(C[k].estrazione, { ...C[k].annuncio, arvOverride: ARV[k] }, par)]));

t('Tremestieri → COMPLESSA, qualità C', () => {
  assert.strictEqual(r.tremestieri.classe, 'COMPLESSA');
  assert.strictEqual(r.tremestieri.qualita.livello, 'C');
});
t('Gravina → COMPLESSA (prospetti + difformità non determinata)', () => {
  assert.strictEqual(r.gravina.classe, 'COMPLESSA');
});
t('Mascalucia → PULITA, occupazione presa dall\'annuncio con avviso', () => {
  assert.strictEqual(r.mascalucia.classe, 'PULITA');
  assert.strictEqual(r.mascalucia.occupazione, 'libero');
  assert.ok(r.mascalucia.avvisi.some((a) => a.includes('custode')));
});
t('Siracusa → fuori zona target (comune dalla perizia)', () => {
  assert.strictEqual(r.siracusa.inZonaTarget, false);
});
t('zona target: "Mascalucia (CT)" sì, "Gravina di Catania" non vale per "Catania"', () => {
  const x = JSON.parse(JSON.stringify(C.mascalucia.estrazione));
  x.identificazione.comune = 'Mascalucia (CT)';
  const a = { ...C.mascalucia.annuncio, arvOverride: ARV.mascalucia };
  assert.strictEqual(U.analizzaAsta(x, a, par).inZonaTarget, true);
  const g = { ...C.gravina.annuncio, arvOverride: ARV.gravina };
  assert.strictEqual(U.analizzaAsta(C.gravina.estrazione, g, { dataRiferimento: OGGI, comuniTarget: ['Catania'] }).inZonaTarget, false);
});
t('zona target dall\'indirizzo quando la perizia non dà il comune', () => {
  const x = JSON.parse(JSON.stringify(C.mascalucia.estrazione));
  delete x.identificazione.comune;
  const esito = U.analizzaAsta(x, { ...C.mascalucia.annuncio, arvOverride: ARV.mascalucia }, par);
  assert.strictEqual(esito.inZonaTarget, true);
});
t('solo avviso di vendita → qualità C e mai "ideale per iniziare"', () => {
  const esito = U.analizzaAsta(C.solo_avviso.estrazione, { ...C.solo_avviso.annuncio, arvOverride: ARV.mascalucia }, par);
  assert.strictEqual(esito.qualita.livello, 'C');
  assert.ok(esito.qualita.motivi.some((m) => m.includes('avviso di vendita')));
  assert.strictEqual(esito.idealePerIniziare, false);
});

console.log(`\n${ok} test superati\n`);
