// Liste des comptes : toujours relue en direct sur l'annuaire onbloquelextremedroite.fun (base + ajouts validés + liens des réseaux),
// puis complétée par complements.json (liens TikTok / Instagram / Facebook que nous avons trouvés et vérifiés).
import { RESEAUX } from './reseaux.js';
import { pause, chargerOnglet } from './onglets.js';

const ANNUAIRE = 'https://onbloquelextremedroite.fun';
// Catégories de l'annuaire reprises telles quelles ; les autres comptes passent par notre classement (complements.categories).
const CAT_ANNUAIRE = { RN: 'Rassemblement national', 'Reconquête': 'Reconquête' };
// Notre classement à jour : les nouveaux comptes de l'annuaire y sont classés automatiquement (toutes les 10 minutes).
// Fichier public du dépôt ; s'il est injoignable, on garde le classement livré avec l'extension (complements.json).
const CATEGORIES_EN_LIGNE = 'https://raw.githubusercontent.com/bender-md/bloquer-extreme-droite/main/donnees/categories.json';

async function recuperer(chemin) {
  const r = await fetch(ANNUAIRE + chemin, { cache: 'no-store', credentials: 'include' });
  if (!r.ok) throw new Error(`${chemin} : HTTP ${r.status}`);
  return r;
}

// Lecture directe ; si la protection anti-robot du site la refuse, on ouvre le site dans un onglet caché
// et on lit les mêmes fichiers depuis la page (comme le ferait le site lui-même).
async function lireAnnuaire() {
  try {
    return {
      accounts: await (await recuperer('/accounts.js')).text(),
      socials: await (await recuperer('/socials.js')).text(),
      api: await (await recuperer('/api/accounts')).json(),
      // Abonnés : facultatif (sert seulement à bloquer les plus gros comptes d'abord).
      followers: await recuperer('/followers.js').then((r) => r.text()).catch(() => ''),
    };
  } catch (e) {
    const onglet = await chrome.tabs.create({ url: 'about:blank', active: false });
    try {
      // L'écoute commence avant d'ouvrir la page (chargerOnglet) : pas d'attente de 30 s si elle charge très vite.
      await chargerOnglet(onglet.id, ANNUAIRE + '/site');
      for (let essai = 0; essai < 5; essai++) {
        // Correctif : la protection anti-robot recharge la page pendant la vérification ; l'injection échouait alors
        // (« Frame was removed ») et on abandonnait au lieu de réessayer.
        const [{ result } = {}] = await chrome.scripting.executeScript({
          target: { tabId: onglet.id },
          func: async () => {
            try {
              const t = async (c) => { const r = await fetch(c, { cache: 'no-store' }); if (!r.ok) throw new Error(c + ' : HTTP ' + r.status); return r.text(); };
              return { accounts: await t('/accounts.js'), socials: await t('/socials.js'), api: JSON.parse(await t('/api/accounts')), followers: await t('/followers.js').catch(() => '') };
            } catch (e) { return { erreur: e.message }; }
          },
        }).catch((err) => [{ result: { erreur: err.message } }]);
        if (result && !result.erreur) return result;
        await pause(3000);
      }
      throw new Error(e.message + ' (même depuis la page du site)');
    } finally {
      chrome.tabs.remove(onglet.id).catch(() => {});
    }
  }
}

// accounts.js et socials.js sont du JS : on n'exécute jamais leur code, on en extrait les données en JSON.
const extraire = (js, ouvre, ferme) => JSON.parse(js.slice(js.indexOf(ouvre), js.lastIndexOf(ferme) + 1));

