// Outils du panneau pour piloter les onglets (partagés par panneau.js et annuaire.js).
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Ouvre url dans l'onglet et attend la fin du chargement. Si la page ne finit jamais de charger, on rend la main
// au bout de 30 s quand même : la suite remontera l'erreur.
export function chargerOnglet(tabId, url) {
  return new Promise((resolve) => {
    const fin = () => { clearTimeout(minuteur); chrome.tabs.onUpdated.removeListener(ecoute); resolve(); };
    const ecoute = (id, info) => id === tabId && info.status === 'complete' && fin();
    const minuteur = setTimeout(fin, 30000);
    chrome.tabs.onUpdated.addListener(ecoute);
    // Onglet fermé : le refus est attrapé et on rend la main tout de suite (au lieu de 30 s d’attente).
    chrome.tabs.update(tabId, { url }).catch(fin);
  });
}
