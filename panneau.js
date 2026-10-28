// Panneau de l'extension : X, TikTok, Instagram et Facebook dans une seule extension.
import { RESEAUX, ORDRE } from './reseaux.js';
import { chargerListe } from './annuaire.js';
import { pause, chargerOnglet } from './onglets.js';

// États retenus pour un compte : il ne sera plus rouvert.
const TERMINES = ['bloque', 'deja', 'introuvable', 'indisponible'];
// Réponses d'un adaptateur qui arrêtent le réseau concerné (le message dit quoi faire et commence par le nom du réseau).
const ARRETS = {
  deconnecte: (n) => `${n} : tu n'es pas connecté dans ce navigateur. Clique sur « Se connecter » sous ${n}, connecte-toi, reviens ici puis relance.`,
  limite: (n) => `${n} limite les visites pour le moment (rien de grave). Attends au moins 30 minutes avant de relancer.`,
  captcha: (n) => `${n} demande de prouver que tu n'es pas un robot. Fais-le dans la fenêtre qui vient de passer devant, attends quelques minutes, puis relance.`,
};

const $ = (id) => document.getElementById(id);
let liste = { personnes: [] };
let etat = {};        // etat[reseau][compte] = bloque | deja | introuvable | indisponible
let lus = {};         // lus[reseau] = { date, comptes: [...] } : ta liste de comptes bloqués, lue sur le réseau
let sessions = {};
let arret = false;
let filesEnCours = null; // pendant un lancement : files d'attente par réseau (pour y ajouter les nouveaux comptes)
let derniereLecture = 0;
let occupe = false;      // vrai pendant un lancement (préparation comprise) ou « Lire mes bloqués » : voir occuper()
let essaiFait = false;   // l'essai à blanc (étape 2 du guide) a déjà été mené au bout une fois
let guideMasque = false;
let totalBloques = 0;
let connus = {};         // connus['x:handle'] = nom : pour nommer un compte retiré de l'annuaire
let gardes = [];         // comptes retirés de l'annuaire que tu as choisi de garder bloqués ('x:handle')
const vuConnecte = {};   // pour cocher tout seul un réseau auquel on vient de se connecter

// Correctif : on effaçait le « +N » mais pas l'info-bulle « N nouveaux comptes… », qui restait affichée pour toujours.
function effacerBadge() {
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: chrome.runtime.getManifest().action.default_title });
}

// Nouvelle liste lue : on la garde et on note le nombre d'ajouts de l'annuaire vus, ce qui efface le badge « +N ».
async function retenirListe(nouvelle) {
  liste = nouvelle;
  derniereLecture = Date.now();
  // Nom de chaque compte vu une fois dans la liste : l'annuaire efface tout d'un compte retiré, même son nom.
  for (const p of liste.personnes) for (const [res, h] of Object.entries(p.comptes)) connus[`${res}:${h.toLowerCase()}`] = p.nom;
  await chrome.storage.local.set({ vuAnnuaire: liste.entreesAnnuaire, connus });
  effacerBadge();
}

// Relit l'annuaire (et nos liens) ; les comptes apparus depuis la dernière lecture sont signalés et, si un blocage tourne,
// ajoutés tout de suite à sa file d'attente.
async function recharger(raison) {
  try {
    const avant = new Set(liste.personnes.map((p) => p.cle));
    await retenirListe(await chargerListe());
    const nouveaux = liste.personnes.filter((p) => !avant.has(p.cle));
    // Correctif : un compte retiré de l'annuaire pendant un lancement restait dans la file et pouvait être bloqué quand même.
    if (filesEnCours) {
      const encore = new Set(liste.personnes.map((p) => p.cle));
      for (const id of Object.keys(filesEnCours)) filesEnCours[id] = filesEnCours[id].filter((p) => encore.has(p.cle));
    }
    if (avant.size && nouveaux.length) {
      const n = nouveaux.length, pl = n > 1;
      log(`Annuaire relu (${raison}) : ${n} nouveau${pl ? 'x' : ''} compte${pl ? 's' : ''} ajouté${pl ? 's' : ''} (${nouveaux.slice(0, 4).map((p) => p.nom).join(', ')}${n > 4 ? '…' : ''}).`, 'ok');
      if (filesEnCours) {
        const cats = categoriesCochees();
        for (const [id, file] of Object.entries(filesEnCours)) {
          file.push(...aTraiter(nouveaux, id, cats));
          file.sort(ordreBlocage(id));
        }
      }
    }
    afficher();
    // Correctif : si l'annuaire était injoignable à l'ouverture, les boutons restaient grisés pour toujours.
    if (!occupe) occuper(false);
  } catch (e) {
    log(`Annuaire non relu (${e.message}) : on garde la liste actuelle.`, 'gris');
  }
}
setInterval(() => recharger('toutes les 10 min'), 10 * 60 * 1000);

// « 1,2 M abonnés sur TikTok · Eurodéputé, porte-parole du RN » (abonnés : relevés de l'annuaire ; raison : celle de l'annuaire).
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
function detailCompte(p, id) {
  // Sans relevé sur ce réseau : on donne celui de son plus gros réseau, en le nommant.
  const ou = id && p.abonnes?.[id] ? id : Object.keys(p.abonnes || {}).sort((a, b) => p.abonnes[b] - p.abonnes[a])[0];
  const ab = ou ? `${compact.format(p.abonnes[ou])} abonnés sur ${RESEAUX[ou].nom}` : '';
  // Origine : « France · Médias », ou le pays pour l'international (« Allemagne »).
  const lieu = !p.categorie ? '' : estInter(p.categorie) ? (pays(p.categorie) === 'Autres pays' ? 'Étranger' : pays(p.categorie)) : `France · ${p.categorie}`;
  // Raison identique à la catégorie (« Rassemblement National ») : on ne la répète pas.
  const raison = p.raison && p.raison.toLowerCase() !== String(p.categorie).toLowerCase() ? p.raison : '';
  return [lieu, ab, raison].filter(Boolean).join(' · ');
}
const heure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function ajouter(el) {
  $('vide')?.remove();
  const j = $('journal');
  j.prepend(el);
  while (j.children.length > 400) j.lastChild.remove();
}
// Message général (début, fin, réseau arrêté…)
function log(texte, classe = '') {
  const l = document.createElement('div');
  l.className = 'ligne-info ' + classe;
  l.innerHTML = '<time></time><span></span>';
  l.firstChild.textContent = heure();
  l.lastChild.textContent = texte;
  ajouter(l);
}
// Résultat pour un compte : réseau, nom, lien, état
const ETATS = { bloque: ['bloque', 'Bloqué'], deja: ['deja', 'Déjà bloqué'], introuvable: ['deja', 'Introuvable'], indisponible: ['deja', 'Indisponible'], serait_bloque: ['blanc', 'Serait bloqué'] };
let stats = null;
function ligneCompte(id, p, h, res, details) {
  const [cls, libelle] = res.startsWith('erreur') ? ['erreur', 'Erreur'] : ETATS[res] || ['deja', res];
  const l = document.createElement('div');
  l.className = 'ligne-compte ' + cls;
  l.innerHTML = '<time></time><span class="res"></span><span class="nom"></span><span class="lien"></span><span class="etat"></span><small class="pourquoi-compte"></small>';
  l.querySelector('.pourquoi-compte').textContent = detailCompte(p, id);
  l.querySelector('time').textContent = heure();
  l.querySelector('.res').textContent = RESEAUX[id].nom;
  l.querySelector('.nom').textContent = p.nom;
  l.querySelector('.lien').textContent = RESEAUX[id].lien(h).replace(/^https:\/\/(www\.)?/, '');
  const e = l.querySelector('.etat');
  e.className = 'etat ' + cls;
  e.textContent = libelle;
  if (details) {
    const d = document.createElement('details');
    d.className = 'reperes';
    d.innerHTML = '<summary></summary><pre></pre>';
    d.firstChild.textContent = 'Détails de l’erreur : ' + res.replace(/^erreur: /, '');
    d.lastChild.textContent = details;
    ajouter(d);
  }
  ajouter(l);
  if (stats) { stats[cls] = (stats[cls] || 0) + 1; montrerStats(); }
}
function montrerStats() {
  const s = stats || {};
  $('compteurs').innerHTML = stats
    ? `<span>Ce lancement : <b>${s.bloque || 0}</b> bloqués</span><span><b>${s.deja || 0}</b> déjà bloqués ou introuvables</span>${s.blanc ? `<span><b>${s.blanc}</b> seraient bloqués (essai)</span>` : ''}${s.erreur ? `<span><b>${s.erreur}</b> erreur${s.erreur > 1 ? 's' : ''} (réessayé${s.erreur > 1 ? 's' : ''} au prochain lancement)</span>` : ''}`
    : '';
}

