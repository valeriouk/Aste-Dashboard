"""
applica_modifiche_config.py — aggiunge a config.html la card "Ricerca della perizia".

Si esegue con il workflow "Applica modifiche config.html" nel repository della
dashboard. Stessa logica degli script per app.py:
  - modifica 13 punti precisi di config.html;
  - se anche UNO solo non si trova esattamente come previsto, si ferma senza
    toccare nulla e dice quale.
Il workflow poi controlla il JavaScript della pagina e la prova in un browser
simulato (verifica_config.js) prima di salvarla.

La card legge e salva, con la password di sempre, quattro impostazioni:
ricerca estesa sì/no, ricontrollo sì/no, ogni quanti giorni, quante aste al
massimo per giro (funzione imposta_ricerca_perizia, vedi migrazione_ricontrollo.sql).
"""

import sys

FILE = "config.html"

CARD = """        <div class="card-riepilogo">
          <div class="card-riepilogo-testo">
            <p class="card-riepilogo-titolo">Ricerca della perizia</p>
            <p class="card-riepilogo-valore" id="riepilogo-ricerca-perizia">—</p>
          </div>
          <button type="button" class="card-riepilogo-modifica" onclick="apriModale('ricercaPerizia')">Modifica</button>
        </div>
"""

MODALE = """<div id="modale-ricercaPerizia" class="overlay-modale" onclick="if(event.target===this) chiudiModale('ricercaPerizia')">
  <div class="finestra-modale">
    <div class="finestra-modale-intestazione">
      <h2>Ricerca della perizia</h2>
      <button type="button" class="finestra-modale-chiudi" onclick="chiudiModale('ricercaPerizia')" aria-label="Chiudi">×</button>
    </div>
    <div class="finestra-modale-corpo">
      <div class="campo-form">
        <label for="campo-ricerca-estesa">Dove cercare la perizia</label>
        <select id="campo-ricerca-estesa">
          <option value="true">Ricerca estesa: allegati PVP, astegiudiziarie, altri siti collegati, poi avviso</option>
          <option value="false">Come prima: astegiudiziarie, poi avviso</option>
        </select>
        <p class="nota-campo">La ricerca estesa prova anche gli allegati PVP e le pagine dell'asta sui siti collegati all'annuncio (quelli con la bandierina), prima di ripiegare sull'avviso di vendita. Rispetta la scelta su astegiudiziarie fatta in "Altri filtri".</p>
      </div>
      <div class="campo-form">
        <label class="etichetta-checkbox" style="margin-top:0">
          <input type="checkbox" id="campo-ricontrollo-attivo">
          Ricontrolla le aste future ancora lette dall'avviso
        </label>
        <p class="nota-campo">Alla fine di ogni giro dello scanner rifà la ricerca per le aste future rimaste sull'avviso: spesso la perizia viene pubblicata dopo. Se la trova, rifà l'analisi e aggiorna l'asta. Escluse le aste scartate e quelle fuori da area e prezzo attuali. Funziona solo con la ricerca estesa.</p>
      </div>
      <div class="campo-form">
        <label for="campo-ricontrollo-giorni">Ricontrolla ogni (giorni)</label>
        <input type="number" id="campo-ricontrollo-giorni" min="1" max="30" step="1">
      </div>
      <div class="campo-form">
        <label for="campo-ricontrollo-max">Aste ricontrollate al massimo per giro</label>
        <input type="number" id="campo-ricontrollo-max" min="1" max="100" step="1">
        <p class="nota-campo">Circa 15–30 secondi per asta, più l'analisi Gemini quando compare una perizia (a prezzo pieno, non in batch). Più alto = arretrato smaltito prima, ma più minuti GitHub Actions.</p>
      </div>
      <div class="finestra-modale-azioni">
        <button type="button" class="bottone-salva-card" id="bottone-salva-ricercaPerizia" onclick="confermaSalvaCard('ricercaPerizia')">Salva</button>
        <span id="messaggio-salva-ricercaPerizia" class="messaggio-salvataggio-card"></span>
      </div>
    </div>
  </div>
</div>

"""

