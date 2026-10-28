// Un « adaptateur » par réseau : comment reconnaître un compte, savoir si tu es connecté, bloquer un profil,
// et lire la liste de tes comptes déjà bloqués. Les fonctions agir* et lireBloques* sont injectées dans l'onglet du réseau :
// elles ne doivent rien référencer de ce fichier, seulement globalThis.BFX (commun.js, injecté juste avant),
// sauf lireBloquesTikTokDirect, exécutée dans la page elle-même (monde « MAIN ») et donc sans BFX.

const PAGES_X = new Set(['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'compose', 'i', 'login', 'logout', 'signup', 'account', 'tos', 'privacy']);
const PAGES_IG = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'about', 'legal', 'direct', 'tv', 'web']);
const PAGES_FB = new Set(['login', 'settings', 'groups', 'events', 'watch', 'marketplace', 'gaming', 'help', 'policies', 'privacy', 'home.php',
  // Correctif : ces chemins ne sont pas des profils (« people » venait de liens facebook.com/people/Nom/123…).
  'people', 'pages', 'pg', 'profile.php', 'permalink.php', 'story.php', 'photo.php', 'photo', 'reel', 'videos', 'hashtag', 'search']);

// ——— X (même parcours que Blockfacho) ———
async function agirX(bloquer) {
  const B = globalThis.BFX, q = B.q;
  if (!(await B.attendre(() => q('[data-testid="SideNav_AccountSwitcher_Button"]'), 15000))) {
    return q('[data-testid="loginButton"], a[href="/login"]') ? 'deconnecte' : 'limite';
  }
  const statut = await B.attendre(
    () => (q('[data-testid$="-unblock"]') && 'deja') || (q('[data-testid="userActions"]') && 'a_bloquer') || (q('[data-testid="emptyState"]') && 'introuvable'),
    20000,
  );
  if (statut !== 'a_bloquer') return statut ?? 'erreur: page de profil non reconnue';
  if (!bloquer) return 'serait_bloque';
  // Le menu « ⋯ » ne s'ouvre pas toujours au premier clic (page pas encore prête, profils avec bouton « Souscription »…) :
  // on attend qu'il apparaisse, sinon on refait défiler jusqu'au bouton et on reclique (3 essais).
  const entreeBloquer = () => q('[data-testid="block"]')
    || B.qa('[role="menuitem"]').find((e) => B.visible(e) && /^(bloquer|block) @/i.test(B.texte(e)));
  let menu = null;
  for (let essai = 0; essai < 3 && !menu; essai++) {
    const bouton = q('[data-testid="userActions"]');
    if (!bouton) break;
    bouton.scrollIntoView({ block: 'center' });
    await B.pause(400 + essai * 600);
    bouton.click();
    menu = await B.attendre(entreeBloquer, 4000);
    if (!menu && q('[data-testid="Dropdown"], [role="menu"]')) {
      // Menu ouvert sans « Bloquer » : déjà bloqué (« Débloquer ») ou compte qu'on ne peut pas bloquer.
      if (B.qa('[role="menuitem"]').some((e) => /^(débloquer|unblock) @/i.test(B.texte(e)))) return 'deja';
      break;
    }
  }
  if (!menu) return 'erreur: entrée Bloquer absente du menu';
  menu.click();
  const confirmer = await B.attendre(() => q('[data-testid="confirmationSheetConfirm"]'), 10000);
  if (!confirmer) return 'erreur: confirmation absente';
  confirmer.click();
  return (await B.attendre(() => q('[data-testid$="-unblock"]'), 5000)) ? 'bloque' : 'a_verifier';
}