// État en direct dans la barre du bas
// (la classe « encours » de la barre est posée par occuper(), préparation comprise)
let enCours = null; // { actifs, actions, max, prochain, courant, aBlanc }
function majStatut() {
  if (!enCours) return;
  const { actifs, actions, max, prochain, courant, aBlanc } = enCours;
  const parts = actifs.map((id) => `${RESEAUX[id].nom} ${actions[id]}/${max(id)}`).join(' · ');
  const suivant = actifs.filter((id) => prochain[id] > Date.now()).sort((a, b) => prochain[a] - prochain[b])[0];
  const att = suivant ? Math.ceil((prochain[suivant] - Date.now()) / 1000) : 0;
  const mode = aBlanc ? 'Essai (personne n’est bloqué) — ' : '';
  $('statut').textContent = courant ? `${mode}En cours : ${courant} · ${parts}` : `${mode}Petite pause, prochain compte dans ${att} s · ${parts} · laisse cet onglet ouvert`;
}
setInterval(() => { majStatut(); if (enCours) { try { majSuivi(); } catch (e) { console.warn('affichage du suivi', e); } } }, 1000);

// ——— Carte « Blocage en cours » : avancement du lancement, réseau par réseau ———
// suivi = { aBlanc, debut, etape, fin, reseaux: { id: { prevus, faits, vus, erreurs, arret } } } ; reste affiché après la fin.
let suivi = null;
const TITRE_PAGE = document.title;
const RAISONS = { deconnecte: 'pas connecté', limite: 'limite du réseau, attends 30 min', captcha: 'vérification « robot » demandée', erreurs: '3 erreurs de suite' };
const duree = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'moins d’une minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
// Compte à rebours en anneau : le cercle se vide pendant la pause, les secondes restantes au centre.
// L'animation CSS repart du bon endroit à chaque rafraîchissement (délai négatif = temps déjà écoulé) : le cercle tourne sans à-coups.
function anneau(restantMs, totalMs, classe = '') {
  const total = Math.max(totalMs, restantMs, 1000) / 1000, ecoule = total - restantMs / 1000;
  return `<span class="anneau ${classe}" style="--t:${total.toFixed(2)}s;--d:-${ecoule.toFixed(2)}s" role="img" aria-label="${Math.ceil(restantMs / 1000)} secondes">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="fond" cx="18" cy="18" r="15.9"/><circle class="reste" cx="18" cy="18" r="15.9" pathLength="100"/></svg>
    <b>${Math.ceil(restantMs / 1000)}</b></span>`;
}
function majSuivi() {
  const carte = $('suivi');
  carte.hidden = !suivi;
  if (!suivi) { document.title = TITRE_PAGE; return; }
  const ids = Object.keys(suivi.reseaux);
  const somme = (k) => ids.reduce((n, id) => n + suivi.reseaux[id][k], 0);
  // Un réseau arrêté (déconnecté, captcha…) ne compte plus que ce qu'il a fait.
  const faits = somme('faits'), vus = somme('vus');
  const prevus = Math.max(ids.reduce((n, id) => n + (suivi.reseaux[id].arret ? suivi.reseaux[id].faits : suivi.reseaux[id].prevus), 0), faits);
  const verbe = suivi.aBlanc ? 'vérifiés' : 'bloqués';
  // Temps restant, à la louche : les réseaux avancent en même temps, chacun à son rythme (pause + ~6 s pour ouvrir le profil).
  const restes = ids.filter((id) => !suivi.reseaux[id].arret).map((id) => {
    const s = suivi.reseaux[id], { min, max } = RESEAUX[id].rythme;
    return { reste: Math.max(0, s.prevus - s.faits), pas: (min + max) / 2 + 6 };
  });
  const estime = Math.max(...restes.map((r) => r.reste * r.pas), restes.reduce((t, r) => t + r.reste * 6, 0), 0) * 1000;
  let phrase, rebours = '';
  if (suivi.fin) phrase = suivi.fin;
  else if (enCours?.courant) phrase = `Ouverture du profil : ${enCours.courant}`;
  else if (enCours) {
    // Correctif : un réseau sans aucun compte à faire n'a pas de ligne dans le suivi (suivi.reseaux[id] absent) ;
    // lire son « arret » plantait et arrêtait tout le lancement.
    const enPause = enCours.actifs.filter((id) => suivi.reseaux[id] && !suivi.reseaux[id].arret && enCours.prochain[id] > Date.now());
    const id = enPause.sort((a, b) => enCours.prochain[a] - enCours.prochain[b])[0];
    phrase = id ? 'Petite pause pour protéger ton compte, puis profil suivant' : 'On passe au profil suivant…';
    if (id) rebours = anneau(enCours.prochain[id] - Date.now(), enCours.duree[id] || 0, 'grand');
  } else phrase = suivi.etape;
  const temps = suivi.fin ? `Durée : ${duree(Date.now() - suivi.debut)}`
    : `Commencé il y a ${duree(Date.now() - suivi.debut)}${enCours && estime ? ` · fini dans environ ${duree(estime)}` : ''}`;
  carte.classList.toggle('fini', !!suivi.fin);
  carte.innerHTML = `<h2><span id="titreSuivi">${suivi.fin ? (suivi.aBlanc ? 'Essai terminé' : 'Phase terminée') : (suivi.aBlanc ? 'Essai à blanc en cours' : 'Phase de blocage en cours')}</span>
      <small>${temps}</small></h2>
    <div class="chiffre">${faits}<small>${verbe} sur ${prevus} prévus dans cette phase${suivi.aBlanc ? ' (personne n’est bloqué)' : ''}</small></div>
    <div class="barre"><i class="bloques" style="width:${pct(faits, prevus)}"></i></div>
    <div class="phrase-ligne${rebours ? ' en-pause' : ''}">${rebours}<p class="phrase"></p></div><p class="detail-compte"></p>
    <div class="lignes">${ids.map((id) => {
      const s = suivi.reseaux[id];
      const etat = s.arret ? `Arrêté : ${RAISONS[s.arret] || s.arret}` : s.fini ? 'Phase finie' : suivi.fin ? 'Arrêté'
        : enCours?.courant.startsWith(RESEAUX[id].nom + ' :') ? 'En cours'
        : enCours?.prochain[id] > Date.now() ? `${anneau(enCours.prochain[id] - Date.now(), enCours.duree[id] || 0, 'petit')} En pause` : 'En attente de son tour';
      return `<div class="ligne-suivi${s.arret ? ' arrete' : ''}"><b>${RESEAUX[id].nom}</b>
        <div class="barre"><i class="bloques" style="width:${pct(s.faits, Math.max(s.prevus, s.faits))}"></i></div>
        <span class="nb">${s.faits} / ${Math.max(s.prevus, s.faits)}</span>
        <small>${etat}${s.vus ? ` · ${s.vus} déjà bloqué${s.vus > 1 ? 's' : ''} ou introuvable${s.vus > 1 ? 's' : ''}, passé${s.vus > 1 ? 's' : ''}` : ''}${s.erreurs ? ` · ${s.erreurs} erreur${s.erreurs > 1 ? 's' : ''}` : ''}</small></div>`;
    }).join('')}</div>
    <div class="derniers"></div>
    <p class="ordre">Ordre : les comptes français d’abord, puis l’étranger, à chaque fois des plus suivis aux moins suivis.</p>`;
  carte.querySelector('.phrase').textContent = phrase; // contient des noms venus de l'annuaire : jamais en HTML
  carte.querySelector('.detail-compte').textContent = !suivi.fin && enCours?.courant ? enCours.detail : '';
  // Copie des 5 derniers comptes du journal « Ce qui se passe », pour voir que ça avance sans descendre dans la page.
  const lignes = [...$('journal').querySelectorAll('.ligne-compte')].filter((l) => !$('journal').classList.contains('masquer-deja') || !l.classList.contains('deja')).slice(0, 5);
  if (lignes.length) {
    const zone = carte.querySelector('.derniers');
    const tete = document.createElement('div');
    tete.className = 'tete-derniers';
    tete.innerHTML = '<b>Derniers comptes</b> <a href="#titreActivite">Tout voir ↓</a>';
    zone.append(tete, ...lignes.map((l) => l.cloneNode(true)));
  }
  if (suivi.fin && !suivi.aBlanc && faits) {
    const t = Object.assign(document.createElement('p'), { className: 'invite', textContent: 'Fais passer le mot :' });
    carte.append(t, boutonsPartage());
  }
  document.title = suivi.fin ? TITRE_PAGE : `${faits}/${prevus} ${verbe} · ${TITRE_PAGE}`;
}

