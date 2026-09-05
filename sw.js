// Service worker minimo — esiste solo per soddisfare i criteri di
// installabilità (in particolare il prompt automatico di Chrome, che
// richiede ancora un gestore "fetch" anche se il menu "Installa app"
// da solo non lo richiede più dalla versione 108/112 in poi).
// Nessuna cache, nessuna logica offline: se in futuro vorrai la
// dashboard consultabile anche offline, si estende da qui.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