async function lireBloquesX() {
  const B = globalThis.BFX;
  // 1) Méthode directe : la liste que la page des réglages de X demande elle-même, avec ta session (rien ne sort de x.com).
  const ct0 = document.cookie.match(/(?:^|; )ct0=([^;]+)/)?.[1];
  if (ct0) {
    try {
      const vus = new Set();
      let curseur = '-1';
      for (let page = 0; page < 40 && curseur !== '0'; page++) {
        const r = await fetch(`/i/api/1.1/blocks/list.json?count=200&skip_status=true&include_entities=false&cursor=${curseur}`, {
          credentials: 'include',
          headers: {
            authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
            'x-csrf-token': decodeURIComponent(ct0), 'x-twitter-active-user': 'yes', 'x-twitter-auth-type': 'OAuth2Session',
          },
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        for (const u of d.users || []) if (u.screen_name) vus.add(u.screen_name.toLowerCase());
        curseur = d.next_cursor_str || '0';
      }
      return { handles: [...vus], methode: 'directe' };
    } catch (e) { /* on passe à la lecture de la page */ }
  }
  // 2) Secours : lire la page des comptes bloqués en la faisant défiler.
  const prete = await B.attendre(() => B.q('[data-testid="UserCell"]') || B.q('[data-testid="loginButton"]'), 40000);
  if (B.q('[data-testid="loginButton"]')) return { erreur: 'pas connecté' };
  if (!prete) return { erreur: 'la liste ne s’est pas affichée' };
  await B.pause(2000);
  const vus = await B.recolter((vus) => {
    for (const c of B.qa('[data-testid="UserCell"]')) {
      for (const a of c.querySelectorAll('a[href^="/"]')) {
        const m = a.getAttribute('href').match(/^\/(\w{1,15})$/);
        if (m) { vus.add(m[1].toLowerCase()); break; }
      }
    }
  }, () => window.scrollBy(0, 1500), 1300, 50000);
  return vus.size ? { handles: [...vus], methode: 'page' } : { erreur: 'aucun compte lu sur la page' };
}

// ——— TikTok ———
async function agirTikTok(bloquer) {
  const B = globalThis.BFX, q = B.q;
  const BLOQUER = /^(bloquer|block)$/i, DEBLOQUER = /^(débloquer|unblock)$/i;
  const SE_CONNECTER = /^(se connecter|connexion|log in|login|sign in)$/i;
  const deconnecte = () => !!q('[data-e2e="top-login-button"]') || B.qa('button, a, [role="button"]').some((e) => B.visible(e) && SE_CONNECTER.test(B.texte(e)));
  const entete = () => q('[data-e2e="user-page"]') || document;
  const introuvable = () => /(impossible de trouver ce compte|couldn.t find this account|ce compte n.existe pas|this account doesn.t exist)/i.test(B.corps());
  const statut = await B.attendre(
    () => (B.captcha() && 'captcha') || (deconnecte() && 'deconnecte') || (B.trouver(DEBLOQUER, entete()) && 'deja') ||
      (q('[data-e2e="user-more"]') && 'a_bloquer') || (introuvable() && 'introuvable'),
    25000,
  );
  if (statut !== 'a_bloquer') return statut ?? 'erreur: page de profil non reconnue';
  await B.pause(1500);
  if (deconnecte()) return 'deconnecte';
  if (B.trouver(DEBLOQUER, entete())) return 'deja';
  if (!bloquer) return 'serait_bloque';
  const plus = q('[data-e2e="user-more"]');
  plus.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  plus.click();
  const menu = await B.attendre(() => B.qa('[data-e2e="user-report"], [role="dialog"]').find(B.visible), 8000);
  if (!menu) return 'erreur: le menu ⋯ ne s’ouvre pas';
  if (B.trouver(DEBLOQUER, menu)) return 'deja';
  const entree = await B.attendre(() => B.trouver(BLOQUER, menu), 5000);
  if (!entree) return 'erreur: entrée Bloquer absente du menu';
  entree.click();
  const confirmer = await B.attendre(() => {
    if (B.captcha()) return 'captcha';
    if (B.fenetres().some((d) => /connecte-toi|log in to tiktok/i.test(B.texte(d)))) return 'deconnecte';
    return B.boutons().find((b) => BLOQUER.test(B.texte(b)) && !menu.contains(b) && b !== entree);
  }, 10000);
  if (confirmer === 'captcha' || confirmer === 'deconnecte') return confirmer;
  if (!confirmer) return 'erreur: confirmation absente';
  confirmer.click();
  return (await B.attendre(() => B.trouver(DEBLOQUER, entete()), 6000)) ? 'bloque' : 'a_verifier';
}

// Lecture directe de ta liste de bloqués TikTok : même demande que la page des réglages de TikTok
// (/api/block/user_list/, 20 comptes à la fois). Exécutée dans la page elle-même, pour que TikTok y ajoute sa signature
// comme pour ses propres demandes. Fonction autonome : pas d'accès à BFX ici.
async function lireBloquesTikTokDirect() {
  await new Promise((r) => setTimeout(r, 1500));
  const vus = new Set();
  let offset = 0;
  try {
    for (let page = 0; page < 300; page++) {
      const q = new URLSearchParams({ aid: '1988', app_name: 'tiktok_web', device_platform: 'web_pc', offset: String(offset), count: '20' });
      const r = await fetch('/api/block/user_list/?' + q, { credentials: 'include' });
      const t = await r.text();
      if (!t) return { erreur: 'réponse vide de TikTok (HTTP ' + r.status + ')' };
      const d = JSON.parse(t);
      if (d.statusCode === 10234 || /not login/i.test(d.statusMsg || '')) return { erreur: 'pas connecté à TikTok' };
      if ((d.statusCode && d.statusCode !== 0) || !r.ok) return { erreur: 'TikTok a répondu ' + (d.statusCode ?? r.status) + (d.statusMsg ? ' (' + d.statusMsg + ')' : '') };
      const liste = d.userList || [];
      for (const u of liste) if (u.user?.uniqueId) vus.add(u.user.uniqueId.toLowerCase());
      if (!d.hasMore || !liste.length) break;
      offset = Number(d.offset) > offset ? Number(d.offset) : offset + liste.length;
      await new Promise((r) => setTimeout(r, 400));
    }
    return { handles: [...vus], methode: 'directe' };
  } catch (e) {
    return { erreur: e.message };
  }
}

// Secours : réglages > Confidentialité > Comptes bloqués, lus à l'écran.
async function lireBloquesTikTok() {
  const B = globalThis.BFX;
  await B.attendre(() => /comptes bloqués|blocked accounts/i.test(B.corps()), 20000);
  const cible = B.boutons().find((b) => /comptes bloqués|blocked accounts/i.test(B.texte(b)))
    || B.qa('div, li, a').filter(B.visible).find((e) => /^(comptes bloqués|blocked accounts)/i.test(B.texte(e)) && B.texte(e).length < 60);
  if (!cible) return { erreur: 'section « Comptes bloqués » introuvable dans les réglages' };
  (cible.closest('button, [role="button"], a') || cible).click();
  const gerer = await B.attendre(() => B.trouver(/^(gérer|modifier|manage|edit)$/i), 3000);
  if (gerer) gerer.click();
  await B.pause(3000);
  const vus = await B.recolter((vus) => {
    // Si une fenêtre est ouverte, seuls les liens qu'elle contient comptent (la liste des bloqués s'y affiche).
    const fenetres = B.fenetres();
    for (const a of B.qa('a[href*="/@"]')) {
      if (fenetres.length && !fenetres.some((d) => d.contains(a))) continue;
      const m = a.getAttribute('href').match(/\/@([\w.]+)/);
      if (m) vus.add(m[1].toLowerCase());
    }
  }, () => {
    for (const d of B.fenetres()) d.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20) e.scrollTop += 1200; });
  }, 1200);
  return vus.size ? { handles: [...vus] } : { erreur: 'aucun compte lu (liste vide ou page différente)' };
}