async function sauver() { await chrome.storage.local.set({ etat, lus }); }
const dansLus = (res, h) => (lus[res]?.comptes || []).includes(h.toLowerCase());
// deja : compte à ne plus rouvrir (bloqué, introuvable…) ; estBloque : réellement bloqué.
const deja = (res, h) => TERMINES.includes(etat[res]?.[h.toLowerCase()]) || dansLus(res, h);
const estBloque = (res, h) => ['bloque', 'deja'].includes(etat[res]?.[h.toLowerCase()]) || dansLus(res, h);
// Comptes de ps à traiter sur le réseau id : dans les catégories cochées et pas encore faits.
// Ordre : France d'abord, puis l'étranger ; dans chaque groupe, du plus suivi au moins suivi
// (abonnés sur ce réseau, sinon sur son plus gros réseau ; sans relevé : à la fin).
const aTraiter = (ps, id, cats) => ps.filter((p) => p.comptes[id] && cats.has(p.categorie) && !deja(id, p.comptes[id])).sort(ordreBlocage(id));
const ordreBlocage = (id) => (a, b) => estInter(a.categorie) - estInter(b.categorie)
  || (b.abonnes?.[id] || b.audience || 0) - (a.abonnes?.[id] || a.audience || 0);

// Compteurs d'un réseau : bloqués, vérifiés sans pouvoir bloquer (introuvables / supprimés), restants.
function compter(id) {
  const avec = liste.personnes.filter((p) => p.comptes[id]);
  const bloques = avec.filter((p) => estBloque(id, p.comptes[id])).length;
  const verifies = avec.filter((p) => deja(id, p.comptes[id])).length - bloques;
  return { total: avec.length, bloques, verifies, restants: avec.length - bloques - verifies };
}
const pct = (n, t) => (t ? (100 * n) / t : 0).toFixed(2) + '%';
function barre(c) {
  return `<div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.bloques + c.verifies}">
    <i class="bloques" style="width:${pct(c.bloques, c.total)}"></i><i class="verifies" style="width:${pct(c.verifies, c.total)}"></i></div>`;
}

// Session = présence du cookie de connexion du réseau. La valeur n'est jamais lue ni envoyée nulle part.
async function verifierSessions() {
  for (const id of ORDRE) {
    const s = RESEAUX[id].session;
    let ok = false;
    for (const name of s.noms) if (await chrome.cookies.get({ url: s.url, name }).catch(() => null)) ok = true;
    sessions[id] = ok;
  }
}

function afficher() {
  $('resume').textContent = ''; // le texte ne sert qu'au chargement et aux erreurs

  const t = ORDRE.map(compter).reduce((a, c) => ({ total: a.total + c.total, bloques: a.bloques + c.bloques, verifies: a.verifies + c.verifies, restants: a.restants + c.restants }), { total: 0, bloques: 0, verifies: 0, restants: 0 });
  const pv = Math.round((100 * (t.bloques + t.verifies)) / (t.total || 1));
  totalBloques = t.bloques;
  $('total').innerHTML = `<h2>Ta progression <small>tous réseaux réunis</small></h2>
    <div class="chiffre">${t.bloques.toLocaleString('fr-FR')}<small>comptes bloqués sur ${t.total.toLocaleString('fr-FR')}</small></div>
    <p class="detail"><b>${pv} %</b> déjà traités · <b>${t.restants.toLocaleString('fr-FR')}</b> encore à faire · ${t.verifies} introuvables</p>
    ${barre(t)}
    <div class="cles"><span class="k1">Bloqués</span><span class="k2">Introuvables (compte supprimé ou renommé)</span><span class="k3">Encore à faire</span></div>
    <p class="total-aide">Ça se fait par phases : chaque phase bloque au plus quelques dizaines de comptes par réseau, pour protéger ton compte. Relance une nouvelle phase autant de fois que tu veux, l'extension reprend là où elle s'était arrêtée.</p>`;

  const coches = new Set(reseauxCoches());
  const premier = !document.querySelector('#reseaux input');
  $('reseaux').replaceChildren(...ORDRE.map((id) => {
    const r = RESEAUX[id];
    const c = compter(id);
    const carte = document.createElement('div');
    carte.className = 'reseau' + (sessions[id] ? '' : ' inactif');
    const lu = lus[id]?.date ? `Tes bloqués lus le ${new Date(lus[id].date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} (${lus[id].comptes.length})` : (r.bloques ? 'Tes bloqués pas encore lus' : 'Chaque profil est vérifié une seule fois');
    carte.innerHTML = `<label class="titre"><input type="checkbox" value="${id}" aria-label="Bloquer sur ${r.nom}"> ${r.nom}</label>
      <span class="session ${sessions[id] ? 'oui' : 'non'}">${sessions[id] ? 'Connecté' : 'Pas connecté'}</span>
      ${barre(c)}
      <span class="legende"><span><b>${c.bloques}</b> bloqués</span><span><b>${c.restants}</b> à faire</span><span>sur ${c.total}</span>${c.verifies ? `<span>${c.verifies} introuvables</span>` : ''}</span>
      <span class="chiffres">${lu}</span>`;
    const coche = carte.querySelector('input');
    // Un réseau auquel on vient de se connecter (dans un autre onglet) se coche tout seul.
    coche.checked = premier ? sessions[id] : coches.has(id) || (sessions[id] && !vuConnecte[id]);
    vuConnecte[id] = sessions[id];
    if (!sessions[id]) {
      const a = Object.assign(document.createElement('a'), { className: 'connexion', href: r.connexion, target: '_blank', rel: 'noopener', textContent: 'Se connecter ↗', title: `Ouvre la page de connexion de ${r.nom} dans un nouvel onglet` });
      a.setAttribute('aria-label', `Se connecter à ${r.nom} (nouvel onglet)`);
      carte.append(a);
    }
    return carte;
  }));

  afficherCategories();
  afficherRetires();
  majGuide();
  majPret();
}