// Clés de regroupement et de classement : compte X, nom simplifié, compte TikTok.
const cleX = (h) => h && 'x:' + h.toLowerCase();
const cleTikTok = (h) => h && 'tt:' + h.toLowerCase();
// « Florian Philippot », « @FlorianPhilippot » ou un lien de profil donnent la même clé.
const nomCle = (n) => String(n || '').replace(/^https?:\/\/\S+\/@?/, '').replace(/^@/, '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cleNom = (n) => nomCle(n) && 'n:' + nomCle(n);

// Renvoie { personnes, entreesAnnuaire } ; entreesAnnuaire (nombre d'ajouts de l'annuaire) sert au badge « +N » de l'icône.
export async function chargerListe() {
  // Nos liens vérifiés, livrés avec l'extension.
  const complements = await (await fetch(chrome.runtime.getURL('complements.json'))).json();
  const enLigne = await fetch(CATEGORIES_EN_LIGNE, { cache: 'no-store', credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const categories = { ...complements.categories, ...enLigne };
  // Sans l'API on s'arrête, comme le site : les retraits y sont, la liste de base seule pourrait bloquer un compte retiré.
  const brut = await lireAnnuaire();
  const base = extraire(brut.accounts, '[', ']');
  const socials = extraire(brut.socials, '{', '}');
  const { entries } = brut.api;
  let abonnes = {};
  try { abonnes = extraire(brut.followers, '{', '}'); } catch (e) { /* pas de relevé : on gardera seulement « France d'abord » */ }

  const parId = new Map();
  for (const c of base) parId.set(String(c.id ?? c.handle).toLowerCase(), { id: c.id, nom: c.name, categorie: c.category, raison: c.reason, comptes: { x: c.handle } });
  for (const e of entries) {
    if (e.type === 'removal') continue;
    const cle = String(e.type === 'new' ? e.id : e.target_id).toLowerCase();
    if (e.type === 'new' && !parId.has(cle)) {
      parId.set(cle, { id: e.id, nom: e.name, categorie: e.category, raison: e.reason, comptes: {} });
    }
    const p = parId.get(cle);
    if (p && !p.raison && e.reason) p.raison = e.reason;
    const h = RESEAUX[e.platform]?.depuisUrl(e.profile_url);
    if (p && h) p.comptes[e.platform] = h;
  }
  for (const e of entries) if (e.type === 'removal') parId.delete(String(e.target_id ?? '').toLowerCase());

  // Une même personne est souvent proposée une fois par réseau (« Florian Philippot » sur X, puis sur TikTok…) :
  // on regroupe les entrées par compte X (prioritaire) puis par nom, en gardant tous leurs comptes.
  const groupes = new Map();
  const tous = [];
  for (const p of parId.values()) {
    const cles = [cleX(p.comptes.x), cleNom(p.nom)].filter(Boolean);
    const g = cles.map((k) => groupes.get(k)).find(Boolean);
    if (!g) {
      tous.push(p);
      for (const k of cles) groupes.set(k, p);
      continue;
    }
    for (const [res, h] of Object.entries(p.comptes)) if (!g.comptes[res]) g.comptes[res] = h;
    if (!g.raison && p.raison) g.raison = p.raison;
    for (const k of [...cles, cleX(g.comptes.x)].filter(Boolean)) if (!groupes.has(k)) groupes.set(k, g);
  }

  const personnes = [];
  const vusX = new Set();
  for (const p of tous) {
    const x = p.comptes.x;
    if (x) {
      if (!RESEAUX.x.valide(x) || vusX.has(x.toLowerCase())) { delete p.comptes.x; }
      else vusX.add(x.toLowerCase());
    }
    p.cle = (p.comptes.x || p.id || p.nom).toString().toLowerCase();
    // Liens des autres réseaux publiés par l'annuaire…
    const s = x ? socials[x] || socials[x.toLowerCase()] || Object.entries(socials).find(([k]) => k.toLowerCase() === x.toLowerCase())?.[1] : null;
    for (const res of ['tiktok', 'instagram', 'facebook']) {
      if (!p.comptes[res] && s?.[res]) {
        const h = RESEAUX[res].depuisUrl(s[res]);
        if (h) p.comptes[res] = h;
      }
    }
    // … puis les nôtres (vérifiés un par un ; ils corrigent aussi les liens faux de l'annuaire).
    for (const [res, h] of Object.entries(complements.liens[p.cle] || {})) if (RESEAUX[res]) p.comptes[res] = h;
    for (const res of Object.keys(p.comptes)) if (!RESEAUX[res]?.valide(p.comptes[res])) delete p.comptes[res];
    if (Object.keys(p.comptes).length) personnes.push(p);
  }

  // Catégories : classement fait par nous (en ligne, sinon complements.categories), à partir du compte X, du nom, du TikTok, de l'Instagram ou du Facebook.
  // Les comptes ajoutés à l'annuaire depuis ce classement gardent RN / Reconquête, sinon « Nouveaux ajouts (à classer) ».
  for (const p of personnes) {
    const cles = [cleX(p.comptes.x), nomCle(p.nom) && 'n:' + nomCle(p.nom), cleTikTok(p.comptes.tiktok),
      p.comptes.instagram && 'ig:' + p.comptes.instagram.toLowerCase(), p.comptes.facebook && 'fb:' + p.comptes.facebook.toLowerCase()];
    const c = cles.map((k) => k && categories[k]).find(Boolean);
    p.categorie = c || CAT_ANNUAIRE[p.categorie] || 'Nouveaux ajouts (à classer)';
  }

  // Abonnés par réseau (relevés de l'annuaire, clés « x:/handle », « tiktok:/@handle »…) et audience = le plus grand des réseaux.
  for (const p of personnes) {
    p.abonnes = {};
    for (const [res, h] of Object.entries(p.comptes)) {
      const n = abonnes[`${res}:/${res === 'tiktok' ? '@' : ''}${h.toLowerCase()}`]?.count;
      if (n > 0) p.abonnes[res] = n;
    }
    p.audience = Math.max(0, ...Object.values(p.abonnes));
  }

  return { personnes, entreesAnnuaire: entries.filter((e) => e.type === 'new').length };
}