// ——— Instagram ———
async function agirInstagram(bloquer) {
  const B = globalThis.BFX, q = B.q;
  const BLOQUER = /^(bloquer|block)$/i, DEBLOQUER = /^(débloquer|unblock)$/i;
  const SE_CONNECTER = /^(se connecter|connexion|log in|inscrivez-vous|s.inscrire|sign up)$/i;
  const options = () => B.qa('header svg[aria-label], header [role="button"][aria-label]')
    .find((e) => /^(options|plus d.options|more options)$/i.test(e.getAttribute('aria-label')))?.closest('[role="button"], button');
  const statut = await B.attendre(
    () => (B.captcha() && 'captcha') || (location.pathname.startsWith('/accounts/login') && 'deconnecte') ||
      (location.pathname.startsWith('/challenge') && 'captcha') ||
      (/(cette page n.est pas disponible|sorry, this page isn.t available|page isn.t available)/i.test(B.corps()) && 'introuvable') ||
      (B.trouver(SE_CONNECTER) && !options() && 'deconnecte') ||
      (B.trouver(DEBLOQUER, q('header') || document) && 'deja') ||
      (options() && 'a_bloquer'),
    25000,
  );
  if (statut !== 'a_bloquer') return statut ?? 'erreur: page de profil non reconnue';
  if (!bloquer) return 'serait_bloque';
  options().click();
  const menu = await B.attendre(() => B.fenetres().find((d) => B.trouver(BLOQUER, d) || B.trouver(DEBLOQUER, d)), 8000);
  if (!menu) return 'erreur: menu Options sans « Bloquer »';
  if (B.trouver(DEBLOQUER, menu)) return 'deja';
  const entree = B.trouver(BLOQUER, menu);
  entree.click();
  // Confirmation : parfois un choix (« Bloquer ce compte » / « … et les autres comptes »), puis le bouton « Bloquer ».
  const confirmer = await B.attendre(() => B.boutons().filter((b) => BLOQUER.test(B.texte(b)) && b !== entree && !(menu.isConnected && menu.contains(b))).pop(), 10000);
  if (!confirmer) return 'erreur: confirmation absente';
  confirmer.click();
  const fermer = await B.attendre(() => B.trouver(/^(fermer|ignorer|close|dismiss|ok)$/i), 5000);
  if (fermer) fermer.click();
  return (await B.attendre(() => B.trouver(DEBLOQUER, q('header') || document), 6000)) ? 'bloque' : 'a_verifier';
}