// ——— Guide « Pour commencer » et état « prêt » de la barre du bas ———
const reseauxCoches = () => [...document.querySelectorAll('#reseaux input:checked')].map((i) => i.value);
// Peut-on lancer ? Sinon : le message à montrer et la carte où agir.
function pret() {
  const choisis = reseauxCoches();
  if (!liste.personnes.length) return { ok: false, message: 'La liste des comptes n’est pas encore chargée.' };
  if (!ORDRE.some((id) => sessions[id])) return { ok: false, message: 'Étape 1 : connecte-toi d’abord à au moins un réseau (boutons violets « Se connecter »).', cible: 'carteReseaux' };
  if (!choisis.length) return { ok: false, message: 'Coche au moins un réseau dans « Tes réseaux ».', cible: 'carteReseaux' };
  const actifs = choisis.filter((id) => sessions[id]);
  if (!actifs.length) return { ok: false, message: 'Tu n’es connecté à aucun des réseaux cochés : coche un réseau marqué « Connecté ».', cible: 'carteReseaux' };
  if (!categoriesCochees().size) return { ok: false, message: 'Choisis au moins une catégorie de comptes à bloquer.', cible: 'carteCats' };
  return { ok: true, actifs };
}
// Texte du bouton « Lancer » et de la barre du bas : prêt, ou ce qu'il manque.
function majPret() {
  const aBlanc = $('aBlanc').checked;
  $('lancer').textContent = occupe ? 'En cours…' : aBlanc ? 'Lancer l’essai à blanc' : 'Lancer le blocage';
  if (occupe) return;
  const p = pret();
  const barre = $('barre');
  barre.classList.toggle('attention', !p.ok && !!liste.personnes.length);
  barre.classList.toggle('pret', p.ok);
  if (!liste.personnes.length) return;
  const nCats = categoriesCochees().size;
  $('statut').textContent = p.ok
    ? `Prêt${aBlanc ? ' (mode essai : personne ne sera bloqué)' : ''} : ${p.actifs.map((id) => RESEAUX[id].nom).join(', ')} · ${nCats} catégorie${nCats > 1 ? 's' : ''}`
    : p.message;
}
function majGuide() {
  $('guide').hidden = guideMasque;
  $('ouvrirGuide').hidden = !guideMasque;
  const connectes = ORDRE.filter((id) => sessions[id]);
  const fait = [connectes.length > 0, essaiFait, totalBloques > 0];
  const actuelle = fait.indexOf(false);
  fait.forEach((f, i) => {
    $('etape' + (i + 1)).classList.toggle('fait', f);
    $('etape' + (i + 1)).classList.toggle('actuelle', i === actuelle);
  });
  $('etat1').textContent = connectes.length ? `✓ Connecté à ${connectes.map((id) => RESEAUX[id].nom).join(', ')}` : 'Pas encore connecté à un réseau.';
  $('etat2').textContent = essaiFait ? '✓ Essai réussi' : '';
  $('etat3').textContent = totalBloques ? `✓ ${totalBloques} comptes bloqués. Relance plus tard pour la suite.` : '';
  $('essai').disabled = $('lancer3').disabled = occupe || !liste.personnes.length;
}
// Message en rouge dans la barre du bas ; la carte concernée défile à l'écran et clignote.
function signaler(message, cible) {
  const barre = $('barre');
  barre.classList.remove('pret');
  barre.classList.add('attention');
  $('statut').textContent = message;
  if (cible) {
    const c = $(cible);
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    c.classList.remove('signal'); void c.offsetWidth; c.classList.add('signal');
  }
}

// ——— Partager : texte prêt et liens vers chaque réseau (rien n'est envoyé sans que tu valides sur le réseau) ———
// Le message renvoie vers l'extension (page GitHub) et vers l'annuaire qui fait la liste.
const LIEN_EXTENSION = 'https://github.com/bender-md/bloquer-extreme-droite';
const LIEN_ANNUAIRE = 'https://onbloquelextremedroite.fun/';
const LOGOS = {
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  facebook: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
  telegram: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  threads: 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z',
};
const texteAPartager = () => (totalBloques
  ? `J'ai bloqué ${totalBloques.toLocaleString('fr-FR')} compte${totalBloques > 1 ? 's' : ''} d'extrême droite sur les réseaux sociaux, automatiquement, avec cette extension gratuite pour Chrome : ${LIEN_EXTENSION}`
  : `Bloque automatiquement les comptes d'extrême droite sur X, TikTok, Instagram et Facebook avec cette extension gratuite pour Chrome : ${LIEN_EXTENSION}`)
  + `\n\nLa liste vient de l'annuaire collaboratif « On bloque l'extrême droite » : ${LIEN_ANNUAIRE}`;