FUNZIONI = """  function renderizzaRiepilogoRicercaPerizia() {
    const r = ricercaPeriziaAttuale;
    const el = document.getElementById("riepilogo-ricerca-perizia");
    if (!r.estesa) {
      el.textContent = "Come prima: astegiudiziarie, poi avviso";
      return;
    }
    el.textContent = "Ricerca estesa · " + (r.ricontrollo_attivo
      ? `ricontrollo ogni ${r.ricontrollo_giorni} ${r.ricontrollo_giorni === 1 ? "giorno" : "giorni"}, max ${r.ricontrollo_max} aste per giro`
      : "ricontrollo spento");
  }

  // Salva le quattro impostazioni della ricerca perizia con una funzione
  // dedicata (imposta_ricerca_perizia), separata da imposta_configurazione.
  // Viene richiamata anche dopo ogni salvataggio delle altre card: se
  // imposta_configurazione riscrivesse l'intera tabella config, queste
  // impostazioni verrebbero rimesse subito al loro posto.
  async function salvaRicercaPeriziaSulServer() {
    return chiamaRpc("imposta_ricerca_perizia", {
      password_tentativo: passwordCorrente,
      estesa: ricercaPeriziaAttuale.estesa,
      ricontrollo_attivo: ricercaPeriziaAttuale.ricontrollo_attivo,
      ricontrollo_giorni: ricercaPeriziaAttuale.ricontrollo_giorni,
      ricontrollo_max: ricercaPeriziaAttuale.ricontrollo_max
    });
  }

"""

MODIFICHE = [
    ("versione della pagina",
     '<p class="versione-pagina">v3.3</p>',
     '<p class="versione-pagina">v3.4</p>',
     1),
    ("nota del ripristino",
     "ai valori di partenza del progetto. Salva subito, come ogni altra modifica in questa pagina.</p>",
     "ai valori di partenza del progetto. Salva subito, come ogni altra modifica in questa pagina. "
     "La ricerca della perizia resta com'è.</p>",
     1),
    ("card nell'elenco",
     "onclick=\"apriModale('pianificazioneScanner')\">Modifica</button>\n        </div>\n",
     "onclick=\"apriModale('pianificazioneScanner')\">Modifica</button>\n        </div>\n\n" + CARD,
     1),
    ("finestra di modifica",
     "<script>\n  const SUPABASE_URL",
     MODALE + "<script>\n  const SUPABASE_URL",
     1),
    ("stato della card",
     "  let pianificazioneAttuale = {};\n",
     "  let pianificazioneAttuale = {};\n"
     "  let ricercaPeriziaAttuale = {estesa: false, ricontrollo_attivo: true, ricontrollo_giorni: 2, ricontrollo_max: 15};\n",
     1),
    ("lettura da config",
     "\n      pianificazioneAttuale.verifica_batch_minuti = VALORI_PREDEFINITI.verificaBatchMinuti;\n",
     "\n      pianificazioneAttuale.verifica_batch_minuti = VALORI_PREDEFINITI.verificaBatchMinuti;\n"
     "\n"
     "      ricercaPeriziaAttuale.estesa = String(config.ricerca_perizia_estesa ?? false).toLowerCase() === \"true\";\n"
     "      ricercaPeriziaAttuale.ricontrollo_attivo = String(config.ricontrollo_perizie_attivo ?? true).toLowerCase() !== \"false\";\n"
     "      ricercaPeriziaAttuale.ricontrollo_giorni = Number(config.ricontrollo_perizie_giorni ?? 2) || 2;\n"
     "      ricercaPeriziaAttuale.ricontrollo_max = Number(config.ricontrollo_perizie_max ?? 15) || 15;\n",
     1),
    ("riepilogo della card",
     "  function renderizzaTuttiIRiepiloghi() {\n",
     FUNZIONI + "  function renderizzaTuttiIRiepiloghi() {\n    renderizzaRiepilogoRicercaPerizia();\n",
     1),
    ("apertura della finestra con i valori attuali",
     "    } else if (nome === \"pianificazioneScanner\") {\n",
     "    } else if (nome === \"ricercaPerizia\") {\n"
     "      document.getElementById(\"campo-ricerca-estesa\").value = String(ricercaPeriziaAttuale.estesa);\n"
     "      document.getElementById(\"campo-ricontrollo-attivo\").checked = ricercaPeriziaAttuale.ricontrollo_attivo;\n"
     "      document.getElementById(\"campo-ricontrollo-giorni\").value = ricercaPeriziaAttuale.ricontrollo_giorni;\n"
     "      document.getElementById(\"campo-ricontrollo-max\").value = ricercaPeriziaAttuale.ricontrollo_max;\n"
     "    } else if (nome === \"pianificazioneScanner\") {\n",
     1),
    ("controllo dei valori prima di salvare",
     "    } else if (nomeCard === \"pianificazioneScanner\") {\n",
     "    } else if (nomeCard === \"ricercaPerizia\") {\n"
     "      const giorni = Number(document.getElementById(\"campo-ricontrollo-giorni\").value);\n"
     "      const massimo = Number(document.getElementById(\"campo-ricontrollo-max\").value);\n"
     "      if (!Number.isInteger(giorni) || giorni < 1 || giorni > 30) {\n"
     "        msgEl.textContent = \"Ogni quanti giorni: un numero intero tra 1 e 30.\";\n"
     "        msgEl.className = \"messaggio-salvataggio-card messaggio-errore\";\n"
     "        return;\n"
     "      }\n"
     "      if (!Number.isInteger(massimo) || massimo < 1 || massimo > 100) {\n"
     "        msgEl.textContent = \"Aste per giro: un numero intero tra 1 e 100.\";\n"
     "        msgEl.className = \"messaggio-salvataggio-card messaggio-errore\";\n"
     "        return;\n"
     "      }\n"
     "      ricercaPeriziaAttuale.estesa = document.getElementById(\"campo-ricerca-estesa\").value === \"true\";\n"
     "      ricercaPeriziaAttuale.ricontrollo_attivo = document.getElementById(\"campo-ricontrollo-attivo\").checked;\n"
     "      ricercaPeriziaAttuale.ricontrollo_giorni = giorni;\n"
     "      ricercaPeriziaAttuale.ricontrollo_max = massimo;\n"
     "    } else if (nomeCard === \"pianificazioneScanner\") {\n",
     1),
    ("salvataggio della card (e ri-salvataggio dopo le altre card)",
     "      let risultato;\n"
     "      if (nomeCard === \"pianificazioneScanner\") {\n",
     "      let risultato;\n"
     "      if (nomeCard === \"ricercaPerizia\") {\n"
     "        risultato = await salvaRicercaPeriziaSulServer();\n"
     "      } else if (nomeCard === \"pianificazioneScanner\") {\n",
     1),
    ("ri-salvataggio dopo le card di ricerca",
     "        risultato = await salvaConfigCompletaSulServer();\n      }\n",
     "        risultato = await salvaConfigCompletaSulServer();\n"
     "        if (risultato.result === \"success\") await salvaRicercaPeriziaSulServer();\n"
     "      }\n",
     1),
    ("aggiornamento del riepilogo dopo il salvataggio",
     "modelli: renderizzaRiepilogoModelli, pianificazioneScanner: renderizzaRiepilogoPianificazioneScanner\n",
     "modelli: renderizzaRiepilogoModelli, pianificazioneScanner: renderizzaRiepilogoPianificazioneScanner,\n"
     "          ricercaPerizia: renderizzaRiepilogoRicercaPerizia\n",
     1),
    ("ri-salvataggio dopo il ripristino dei predefiniti",
     "      const risultatoConfig = await salvaConfigCompletaSulServer();\n",
     "      const risultatoConfig = await salvaConfigCompletaSulServer();\n"
     "      if (risultatoConfig.result === \"success\") await salvaRicercaPeriziaSulServer();\n",
     1),
]