// Expérimental : l'API de la page instagram.com/accounts/blocked_accounts/, sinon la page elle-même lue à l'écran.
async function lireBloquesInstagram() {
  const B = globalThis.BFX;
  if (location.pathname.startsWith('/accounts/login')) return { erreur: 'pas connecté' };
  try {
    const vus = new Set();
    let maxId = '';
    for (let page = 0; page < 100; page++) {
      const r = await fetch('/api/v1/users/blocked_list/' + (maxId ? `?max_id=${encodeURIComponent(maxId)}` : ''), {
        credentials: 'include', headers: { 'x-ig-app-id': '936619743392459', 'x-requested-with': 'XMLHttpRequest' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      for (const u of d.blocked_list || []) if (u.username) vus.add(u.username.toLowerCase());
      maxId = d.next_max_id || '';
      if (!maxId) break;
    }
    return { handles: [...vus], methode: 'directe' };
  } catch (e) { /* lecture de la page */ }
  await B.attendre(() => B.q('main'), 20000);
  await B.pause(3000);
  const vus = await B.recolter((vus) => {
    // Seulement les fiches qui ont un bouton « Débloquer » : ce sont les comptes bloqués.
    for (const b of B.boutons(B.q('main') || document).filter((b) => /^(débloquer|unblock)$/i.test(B.texte(b)))) {
      let el = b;
      for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
        const a = el.querySelector?.('a[href^="/"]');
        const m = a?.getAttribute('href').match(/^\/([\w.]{1,30})\/?$/);
        if (m && !['accounts', 'explore', 'direct', 'reels'].includes(m[1])) { vus.add(m[1].toLowerCase()); break; }
      }
    }
  }, () => {
    window.scrollBy(0, 1500);
    B.qa('main *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 200) e.scrollTop += 1500; });
  }, 1300);
  return vus.size ? { handles: [...vus] } : { erreur: 'aucun compte lu (liste vide ou page différente)' };
}

// ——— Facebook ———
async function agirFacebook(bloquer) {
  const B = globalThis.BFX;
  const BLOQUER = /^(bloquer|block)( la page| page| le profil| profile)?$/i;
  const OPTIONS = /^(voir les options|plus d.options|see options|more options|plus|more|options du profil|profile settings see more options|actions pour cette page|see more options)$/i;
  const principal = () => B.q('[role="main"]') || document;
  const options = () => B.boutons(principal()).find((b) => OPTIONS.test(B.etiquette(b)));
  const statut = await B.attendre(
    () => (B.captcha() && 'captcha') || ((B.q('form[action*="login"]') || location.pathname.startsWith('/login')) && 'deconnecte') ||
      (/(ce contenu n.est pas disponible|this content isn.t available|cette page n.est pas disponible)/i.test(B.corps()) && 'indisponible') ||
      (B.trouver(/^(débloquer|unblock)/i, principal()) && 'deja') ||
      (options() && 'a_bloquer'),
    25000,
  );
  if (statut !== 'a_bloquer') return statut ?? 'erreur: page non reconnue';
  if (!bloquer) return 'serait_bloque';
  options().click();
  const menu = await B.attendre(() => B.fenetres().find((d) => B.trouver(BLOQUER, d)), 8000);
  if (!menu) return 'erreur: menu sans « Bloquer »';
  const entree = B.trouver(BLOQUER, menu);
  entree.click();
  const confirmer = await B.attendre(() => B.fenetres().map((d) => B.trouver(/^(confirmer|confirm|bloquer|block)$/i, d)).find((b) => b && b !== entree), 10000);
  if (!confirmer) return 'erreur: confirmation absente';
  confirmer.click();
  await B.pause(2500);
  return 'bloque';
}

// ——— Débloquer (comptes retirés de l'annuaire) : ouvrir le profil, toucher « Débloquer », confirmer. ———
// Réponses : debloque, pas_bloque (déjà débloqué), introuvable, deconnecte, limite, captcha, ou « erreur: … ».
async function debloquerX() {
  const B = globalThis.BFX, q = B.q;
  if (!(await B.attendre(() => q('[data-testid="SideNav_AccountSwitcher_Button"]'), 15000))) {
    return q('[data-testid="loginButton"], a[href="/login"]') ? 'deconnecte' : 'limite';
  }
  const bouton = () => q('[data-testid$="-unblock"]');
  let statut = await B.attendre(() => (bouton() && 'bloque') || (q('[data-testid="userActions"]') && 'pas_bloque') || (q('[data-testid="emptyState"]') && 'introuvable'), 20000);
  if (statut === 'pas_bloque') { await B.pause(1500); if (bouton()) statut = 'bloque'; }
  if (statut !== 'bloque') return statut ?? 'erreur: page de profil non reconnue';
  bouton().scrollIntoView({ block: 'center' });
  await B.pause(500);
  bouton().click();
  const confirmer = await B.attendre(() => q('[data-testid="confirmationSheetConfirm"]'), 8000);
  if (confirmer) confirmer.click();
  return (await B.attendre(() => !bouton(), 8000)) ? 'debloque' : 'erreur: toujours bloqué';
}

async function debloquerTikTok() {
  const B = globalThis.BFX, q = B.q;
  const DEBLOQUER = /^(débloquer|unblock)$/i, SE_CONNECTER = /^(se connecter|connexion|log in|login|sign in)$/i;
  const entete = () => q('[data-e2e="user-page"]') || document;
  const bouton = () => B.trouver(DEBLOQUER, entete());
  let statut = await B.attendre(
    () => (B.captcha() && 'captcha') || ((q('[data-e2e="top-login-button"]') || B.trouver(SE_CONNECTER)) && 'deconnecte') || (bouton() && 'bloque') ||
      (q('[data-e2e="user-more"]') && 'pas_bloque') ||
      (/(impossible de trouver ce compte|couldn.t find this account|ce compte n.existe pas|this account doesn.t exist)/i.test(B.corps()) && 'introuvable'),
    25000,
  );
  if (statut === 'pas_bloque') { await B.pause(1500); if (bouton()) statut = 'bloque'; }
  if (statut !== 'bloque') return statut ?? 'erreur: page de profil non reconnue';
  // Correctif : la fenêtre de confirmation de TikTok n'a pas toujours role="dialog" ; on cherche, comme pour bloquer,
  // n'importe quel autre bouton « Débloquer » visible apparu après le clic.
  const entree = bouton();
  entree.scrollIntoView({ block: 'center' });
  await B.pause(400);
  entree.click();
  const confirmer = await B.attendre(() => B.boutons().filter((b) => DEBLOQUER.test(B.texte(b)) && b !== entree).pop(), 5000);
  if (confirmer) { confirmer.click(); await B.pause(1500); }
  return (await B.attendre(() => !B.boutons().some((b) => DEBLOQUER.test(B.texte(b))), 8000)) ? 'debloque' : 'erreur: toujours bloqué';
}

async function debloquerInstagram() {
  const B = globalThis.BFX, q = B.q;
  const DEBLOQUER = /^(débloquer|unblock)$/i;
  const bouton = () => B.trouver(DEBLOQUER, q('header') || document);
  const options = () => B.qa('header svg[aria-label]').find((e) => /^(options|plus d.options|more options)$/i.test(e.getAttribute('aria-label')));
  let statut = await B.attendre(
    () => (B.captcha() && 'captcha') || (location.pathname.startsWith('/accounts/login') && 'deconnecte') || (location.pathname.startsWith('/challenge') && 'captcha') ||
      (/(cette page n.est pas disponible|sorry, this page isn.t available|page isn.t available)/i.test(B.corps()) && 'introuvable') ||
      (bouton() && 'bloque') || (options() && 'pas_bloque'),
    25000,
  );
  if (statut === 'pas_bloque') { await B.pause(1500); if (bouton()) statut = 'bloque'; }
  if (statut !== 'bloque') return statut ?? 'erreur: page de profil non reconnue';
  const entree = bouton();
  entree.click();
  const confirmer = await B.attendre(() => B.fenetres().map((d) => B.trouver(DEBLOQUER, d)).find((b) => b && b !== entree), 8000);
  if (confirmer) confirmer.click();
  const fermer = await B.attendre(() => B.fenetres().map((d) => B.trouver(/^(fermer|ignorer|close|dismiss|ok)$/i, d)).find(Boolean), 4000);
  if (fermer) fermer.click();
  return (await B.attendre(() => !bouton(), 8000)) ? 'debloque' : 'erreur: toujours bloqué';
}

export const RESEAUX = {
  x: {
    nom: 'X', session: { url: 'https://x.com', noms: ['auth_token'] }, connexion: 'https://x.com/login',
    valide: (h) => /^\w{1,15}$/.test(h) && !PAGES_X.has(h.toLowerCase()),
    // Correctif : l'identifiant doit s'arrêter à « / ? # » ou à la fin ; avant, « x.com/un_nom_beaucoup_trop_long » était coupé à 15 lettres
    // (= un AUTRE compte) et « x.com/nom-truc » donnait « nom ».
    depuisUrl: (u) => u?.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})(?:[/?#]|$)/i)?.[1],
    url: (h) => `https://x.com/${encodeURIComponent(h)}`, lien: (h) => `https://x.com/${h}`,
    rythme: { min: 8, max: 20, par: 40 }, agir: agirX, debloquer: debloquerX,
    bloques: { url: 'https://x.com/settings/blocked/all', lire: lireBloquesX, fiable: true },
  },
  tiktok: {
    nom: 'TikTok', session: { url: 'https://www.tiktok.com', noms: ['sessionid', 'sessionid_ss'] }, connexion: 'https://www.tiktok.com/login',
    valide: (h) => /^[\w.]{2,24}$/.test(h),
    depuisUrl: (u) => u?.match(/tiktok\.com\/@([\w.]+)/i)?.[1],
    url: (h) => `https://www.tiktok.com/@${encodeURIComponent(h)}`, lien: (h) => `https://www.tiktok.com/@${h}`,
    rythme: { min: 15, max: 35, par: 25 }, agir: agirTikTok, debloquer: debloquerTikTok,
    bloques: { url: 'https://www.tiktok.com/setting', urlDirect: 'https://www.tiktok.com/explore', direct: lireBloquesTikTokDirect, lire: lireBloquesTikTok, fiable: true },
  },
  instagram: {
    nom: 'Instagram', session: { url: 'https://www.instagram.com', noms: ['sessionid'] }, connexion: 'https://www.instagram.com/accounts/login/',
    valide: (h) => /^[\w.]{1,30}$/.test(h) && !PAGES_IG.has(h.toLowerCase()),
    // Correctif : même chose pour Instagram (identifiant coupé à 30 caractères = autre compte).
    depuisUrl: (u) => u?.match(/instagram\.com\/([\w.]{1,30})(?:[/?#]|$)/i)?.[1],
    url: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`, lien: (h) => `https://www.instagram.com/${h}`,
    rythme: { min: 30, max: 60, par: 15 }, agir: agirInstagram, debloquer: debloquerInstagram,
    bloques: { url: 'https://www.instagram.com/accounts/blocked_accounts/', lire: lireBloquesInstagram, fiable: false },
  },
  facebook: {
    nom: 'Facebook', session: { url: 'https://www.facebook.com', noms: ['c_user'] }, connexion: 'https://www.facebook.com/login',
    // Correctif : « = » et « & » refusés hors profile.php?id= (un lien « id=1000… » ouvrait une page inexistante).
    valide: (h) => /^(profile\.php\?id=\d+|(p\/|share\/)?[^/?#\s=&]{2,80})$/.test(h) && !PAGES_FB.has(h.toLowerCase()),
    // Correctif : facebook.com/people/Nom/1234… donnait « people » (2 comptes de la liste ouvraient facebook.com/people) ;
    // on en tire le vrai profil, profile.php?id=1234….
    depuisUrl: (u) => {
      const id = u?.match(/facebook\.com\/people\/[^/?#\s]+\/(\d+)/i)?.[1];
      if (id) return `profile.php?id=${id}`;
      return u?.match(/facebook\.com\/((?:profile\.php\?id=\d+)|(?:(?:p|share)\/)?[^/?#\s]+)/i)?.[1];
    },
    url: (h) => `https://www.facebook.com/${h}`, lien: (h) => `https://www.facebook.com/${h}`,
    // Facebook n'affiche plus le profil d'un compte bloqué : pas de déblocage automatique (lien vers ses réglages à la place).
    rythme: { min: 30, max: 60, par: 15 }, agir: agirFacebook, bloques: null, debloquer: null,
  },
};
export const ORDRE = ['x', 'tiktok', 'instagram', 'facebook'];