// t = message complet (déjà encodé), u = lien de l'extension (encodé). Facebook ne prend qu'un lien : celui de l'extension.
const PARTAGES = [
  ['x', 'X', '#000000', (t) => `https://x.com/intent/post?text=${t}`],
  ['facebook', 'Facebook', '#0866FF', (t, u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`],
  ['whatsapp', 'WhatsApp', '#25D366', (t) => `https://wa.me/?text=${t}`],
  ['telegram', 'Telegram', '#26A5E4', (t, u) => `https://t.me/share/url?url=${u}&text=${encodeURIComponent(texteAPartager().replace(LIEN_EXTENSION, '').replace(' : \n', '\n'))}`],
  ['threads', 'Threads', '#000000', (t) => `https://www.threads.net/intent/post?text=${t}`],
];
const logo = (id, couleur) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="${couleur}"><path d="${LOGOS[id]}"/></svg>`;
// Le texte (avec le nombre de bloqués) est calculé au moment du clic.
function boutonsPartage() {
  const ligne = document.createElement('div');
  ligne.className = 'partage';
  for (const [id, nom, couleur, url] of PARTAGES) {
    const a = Object.assign(document.createElement('a'), { href: LIEN_EXTENSION, target: '_blank', rel: 'noopener' });
    a.innerHTML = logo(id, couleur) + `<span>${nom}</span>`;
    a.setAttribute('aria-label', `Partager sur ${nom} (nouvel onglet)`);
    a.onclick = () => { a.href = url(encodeURIComponent(texteAPartager()), encodeURIComponent(LIEN_EXTENSION)); };
    ligne.append(a);
  }
  const copier = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copier le message' });
  copier.onclick = async () => {
    try { await navigator.clipboard.writeText(texteAPartager()); copier.textContent = 'Copié ✓'; }
    catch (e) { copier.textContent = 'Copie impossible'; }
    setTimeout(() => (copier.textContent = 'Copier le message'), 2500);
  };
  ligne.append(copier);
  return ligne;
}

// ——— Comptes bloqués par l'extension qui ne sont plus dans la liste (retirés de l'annuaire ou lien corrigé) ———
let tousRetires = false;
function retires() {
  const dansListe = {};
  for (const p of liste.personnes) for (const [res, h] of Object.entries(p.comptes)) (dansListe[res] ??= new Set()).add(h.toLowerCase());
  const out = [];
  for (const res of ORDRE) for (const [h, v] of Object.entries(etat[res] || {})) {
    const cle = `${res}:${h}`;
    if (v === 'bloque' && !dansListe[res]?.has(h) && !gardes.includes(cle)) out.push({ res, h, cle, nom: connus[cle] || '@' + h });
  }
  return out;
}
function afficherRetires() {
  const carte = $('retires');
  const tous = liste.personnes.length ? retires() : [];
  carte.hidden = !tous.length;
  if (!tous.length) return;
  const montres = tousRetires ? tous : tous.slice(0, 5);
  const auto = tous.filter((r) => RESEAUX[r.res].debloquer && sessions[r.res]);
  carte.innerHTML = `<h2><span>Plus dans la liste</span> <small>${tous.length} compte${tous.length > 1 ? 's' : ''}</small></h2>
    <p class="aide-retires">L'extension les avait bloqués pour toi, mais ils ont été retirés de l'annuaire (ou leur lien a été corrigé).
    Elle peut les débloquer toute seule, comme elle les a bloqués.</p>
    <div class="tete-retires"></div><div class="lignes-retires"></div>`;
  if (auto.length) {
    const tout = Object.assign(document.createElement('button'), { type: 'button', className: 'principal', textContent: `Tout débloquer (${auto.length})`, disabled: occupe });
    tout.onclick = () => debloquerRetires(auto);
    carte.querySelector('.tete-retires').append(tout);
  }
  const zone = carte.querySelector('.lignes-retires');
  for (const r of montres) {
    const R = RESEAUX[r.res];
    const l = document.createElement('div');
    l.className = 'retire';
    l.innerHTML = '<div class="qui"><b></b><small></small></div><div class="actions-retire"></div>';
    l.querySelector('b').textContent = r.nom;
    l.querySelector('small').textContent = `${R.nom} · ${R.lien(r.h).replace(/^https:\/\/(www\.)?/, '')}`;
    const actions = l.querySelector('.actions-retire');
    const bouton = (texte, classe, action) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: classe, textContent: texte, disabled: occupe });
      b.onclick = action;
      actions.append(b);
    };
    if (R.debloquer) {
      // Pas connecté : on le dit sur le bouton au lieu d'échouer.
      if (sessions[r.res]) bouton('Débloquer', 'fait', () => debloquerRetires([r]));
      else actions.append(Object.assign(document.createElement('span'), { className: 'pas-connecte', textContent: `Connecte-toi à ${R.nom} pour débloquer` }));
      // Si l'automatique échoue (le réseau a changé sa page), on peut le faire soi-même puis le noter ici.
      bouton('Fait à la main', 'mini', async () => {
        delete etat[r.res][r.h];
        await sauver();
        log(`${r.nom} (${R.nom}) : noté comme débloqué.`, 'gris');
        afficher();
      });
    } else {
      // Facebook : le profil d'un compte bloqué n'est plus visible ; on ouvre la page « Blocage » des réglages.
      actions.append(Object.assign(document.createElement('a'), { href: 'https://www.facebook.com/settings/?tab=blocking', target: '_blank', rel: 'noopener', textContent: 'Débloquer dans Facebook ↗' }));
      bouton('C’est fait', 'fait', async () => {
        delete etat[r.res][r.h];
        await sauver();
        log(`${r.nom} (${R.nom}) : noté comme débloqué.`, 'gris');
        afficher();
      });
    }
    bouton('Garder bloqué', 'mini garder', async () => {
      gardes.push(r.cle);
      await chrome.storage.local.set({ gardes });
      log(`${r.nom} (${R.nom}) : reste bloqué, il ne sera plus proposé ici.`, 'gris');
      afficher();
    });
    zone.append(l);
  }
  if (tous.length > 5) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'mini', textContent: tousRetires ? 'Voir moins' : tous.length === 6 ? 'Voir l’autre' : `Voir les ${tous.length - 5} autres` });
    b.onclick = () => { tousRetires = !tousRetires; afficherRetires(); };
    zone.append(b);
  }
}

// Débloque les comptes donnés, un par un, dans une fenêtre en arrière-plan (petite pause entre deux, arrêt si un réseau bloque).
const ARRETS_DEBLOCAGE = ['deconnecte', 'limite', 'captcha'];
async function debloquerRetires(comptes) {
  if (occupe) return;
  occuper(true);
  arret = false;
  const arretes = new Set();
  let faits = 0, fenetre = null;
  try {
    fenetre = await nouvelleFenetre();
    for (const [i, r] of comptes.entries()) {
      if (arret) break;
      const R = RESEAUX[r.res];
      if (arretes.has(r.res)) continue;
      $('statut').textContent = `Déblocage ${i + 1}/${comptes.length} : ${r.nom} sur ${R.nom}… (laisse la fenêtre en arrière-plan ouverte)`;
      const tabId = await ongletDe(fenetre.id);
      if (!tabId) { log('La fenêtre de travail a été fermée : déblocage arrêté.', 'err'); break; }
      const essayer = async () => {
        await chargerOnglet(tabId, R.url(r.h));
        const brut = await executer(tabId, R.debloquer).catch((e) => 'erreur: ' + e.message);
        return typeof brut === 'string' ? brut : 'erreur: la page a changé pendant l’action';
      };
      let res = await essayer();
      // Le réseau met parfois du temps à afficher le changement : on recharge le profil et on regarde à nouveau.
      if (res.startsWith('erreur')) { await pause(2500); const r2 = await essayer(); res = r2 === 'pas_bloque' ? 'debloque' : r2; }
      if (ARRETS_DEBLOCAGE.includes(res)) {
        log(ARRETS[res](R.nom), 'err');
        arretes.add(r.res);
        continue;
      }
      if (res.startsWith('erreur')) {
        log(`${r.nom} (${R.nom}) : pas débloqué automatiquement (${res.replace(/^erreur: /, '')}). Fais-le à la main (${R.lien(r.h)}), puis touche « Fait à la main » sur sa ligne.`, 'err');
      } else {
        delete etat[r.res][r.h];
        await sauver();
        faits++;
        log(res === 'debloque' ? `${r.nom} (${R.nom}) : débloqué.` : res === 'introuvable' ? `${r.nom} (${R.nom}) : compte introuvable (supprimé ou renommé), retiré de cette liste.` : `${r.nom} (${R.nom}) : n’était déjà plus bloqué.`, 'ok');
        afficherRetires();
      }
      if (i < comptes.length - 1) await pauseOuArret((5 + Math.random() * 7) * 1000);
    }
  } catch (e) {
    log(`Erreur inattendue pendant le déblocage (${e.message}).`, 'err');
  } finally {
    if (fenetre) await chrome.windows.remove(fenetre.id).catch(() => {});
    occuper(false);
    afficher();
    $('statut').textContent = `Déblocage terminé : ${faits} compte${faits > 1 ? 's' : ''} sur ${comptes.length}.`;
  }
}

// ——— Catégories : France d'un côté, international par pays de l'autre ———
const ORDRE_CATS = ['Rassemblement national', 'Reconquête', 'Droite nationale et souverainistes', 'Militants et mouvements', 'Médias', 'Journalistes et chroniqueurs', 'Influenceurs', 'Droite et centre', 'Nouveaux ajouts (à classer)'];
const rangCat = (c) => { const i = ORDRE_CATS.indexOf(c); return i < 0 ? 98 : i; }; // catégorie inconnue : à la fin
const estInter = (c) => c.startsWith('International');
const pays = (c) => c.split('·')[1]?.trim() || 'Autres pays';
const catsVues = new Set(); // catégories déjà montrées une fois (au départ : aucune, donc tout arrive coché)
// n = comptes de la catégorie ; reste = ceux pas encore bloqués partout sur les réseaux cochés (« tout bloqué » quand c'est fini).
function pastille(valeur, libelle, n, coche, reste) {
  const l = document.createElement('label');
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', value: valeur, checked: coche });
  l.append(c, `${libelle} `);
  const s = document.createElement('span');
  s.className = 'nb';
  s.textContent = n;
  const r = document.createElement('span');
  r.className = 'reste' + (reste ? '' : ' fini');
  r.textContent = reste ? `· ${reste.toLocaleString('fr-FR')} à bloquer` : '· tout bloqué';
  l.append(s, r);
  l.title = `${n} comptes dans cette catégorie · ${reste ? `${reste} pas encore bloqués` : 'tous bloqués'} sur les réseaux cochés`;
  return l;
}
// Comptes encore à bloquer, par catégorie : une personne compte pour 1 tant qu'elle n'est pas bloquée sur tous les réseaux cochés
// (ou tous les réseaux si aucun n'est coché). Correctif : on comptait les blocages (1 par réseau), d'où « 276 · 512 à bloquer ».
function restesParCategorie() {
  const ids = reseauxCoches().length ? reseauxCoches() : ORDRE;
  const reste = {};
  for (const p of liste.personnes) {
    if (ids.some((id) => p.comptes[id] && !deja(id, p.comptes[id]))) reste[p.categorie] = (reste[p.categorie] || 0) + 1;
  }
  return reste;
}
function afficherCategories() {
  const cochees = categoriesCochees();
  const compte = {};
  for (const p of liste.personnes) compte[p.categorie] = (compte[p.categorie] || 0) + 1;
  const fr = Object.keys(compte).filter((c) => !estInter(c)).sort((a, b) => rangCat(a) - rangCat(b));
  const inter = Object.keys(compte).filter(estInter).sort((a, b) => compte[b] - compte[a]);
  // Correctif : une catégorie qui apparaît après une relecture (ex. « Nouveaux ajouts (à classer) ») arrivait décochée,
  // donc ses comptes n'étaient jamais bloqués. Comme au premier affichage, elle arrive cochée.
  const coche = (c) => !catsVues.has(c) || cochees.has(c);
  const reste = restesParCategorie();
  const somme = (cs, t) => cs.reduce((s, c) => s + (t[c] || 0), 0);
  $('categories').replaceChildren(...fr.map((c) => pastille(c, c, compte[c], coche(c), reste[c] || 0)));
  $('pays').replaceChildren(...inter.map((c) => pastille(c, pays(c), compte[c], coche(c), reste[c] || 0)));
  $('nbInter').textContent = `${somme(inter, compte)} · ${somme(inter, reste).toLocaleString('fr-FR')} à bloquer`;
  majResumeInter();
  $('nbFrance').textContent = `${somme(fr, compte)} · ${somme(fr, reste).toLocaleString('fr-FR')} à bloquer`;
  majInterTout();
  for (const c of Object.keys(compte)) catsVues.add(c);
}
function majInterTout() {
  const boites = [...document.querySelectorAll('#pays input')];
  const n = boites.filter((b) => b.checked).length;
  $('interTout').checked = n === boites.length && n > 0;
  $('interTout').indeterminate = n > 0 && n < boites.length;
  majResumeInter();
}
// Pays repliés : une phrase dit lesquels sont inclus.
function majResumeInter() {
  const boites = [...document.querySelectorAll('#pays input')];
  const n = boites.filter((b) => b.checked).length;
  $('resumeInter').textContent = !$('pays').hidden ? '' : n === boites.length ? `Les ${boites.length} pays sont inclus.` : n ? `${n} pays sur ${boites.length} inclus.` : 'Aucun pays inclus.';
}
const categoriesCochees = () => new Set([...document.querySelectorAll('.cats input:checked')].map((i) => i.value));

// ——— Consulter la liste ———
function ouvrirListe(categorie = '') {
  const sel = $('consulterCat');
  const cats = [...new Set(liste.personnes.map((p) => p.categorie))].sort((a, b) => {
    const ia = estInter(a), ib = estInter(b);
    if (ia !== ib) return ia ? 1 : -1;
    return ia ? a.localeCompare(b, 'fr') : rangCat(a) - rangCat(b);
  });
  sel.replaceChildren(new Option(`Toutes les catégories (${liste.personnes.length})`, ''), ...cats.map((c) => new Option(`${c} (${liste.personnes.filter((p) => p.categorie === c).length})`, c)));
  sel.value = categorie;
  $('consulterRecherche').value = '';
  remplirListe();
  $('consulter').showModal();
}
function remplirListe() {
  const cat = $('consulterCat').value;
  const q = $('consulterRecherche').value.trim().toLowerCase();
  const tous = liste.personnes.filter((p) => (!cat || p.categorie === cat) &&
    (!q || p.nom.toLowerCase().includes(q) || Object.values(p.comptes).some((h) => h.toLowerCase().includes(q))))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const montres = tous.slice(0, 300);
  $('consulterNb').textContent = tous.length > 300 ? `${tous.length} comptes (300 affichés, affine la recherche)` : `${tous.length} compte${tous.length > 1 ? 's' : ''}`;
  $('consulterListe').replaceChildren(...montres.map((p) => {
    const l = document.createElement('div');
    l.className = 'fiche';
    const g = document.createElement('div');
    g.innerHTML = '<b></b><small></small>';
    g.firstChild.textContent = p.nom;
    g.lastChild.textContent = detailCompte(p);
    const r = document.createElement('div');
    r.className = 'liens';
    for (const id of ORDRE) {
      const h = p.comptes[id];
      if (!h) continue;
      const a = Object.assign(document.createElement('a'), { href: RESEAUX[id].lien(h), target: '_blank', rel: 'noopener' });
      const ok = estBloque(id, h);
      a.className = ok ? 'fait' : '';
      a.textContent = (ok ? '✓ ' : '') + RESEAUX[id].nom;
      a.title = (ok ? 'Déjà bloqué · ' : '') + RESEAUX[id].lien(h);
      r.append(a);
    }
    l.append(g, r);
    return l;
  }));
}

// Exécute func dans l'onglet. Par défaut (monde isolé de l'extension), commun.js est injecté avant pour fournir BFX ;
// en monde « MAIN » (dans la page elle-même), func doit être entièrement autonome.
async function executer(tabId, func, args = [], monde) {
  if (monde === 'MAIN') {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func, args, world: 'MAIN' });
    return result;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['commun.js'] });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result;
}

// Injectée : ce que la page affiche, joint aux erreurs du journal.
const reperes = () => globalThis.BFX.reperes();

async function traiter(tabId, id, h, bloquer) {
  const r = RESEAUX[id];
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (!t && enCours?.fenetreId) tabId = (await ongletDe(enCours.fenetreId)) ?? tabId;
  await chargerOnglet(tabId, r.url(h));
  // Correctif : si la fonction injectée plante (bouton disparu, page changée…), Chrome renvoie result = null ;
  // res.startsWith() plantait alors dans lancer() et arrêtait tout le lancement, sans explication.
  const brut = await executer(tabId, r.agir, [bloquer]).catch((e) => 'erreur: ' + e.message);
  const res = typeof brut === 'string' ? brut : 'erreur: la page a changé pendant l’action (résultat vide)';
  if (res !== 'a_verifier') return res;
  await pause(2500);
  await chargerOnglet(tabId, r.url(h));
  // Correctif : cette 2e vérification n'était pas protégée ; une erreur ici arrêtait tout le lancement.
  const verif = await executer(tabId, r.agir, [false]).catch(() => null);
  return verif === 'deja' ? 'bloque' : 'erreur: toujours pas bloqué après rechargement';
}

// Fenêtre de travail, ouverte en arrière-plan.
const nouvelleFenetre = () => chrome.windows.create({ url: 'about:blank', focused: false, width: 1100, height: 850 });

// L'onglet d'une fenêtre (Chrome peut le remplacer quand la page se recharge ou redirige d'elle-même).
async function ongletDe(fenetreId) {
  const [t] = await chrome.tabs.query({ windowId: fenetreId });
  return t?.id;
}
const ongletPerdu = (e) => /Frame with ID|No tab with id|was removed|tab was closed|Cannot access/i.test(e?.message || e || '');

// Ouvre url dans la fenêtre puis exécute func ; si l'onglet a été remplacé entre-temps, on le retrouve et on réessaie.
async function executerDans(fenetreId, url, func, { monde, attente = 3000 } = {}) {
  let derniere = '';
  for (let essai = 0; essai < 3; essai++) {
    const tabId = await ongletDe(fenetreId);
    if (!tabId) return { erreur: 'fenêtre fermée' };
    await chargerOnglet(tabId, url);
    await pause(attente);
    try {
      return await executer(await ongletDe(fenetreId), func, [], monde);
    } catch (e) {
      derniere = e.message;
      if (!ongletPerdu(e)) return { erreur: e.message };
      await pause(2000);
    }
  }
  return { erreur: derniere };
}

async function lireBloques(ids) {
  const fenetre = await nouvelleFenetre();
  try {
    for (const id of ids) {
      const r = RESEAUX[id];
      if (!r.bloques) { log(`${r.nom} : la liste de tes bloqués ne peut pas être lue ici ; chaque profil sera vérifié une fois puis retenu.`, 'gris'); continue; }
      if (!sessions[id]) { log(`${r.nom} : pas connecté, ta liste de bloqués n’a pas été lue.`, 'gris'); continue; }
      log(`${r.nom} : lecture de ta liste de comptes bloqués…${r.bloques.fiable ? '' : ' (expérimental)'}`);
      let res = null;
      if (r.bloques.direct) {
        // Demande faite depuis une page du réseau (monde « MAIN »), comme le ferait le site lui-même.
        res = await executerDans(fenetre.id, r.bloques.urlDirect || r.bloques.url, r.bloques.direct, { monde: 'MAIN' });
        if (!res?.handles) log(`${r.nom} : lecture directe impossible (${res?.erreur || 'inconnu'}), lecture de la page à la place…`, 'gris');
      }
      if (!res?.handles) res = await executerDans(fenetre.id, r.bloques.url, r.bloques.lire, { attente: 1000 });
      if (res?.handles) {
        lus[id] = { date: Date.now(), comptes: res.handles };
        await sauver();
        const dansListe = liste.personnes.filter((p) => p.comptes[id] && res.handles.includes(p.comptes[id].toLowerCase())).length;
        log(`${r.nom} : ${res.handles.length} comptes bloqués lus${res.methode === 'directe' ? '' : ' (depuis la page)'}, dont ${dansListe} de la liste (ils ne seront pas rouverts).`, 'ok');
      } else {
        log(`${r.nom} : ta liste de bloqués n’a pas pu être lue (${res?.erreur || 'raison inconnue'}). Pas grave : chaque profil sera vérifié une fois puis retenu.`, 'gris');
      }
    }
  } finally {
    await chrome.windows.remove(fenetre.id).catch(() => {});
  }
}

// Boutons et barre du bas. occupe = un lancement (préparation comprise) ou une lecture est en cours ;
// enLancement = un lancement : « Arrêter » n'apparaît qu'à ce moment-là.
function occuper(oui, enLancement = oui) {
  occupe = oui;
  $('lancer').disabled = $('lire').disabled = $('oublier').disabled = oui;
  $('arreter').hidden = !enLancement;
  $('arreter').disabled = false;
  $('arreter').textContent = 'Arrêter';
  $('barre').classList.toggle('encours', enLancement);
  if (oui) $('barre').classList.remove('attention', 'pret');
  majGuide();
  majPret();
  if (liste.personnes.length) afficherRetires(); // ses boutons sont grisés pendant un lancement
}

// Pause qui s'interrompt dès qu'on clique sur « Arrêter ».
// Correctif : avant, « Arrêter » pendant une pause attendait la fin de la pause (jusqu'à 60 s) sans rien montrer.
async function pauseOuArret(ms) {
  const fin = Date.now() + ms;
  while (!arret && Date.now() < fin) await pause(Math.min(500, fin - Date.now()));
}

// Note le résultat d'un compte (mémoire, journal) et renvoie le délai avant le prochain compte de ce réseau.
async function noterResultat(lancement, id, p, res) {
  const { erreurs, actions, tabId } = lancement;
  const r = RESEAUX[id];
  const h = p.comptes[id];
  if (res.startsWith('erreur')) {
    erreurs[id]++;
    ligneCompte(id, p, h, res, await executer(tabId, reperes).catch(() => ''));
    if (erreurs[id] >= 3) {
      log(`${r.nom} : 3 erreurs de suite, on arrête ce réseau par prudence. Vérifie dans un onglet que tu es toujours connecté à ${r.nom}, puis relance dans 30 minutes.`, 'err');
      lancement.finis.add(id);
    }
  } else {
    // Une erreur n'est pas retenue (le compte sera réessayé au prochain lancement), un essai à blanc non plus.
    if (res !== 'serait_bloque') (etat[id] ??= {})[h.toLowerCase()] = res;
    erreurs[id] = 0;
    ligneCompte(id, p, h, res);
  }
  await sauver();
  afficher();
  const aAgi = res === 'bloque' || res === 'serait_bloque';
  if (aAgi) actions[id]++;
  const s = suivi?.reseaux[id];
  if (s) { if (aAgi) s.faits++; else if (res.startsWith('erreur')) s.erreurs++; else s.vus++; }
  if (s && erreurs[id] >= 3) s.arret = 'erreurs';
  // L'affichage ne doit jamais arrêter un lancement : une erreur d'affichage est seulement notée dans la console.
  try { majSuivi(); } catch (e) { console.warn('affichage du suivi', e); }
  // Pause « prudente » après une action (ou une erreur), courte quand le compte était déjà fait.
  const { min, max } = r.rythme;
  return (aAgi || res.startsWith('erreur') ? min + Math.random() * (max - min) : 4 + Math.random() * 4) * 1000;
}

// essai = étape 2 du guide : 3 profils par réseau, à blanc (personne n'est bloqué).
async function lancer({ essai = false } = {}) {
  if (occupe) return; // double clic, ou lecture déjà en cours
  occupe = true; // un 2e clic pendant la vérification des sessions est ignoré
  await verifierSessions();
  occupe = false;
  afficher(); // un réseau auquel on vient de se connecter se coche tout seul
  // Pas connecté, rien de coché… : on le dit dans la barre du bas, près du bouton, au lieu d'un message perdu dans le journal.
  const verif = pret();
  if (!verif.ok) { signaler(verif.message, verif.cible); return; }
  const aBlanc = essai || $('aBlanc').checked;
  if (!aBlanc && !essaiFait && !confirm('Tu n’as pas encore fait d’essai à blanc (étape 2).\n\nLancer quand même le vrai blocage ?')) return;
  occuper(true);
  arret = false;
  stats = {};
  montrerStats();
  $('statut').textContent = 'Préparation… (une fenêtre va s’ouvrir en arrière-plan : ne la ferme pas)';
  suivi = { aBlanc, debut: Date.now(), etape: 'Préparation : relecture de la liste et de tes comptes déjà bloqués…', reseaux: {} };
  majSuivi();
  $('suivi').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const choisis = reseauxCoches();
  const cats = categoriesCochees();
  // Correctif : « -5 » ou « 2.5 » donnaient un maximum négatif ou décimal (aucun blocage, ou un de trop).
  const maxManuel = essai ? 3 : Math.max(0, Math.floor(Number($('max').value) || 0));
  const plafond = (id) => maxManuel || RESEAUX[id].rythme.par;
  let fenetre = null, garderFenetre = false, lance = false;
  let actifs = [];
  const files = {}, prochain = {}, actions = {}, erreurs = {};
  // Correctif : tout est dans try/finally ; avant, une erreur pendant la préparation (lecture des bloqués, fenêtre…)
  // laissait les boutons grisés sur « En cours… » jusqu'au rechargement du panneau.
  try {
    if (essai) log('Essai à blanc : 3 profils par réseau sont ouverts, personne n’est bloqué.', 'ok');
    if (Date.now() - derniereLecture > 60000) await recharger('avant le lancement');
    actifs = choisis.filter((id) => {
      if (!sessions[id]) log(ARRETS.deconnecte(RESEAUX[id].nom), 'err');
      return sessions[id];
    });
    if ($('lireAvant').checked && !arret) {
      const aLire = actifs.filter((id) => RESEAUX[id].bloques && (!lus[id]?.date || Date.now() - lus[id].date > 86400000));
      if (aLire.length) await lireBloques(aLire);
    }

    for (const id of actifs) {
      files[id] = aTraiter(liste.personnes, id, cats);
      prochain[id] = 0; actions[id] = 0; erreurs[id] = 0;
      log(`${RESEAUX[id].nom} : ${files[id].length} comptes à faire, ${plafond(id)} ${aBlanc ? 'vérifiés' : 'bloqués'} au plus dans cette phase${aBlanc ? ' (essai, personne n’est bloqué)' : ''}.`);
      if (files[id].length) suivi.reseaux[id] = { prevus: Math.min(plafond(id), files[id].length), faits: 0, vus: 0, erreurs: 0 };
    }
    majSuivi();
    if (!actifs.some((id) => files[id].length)) {
      log(actifs.length ? 'Rien à faire : tous les comptes des catégories choisies sont déjà traités sur ces réseaux. Bravo !' : 'Rien n’a été lancé : aucun des réseaux cochés n’est connecté.', actifs.length ? 'ok' : 'err');
      if (essai && actifs.length) { essaiFait = true; await chrome.storage.local.set({ essaiFait }); }
      return;
    }
    if (arret) return; // « Arrêter » pendant la préparation : on n'ouvre pas de fenêtre
    filesEnCours = files;
    lance = true;

    fenetre = await nouvelleFenetre();
    const lancement = { erreurs, actions, finis: new Set(), tabId: await ongletDe(fenetre.id) };
    enCours = { actifs, actions, prochain, duree: {}, courant: '', aBlanc, fenetreId: fenetre.id, max: plafond };
    while (!arret) {
      const restants = actifs.filter((id) => !lancement.finis.has(id) && files[id].length && actions[id] < plafond(id));
      // Réseau qui n'a plus rien à faire (plafond atteint ou file vide) : fini, et ses « prévus » deviennent ce qui a été fait.
      for (const [i, s] of Object.entries(suivi.reseaux)) if (!s.fini && !s.arret && !restants.includes(i)) { s.fini = true; s.prevus = s.faits; }
      if (!restants.length) break;
      // Le réseau dont la pause se termine le plus tôt passe en premier : les réseaux avancent en alternance.
      const id = restants.reduce((a, b) => (prochain[a] <= prochain[b] ? a : b));
      const attente = prochain[id] - Date.now();
      if (attente > 0) await pauseOuArret(attente);
      if (arret) break;
      const r = RESEAUX[id];
      const p = files[id].shift();
      // Correctif : un même compte peut être dans la file deux fois (ex. « Le JDD » et « Le Journal du dimanche »
      // ont le même TikTok), ou avoir été bloqué entre-temps : on ne le rouvre pas.
      if (deja(id, p.comptes[id])) continue;
      // Correctif : si la fenêtre de travail a été fermée, chaque compte attendait 30 s puis finissait en erreur,
      // réseau par réseau ; on s'arrête proprement.
      lancement.tabId = await ongletDe(fenetre.id);
      if (!lancement.tabId) { log('La fenêtre de travail a été fermée : lancement arrêté.', 'err'); arret = true; break; }
      enCours.courant = `${r.nom} : ${p.nom}`;
      enCours.detail = detailCompte(p, id);
      majStatut();
      let res = await traiter(lancement.tabId, id, p.comptes[id], !aBlanc);
      if (ongletPerdu(res)) {
        lancement.tabId = (await ongletDe(fenetre.id)) ?? lancement.tabId;
        res = await traiter(lancement.tabId, id, p.comptes[id], !aBlanc);
      }
      enCours.courant = ''; enCours.detail = '';

      if (ARRETS[res]) {
        log(ARRETS[res](r.nom), 'err');
        lancement.finis.add(id);
        if (suivi.reseaux[id]) suivi.reseaux[id].arret = res;
        if (res === 'captcha') { garderFenetre = true; await chrome.windows.update(fenetre.id, { focused: true }).catch(() => {}); arret = true; }
        continue;
      }
      const pauseMs = await noterResultat(lancement, id, p, res);
      prochain[id] = Date.now() + pauseMs;
      enCours.duree[id] = pauseMs; // pour l'anneau du compte à rebours
    }
  } catch (e) {
    log(`Erreur inattendue (${e.message}) : lancement arrêté.`, 'err');
    arret = true;
  } finally {
    enCours = null;
    filesEnCours = null;
    if (fenetre && !garderFenetre) await chrome.windows.remove(fenetre.id).catch(() => {});
    occuper(false);
    let fin = '';
    if (lance) {
      for (const id of actifs) log(`${RESEAUX[id].nom} : ${actions[id]} ${aBlanc ? 'auraient été bloqués (essai)' : 'bloqués'} pendant ce lancement.`, 'gris');
      const reussi = !arret && actifs.some((id) => actions[id] > 0);
      if (essai && reussi) { essaiFait = true; await chrome.storage.local.set({ essaiFait }); }
      fin = arret ? 'Arrêté. Tu peux relancer quand tu veux, rien n’est perdu.'
        : essai ? (reussi ? 'Essai terminé : tout marche. Étape suivante : « Lancer le blocage ».' : 'Essai terminé, mais aucun profil n’a pu être vérifié : regarde les messages en rouge ci-dessous.')
        : 'Phase terminée. Relance une nouvelle phase quand tu veux, autant de fois que tu veux : l’extension reprend là où elle s’est arrêtée.';
      log(fin, arret ? 'gris' : 'ok');
    } else if (arret) log('Arrêté.');
    afficher();
    if (fin) $('statut').textContent = fin; // le message de fin reste dans la barre du bas
    // La carte de suivi garde le bilan ; elle disparaît si rien n'a été lancé.
    if (lance) { suivi.fin = fin; majSuivi(); } else { suivi = null; majSuivi(); }
  }
}

$('lancer').onclick = () => lancer();
$('essai').onclick = () => lancer({ essai: true });
$('lancer3').onclick = () => {
  if (occupe) return;
  if ($('aBlanc').checked) { $('aBlanc').checked = false; log('Mode essai décoché : cette fois, les comptes seront vraiment bloqués.', 'gris'); }
  lancer();
};
$('masquerGuide').onclick = async () => { guideMasque = true; await chrome.storage.local.set({ guideMasque }); majGuide(); $('ouvrirGuide').focus(); };
$('ouvrirGuide').onclick = async () => { guideMasque = false; await chrome.storage.local.set({ guideMasque }); majGuide(); $('masquerGuide').focus(); };
$('reseaux').addEventListener('change', () => { majPret(); afficherCategories(); }); // « à bloquer » dépend des réseaux cochés
document.querySelectorAll('#categories, #pays, #interTout, #aBlanc').forEach((el) => el.addEventListener('change', () => majPret()));
$('voirDeja').onchange = (e) => $('journal').classList.toggle('masquer-deja', !e.target.checked);
const cocherCats = (oui) => { document.querySelectorAll('.cats input').forEach((i) => (i.checked = oui)); majInterTout(); majPret(); };
$('catTout').onclick = () => cocherCats(true);
$('catRien').onclick = () => cocherCats(false);
$('interTout').onchange = (e) => { document.querySelectorAll('#pays input').forEach((i) => (i.checked = e.target.checked)); majResumeInter(); };
$('pays').addEventListener('change', majInterTout);
$('voirListe').onclick = () => ouvrirListe();
$('voirPays').onclick = () => {
  const ouvert = $('pays').hidden;
  $('pays').hidden = !ouvert;
  $('voirPays').textContent = ouvert ? 'Masquer les pays ▴' : 'Choisir par pays ▾';
  $('voirPays').setAttribute('aria-expanded', ouvert);
  majResumeInter();
};
$('consulterCat').onchange = remplirListe;
$('consulterRecherche').oninput = remplirListe;
$('fermerListe').onclick = () => $('consulter').close();
$('arreter').onclick = () => {
  arret = true;
  $('arreter').disabled = true;
  $('arreter').textContent = 'Arrêt en cours…';
  log('Arrêt demandé : l’extension termine le compte en cours puis s’arrête.', 'gris');
};
$('lire').onclick = async () => {
  if (occupe) return;
  occuper(true, false);
  let aucun = false;
  // Correctif : try/finally, sinon une erreur (fenêtre refusée, stockage plein…) laissait les boutons grisés.
  try {
    await verifierSessions();
    const ids = reseauxCoches().filter((id) => sessions[id]);
    // Correctif : sans réseau coché, une fenêtre s'ouvrait et se refermait sans aucun message.
    if (!ids.length) aucun = true;
    else {
      $('statut').textContent = 'Lecture de tes comptes bloqués… (une fenêtre s’ouvre en arrière-plan)';
      await lireBloques(ids);
    }
  } catch (e) {
    log(`Lecture interrompue (${e.message}).`, 'err');
  } finally {
    occuper(false);
    afficher();
    if (aucun) signaler('Pour lire tes bloqués, coche un réseau marqué « Connecté ».', 'carteReseaux');
  }
};
$('oublier').onclick = async () => {
  if (!confirm('Tout revérifier ?\n\n'
    + '• Ça ne débloque personne.\n'
    + '• L’extension oublie ce qu’elle a déjà fait : TOUS les profils seront rouverts, ce qui prend beaucoup plus de temps et augmente le risque de limite par les réseaux.\n\n'
    + 'À faire seulement si tu as changé de compte ou débloqué des comptes à la main.')) return;
  etat = {}; lus = {};
  await sauver();
  log('Mémoire effacée : tous les comptes seront revérifiés au prochain lancement.', 'gris');
  afficher();
};
// Revenir sur le panneau après s'être connecté quelque part : on remet les sessions à jour.
window.addEventListener('focus', async () => { await verifierSessions(); if (liste.personnes.length) afficher(); });

({ etat = {}, lus = {}, essaiFait = false, guideMasque = false, connus = {}, gardes = [] } = await chrome.storage.local.get(['etat', 'lus', 'essaiFait', 'guideMasque', 'connus', 'gardes']));
$('partage').append(boutonsPartage());
await verifierSessions();
majGuide();
try {
  await retenirListe(await chargerListe());
  occuper(false); // active les boutons
  afficher();
} catch (e) {
  $('resume').textContent = `La liste des comptes n’a pas pu être chargée (${e.message}). Vérifie ta connexion Internet, ouvre onbloquelextremedroite.fun dans un onglet, puis touche « Réessayer ».`;
  $('resume').append(' ', Object.assign(document.createElement('button'), { className: 'mini', textContent: 'Réessayer', onclick: () => location.reload() }));
  signaler('Liste des comptes non chargée : voir le message en haut de la page.');
}
