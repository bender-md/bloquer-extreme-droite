# Fonctionnement technique

Extension Chrome **Manifest V3**, sans dépendance, sans étape de compilation : les fichiers du dossier `extension/` sont chargés tels quels.

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | Déclaration : nom, version, permissions, sites autorisés. |
| `background.js` | *Service worker* : ouvre le panneau au clic sur l’icône ; toutes les 30 min, compte les entrées de l’annuaire et affiche un badge « +N ». |
| `panneau.html` | Le panneau (HTML + CSS, aucun fichier externe). |
| `panneau.js` | Logique du panneau : affichage, choix des réseaux et catégories, file d’attente, rythme, journal, mémoire (`chrome.storage.local`). |
| `annuaire.js` | Lit l’annuaire et construit la liste des personnes avec leurs comptes par réseau. |
| `reseaux.js` | Un « adaptateur » par réseau : reconnaître un identifiant, détecter la session, bloquer un profil, lire les comptes déjà bloqués. |
| `commun.js` | Petits outils (`globalThis.BFX`) injectés dans l’onglet du réseau avant chaque action : attendre un élément, trouver un bouton par son texte, détecter un captcha… |
| `complements.json` | Données livrées avec l’extension : liens vérifiés (`liens`) et classement par catégorie (`categories`). |
| `icones/` | Icônes 16, 32, 48 et 128 px. |

## Construction de la liste (`annuaire.js`)

1. Lecture de trois fichiers publics de l’annuaire : `/accounts.js` (liste de base, comptes X), `/socials.js` (liens des autres réseaux)
   et `/api/accounts` (ajouts validés, liens par réseau, **retraits**). Si la lecture directe est refusée par la protection anti-robots,
   le site est ouvert dans un onglet caché et les mêmes fichiers sont lus depuis la page.
2. `accounts.js` et `socials.js` sont du JavaScript : **ils ne sont jamais exécutés**, le tableau / l’objet est extrait et lu avec `JSON.parse`.
3. Les retraits sont appliqués. Sans `/api/accounts`, rien n’est lancé (on risquerait de bloquer un compte retiré).
4. Les entrées d’une même personne (une par réseau) sont regroupées par compte X puis par nom normalisé.
5. `complements.json > liens` ajoute ou corrige des liens TikTok / Instagram / Facebook pour des personnes **déjà présentes dans l’annuaire**
   (sources : données ouvertes de l’Assemblée nationale, Wikidata, profils publics, vérifiés un par un).
   Les champs `extras` (vide) et `recherche_faite` ne sont plus utilisés.
6. `complements.json > categories` range chaque personne (clés `x:<compte>`, `n:<nom normalisé>`, `tt:<compte TikTok>`) ;
   l’international porte le pays (« International · Allemagne »). Une personne non classée va dans « Nouveaux ajouts (à classer) ».

## Déroulé d’un lancement (`panneau.js`)

1. Vérification des sessions : `chrome.cookies.get` sur le cookie de connexion (présence seulement).
2. Si demandé, lecture des comptes déjà bloqués (au plus une fois par 24 h et par réseau).
3. Une file par réseau : personnes des catégories cochées, ayant un compte sur ce réseau, pas encore traitées.
4. Une fenêtre dédiée est ouverte. Boucle : on prend le réseau dont la pause finit le plus tôt (alternance), on charge le profil,
   on injecte `commun.js` puis la fonction `agir` de l’adaptateur (`chrome.scripting.executeScript`), qui renvoie un statut :
   `bloque`, `deja`, `introuvable`, `indisponible`, `serait_bloque`, `deconnecte`, `captcha`, `limite`, `a_verifier` ou `erreur: …`.
5. `a_verifier` : la page est rechargée et le profil revérifié. `deconnecte` / `captcha` / `limite` : le réseau est mis de côté
   (sur captcha, tout s’arrête et la fenêtre reste ouverte). 3 erreurs de suite : le réseau est mis de côté.
6. Pause aléatoire entre `min` et `max` secondes après une action, 4 à 8 s après un compte déjà bloqué. Arrêt au plafond `par`.

Plafonds par défaut (`rythme` dans `reseaux.js`) : X 40 (8–20 s), TikTok 25 (15–35 s), Instagram 15 (30–60 s), Facebook 15 (30–60 s).

## Chaque réseau (`reseaux.js`)

Les fonctions `agir*` et `lire*` sont **injectées dans la page du réseau** : elles ne doivent rien référencer d’autre que `globalThis.BFX`.

- **X** : attend la barre latérale (session), repère `data-testid="userActions"` (menu ⋯), puis `block` et `confirmationSheetConfirm`.
  Le menu est réessayé 3 fois. Comptes bloqués : la même requête que la page des réglages de X (`/i/api/1.1/blocks/list.json`,
  avec ta session, depuis x.com), sinon lecture de la page `settings/blocked/all` en la faisant défiler.
- **TikTok** : menu `data-e2e="user-more"` → « Bloquer » → confirmation ; reconnaissance du texte FR/EN.
  Comptes bloqués : `/api/block/user_list/` appelé **depuis la page** (monde `MAIN`) pour que TikTok signe la requête comme les siennes ;
  secours : lecture des réglages à l’écran.
- **Instagram** (moins testé) : bouton « Options » de l’en-tête → « Bloquer » → confirmation. Comptes bloqués (expérimental) :
  `/api/v1/users/blocked_list/`, sinon lecture de `accounts/blocked_accounts/`.
- **Facebook** (moins testé) : bouton d’options du profil ou de la page → « Bloquer » → « Confirmer ». Pas de lecture de la liste des bloqués.

En cas d’`erreur`, le journal affiche un résumé de la page (attributs `data-testid`, `data-e2e`, `aria-label` et fenêtres ouvertes) :
c’est ce qu’il faut joindre à un signalement.

## Mémoire

`chrome.storage.local` : `etat[réseau][compte]` (résultat), `lus[réseau]` (`{ date, comptes }`), `vuAnnuaire` (nombre d’entrées vues).

## Contribuer

- **Tester une modification** : `chrome://extensions` → mode développeur → « Charger l’extension non empaquetée » → dossier `extension/`.
  Après chaque modification, bouton ↻ de l’extension, puis recharger le panneau. Toujours tester **à blanc** d’abord.
- **Un réseau a changé son interface** : c’est presque toujours un sélecteur dans `reseaux.js`. Lance à blanc, ouvre la ligne « Erreur »
  du journal pour voir les repères de la page, et adapte l’adaptateur.
- **Ajouter un réseau** : une entrée dans `RESEAUX` (nom, cookie de session, validation de l’identifiant, URL du profil, rythme prudent,
  fonction `agir`, éventuellement `bloques`), le nom dans `ORDRE`, et le domaine dans `host_permissions` du manifest.
- **La liste** (ajout, retrait d’un compte) se gère sur l’annuaire, pas ici.
- **Règles** : pas de dépendance externe, aucune donnée envoyée hors des sites listés, rythmes prudents, textes en français simple.
- **Publier une version** : augmenter `version` dans `extension/manifest.json`, compléter `docs/CHANGELOG.md`, lancer
  `scripts/empaqueter.sh`, et joindre `dist/bloquer-extreme-droite.zip` à une Release (modèle : `scripts/modele-release.md`).
