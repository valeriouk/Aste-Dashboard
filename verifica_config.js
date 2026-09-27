/**
 * verifica_config.js — prova config.html in un browser simulato (jsdom).
 * Uso: node verifica_config.js config.html
 *
 * Nessuna chiamata vera a Supabase: le risposte sono simulate. Controlla che:
 *  - la pagina si apra senza errori JavaScript e mostri le card di sempre;
 *  - la nuova card "Ricerca della perizia" legga i valori da config;
 *  - il salvataggio mandi a imposta_ricerca_perizia i valori giusti;
 *  - un valore non valido venga fermato prima di chiamare il server;
 *  - dopo il salvataggio di un'altra card e dopo il ripristino dei
 *    predefiniti, le impostazioni della ricerca perizia vengano riscritte.
 */
const fs = require("fs");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const file = process.argv[2] || "config.html";
const html = fs.readFileSync(file, "utf8");
const errori = [];
const chiamate = [];

const RIGHE_CONFIG = [
  { parametro: "raggio_km", valore: "22" },
  { parametro: "prezzo_base_max", valore: "85000" },
  { parametro: "ricerca_perizia_estesa", valore: "true" },
  { parametro: "ricontrollo_perizie_giorni", valore: "3" },
  { parametro: "ricontrollo_perizie_max", valore: "20" },
];

function risposta(dati) {
  return Promise.resolve({ ok: true, status: 200, json: async () => dati });
}

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://esempio.github.io/Aste-Dashboard/config.html",
  beforeParse(window) {
    window.localStorage.setItem("aste_password_v2", "segreta");
    window.fetch = (url, opzioni = {}) => {
      const nome = String(url).split("/rpc/")[1];
      const corpo = opzioni.body ? JSON.parse(opzioni.body) : null;
      if (nome) chiamate.push({ nome, corpo });
      if (String(url).includes("/rest/v1/config")) return risposta(RIGHE_CONFIG);
      if (String(url).includes("nominatim")) return risposta({ address: { town: "Catania" } });
      if (nome === "verifica_password") return risposta(true);
      if (nome === "stato_pianificazione") return risposta({});
      if (nome === "stato_password_lettura") return risposta({ result: "success", attiva: false });
      if (nome === "registra_visita") return risposta(null);
      if (["imposta_ricerca_perizia", "imposta_configurazione", "imposta_pianificazione"].includes(nome)) {
        return risposta({ result: "success" });
      }
      return risposta({ result: "error", message: "non previsto: " + url });
    };
    window.addEventListener("error", (e) => errori.push(e.message));
  },
});
const w = dom.window;
const d = w.document;
w.console.error = (...a) => errori.push(a.join(" "));
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
const chiamateA = (nome) => chiamate.filter((c) => c.nome === nome);
let superati = 0;
const ok = (nome) => { superati++; console.log(`  ✓ ${nome}`); };

async function doppioClic(id) {
  d.getElementById(id).click();
  d.getElementById(id).click();
  await aspetta(150);
}

(async () => {
  await aspetta(400);
  console.log("\nVerifica di " + file);

  assert.ok(!d.getElementById("contenuto-config").classList.contains("nascosto"), "la configurazione non si è aperta");
  assert.notStrictEqual(d.getElementById("riepilogo-prezzo").textContent, "—", "riepilogo prezzo vuoto");
  assert.notStrictEqual(d.getElementById("riepilogo-pianificazione-scanner").textContent, "—");
  ok("la pagina si apre e le card di sempre mostrano i loro valori");

  const riepilogo = () => d.getElementById("riepilogo-ricerca-perizia").textContent;
  assert.strictEqual(riepilogo(), "Ricerca estesa · ricontrollo ogni 3 giorni, max 20 aste per giro");
  ok("la card della ricerca perizia legge i valori da config");

  w.apriModale("ricercaPerizia");
  assert.strictEqual(d.getElementById("campo-ricerca-estesa").value, "true");
  assert.strictEqual(d.getElementById("campo-ricontrollo-attivo").checked, true);
  assert.strictEqual(d.getElementById("campo-ricontrollo-giorni").value, "3");
  assert.strictEqual(d.getElementById("campo-ricontrollo-max").value, "20");
  ok("la finestra si apre con i valori attuali");

  d.getElementById("campo-ricontrollo-giorni").value = "0";
  await doppioClic("bottone-salva-ricercaPerizia");
  assert.strictEqual(chiamateA("imposta_ricerca_perizia").length, 0);
  assert.ok(d.getElementById("messaggio-salva-ricercaPerizia").textContent.includes("tra 1 e 30"));
  ok("un valore non valido viene fermato prima del server");

  d.getElementById("campo-ricontrollo-giorni").value = "4";
  d.getElementById("campo-ricontrollo-max").value = "25";
  d.getElementById("campo-ricontrollo-attivo").checked = false;
  await doppioClic("bottone-salva-ricercaPerizia");
  const salvata = chiamateA("imposta_ricerca_perizia").pop();
  assert.deepStrictEqual(salvata.corpo, {
    password_tentativo: "segreta", estesa: true, ricontrollo_attivo: false, ricontrollo_giorni: 4, ricontrollo_max: 25,
  });
  assert.strictEqual(riepilogo(), "Ricerca estesa · ricontrollo spento");
  ok("il salvataggio manda i valori giusti e aggiorna il riepilogo");

  const prima = chiamateA("imposta_ricerca_perizia").length;
  w.apriModale("altri");
  await doppioClic("bottone-salva-altri");
  assert.strictEqual(chiamateA("imposta_configurazione").length, 1);
  assert.strictEqual(chiamateA("imposta_ricerca_perizia").length, prima + 1);
  assert.strictEqual(chiamateA("imposta_ricerca_perizia").pop().corpo.ricontrollo_max, 25);
  ok("salvando un'altra card, le impostazioni della perizia vengono riscritte");

  d.getElementById("bottone-ripristina-predefiniti").click();
  d.getElementById("bottone-ripristina-predefiniti").click();
  await aspetta(150);
  assert.strictEqual(chiamateA("imposta_ricerca_perizia").length, prima + 2);
  assert.strictEqual(chiamateA("imposta_ricerca_perizia").pop().corpo.ricontrollo_giorni, 4);
  ok("dopo il ripristino dei predefiniti, le impostazioni della perizia restano quelle scelte");

  assert.deepStrictEqual(errori, [], "errori JavaScript: " + errori.join(" | "));
  ok("nessun errore JavaScript");
  console.log(`\n${superati} controlli superati\n`);
  process.exit(0);
})().catch((e) => {
  console.error("\n⛔ Verifica fallita:", e.message);
  if (errori.length) console.error("Errori JavaScript:", errori);
  process.exit(1);
});