def main():
    with open(FILE, "rb") as f:
        grezzo = f.read().decode("utf-8")
    crlf = "\r\n" in grezzo
    testo = grezzo.replace("\r\n", "\n")

    if "ricercaPeriziaAttuale" in testo:
        print("⛔ config.html contiene già la card della ricerca perizia: non faccio nulla.")
        sys.exit(1)

    problemi = []
    for descrizione, vecchio, _, attese in MODIFICHE:
        trovate = testo.count(vecchio)
        if trovate != attese:
            problemi.append(f"  - {descrizione}: trovato {trovate} volte, atteso {attese}\n    testo cercato: {vecchio.strip()[:90]!r}")
    if problemi:
        print("⛔ config.html non corrisponde alla versione che conosco. Nessuna modifica applicata.")
        print("\n".join(problemi))
        sys.exit(1)

    for descrizione, vecchio, nuovo, _ in MODIFICHE:
        testo = testo.replace(vecchio, nuovo)
        print(f"  ✓ {descrizione}")

    if crlf:
        testo = testo.replace("\n", "\r\n")
    with open(FILE, "wb") as f:
        f.write(testo.encode("utf-8"))
    print("\n✅ config.html aggiornato con la card \"Ricerca della perizia\".")


if __name__ == "__main__":
    main()
