// Injecté dans l'onglet du réseau avant chaque action : petits outils partagés par tous les réseaux.
globalThis.BFX = {
  q: (s, r = document) => r.querySelector(s),
  qa: (s, r = document) => [...r.querySelectorAll(s)],
  pause: (ms) => new Promise((r) => setTimeout(r, ms)),
  // Attend que test() renvoie une valeur (vérifié toutes les 250 ms) ; null au bout de ms.
  async attendre(test, ms) {
    const debut = Date.now();
    while (Date.now() - debut < ms) {
      const r = test();
      if (r) return r;
      await BFX.pause(250);
    }
    return null;
  },
  visible: (e) => !!e && e.getClientRects().length > 0,
  texte: (e) => (e?.innerText || e?.textContent || '').trim(),
  etiquette: (e) => (e?.getAttribute?.('aria-label') || '').trim(),
  boutons(racine = document) {
    return [...racine.querySelectorAll('button, [role="button"], [role="menuitem"], a[role="link"]')].filter(BFX.visible);
  },
  // Bouton dont le texte (ou l'étiquette) correspond exactement à rx.
  trouver(rx, racine = document) {
    return BFX.boutons(racine).find((b) => rx.test(BFX.texte(b)) || rx.test(BFX.etiquette(b)));
  },
  fenetres() {
    return BFX.qa('[role="dialog"], [role="menu"], [role="alertdialog"]').filter(BFX.visible);
  },
  captcha: () => !!document.querySelector('[id*="captcha" i], [class*="captcha" i], iframe[src*="captcha" i], iframe[src*="challenge" i]'),
  corps: () => document.body?.innerText || '',
  // Lecture d'une liste qui se charge au défilement : lire(vus) ajoute les comptes visibles, defiler() fait avancer la liste ;
  // on s'arrête après 4 tours sans nouveau compte (ou à max comptes).
  async recolter(lire, defiler, ms, max = Infinity) {
    const vus = new Set();
    let calme = 0;
    while (calme < 4 && vus.size < max) {
      const avant = vus.size;
      lire(vus);
      defiler();
      await BFX.pause(ms);
      calme = vus.size === avant ? calme + 1 : 0;
    }
    return vus;
  },
  // Pour les erreurs : ce que la page montre, afin de pouvoir corriger l'extension.
  reperes() {
    const attrs = new Set();
    for (const e of document.querySelectorAll('[data-testid], [data-e2e], [aria-label]')) {
      attrs.add(e.getAttribute('data-testid') || e.getAttribute('data-e2e') || 'aria:' + e.getAttribute('aria-label'));
      if (attrs.size > 45) break;
    }
    const f = BFX.fenetres().map((d) => BFX.texte(d).slice(0, 90).replace(/\n/g, ' | ')).join(' // ');
    return `repères : ${[...attrs].join(', ').slice(0, 900)}${f ? `\n  fenêtres : ${f}` : ''}`;
  },
};
