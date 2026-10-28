# Confidentialité

En bref : **l’extension ne collecte rien et n’envoie rien à personne.** Il n’y a pas de serveur derrière elle.

## À qui l’extension parle

| Destination | Pourquoi |
|---|---|
| `onbloquelextremedroite.fun` | Lire la liste publique de l’annuaire (`/accounts.js`, `/socials.js`, `/api/accounts`, `/followers.js`). Aucune donnée te concernant n’est envoyée. |
| `raw.githubusercontent.com` | Lire le classement à jour des comptes par catégorie (`donnees/categories.json` de ce dépôt), sans cookie. Aucune donnée te concernant n’est envoyée. |
| `x.com`, `tiktok.com`, `instagram.com`, `facebook.com` | Ouvrir les profils et cliquer sur « Bloquer », lire ta liste de comptes bloqués. Exactement ce que tu ferais toi-même, avec ta propre session. |

Aucun autre site n’est contacté : pas de statistiques, pas de publicité. Les boutons de partage ouvrent le réseau choisi seulement quand tu cliques dessus.
Les données de l’annuaire sont lues comme des données : leur code n’est jamais exécuté.

## Ce qui est enregistré, et où

Uniquement dans le **stockage local de l’extension, dans ton navigateur** (`chrome.storage.local`) :

- l’état de chaque compte déjà traité (bloqué, déjà bloqué, introuvable…) ;
- la liste des noms de comptes que tu as bloqués, lue sur chaque réseau, et sa date ;
- le nombre de comptes de l’annuaire au dernier passage (pour le badge « +N »).

Tout disparaît si tu désinstalles l’extension. « Tout revérifier » efface les deux premiers.

## Les cookies

Pour afficher « connecté » ou « pas de session », l’extension demande au navigateur **si le cookie de connexion du réseau existe**
(`auth_token` pour X, `sessionid` pour TikTok et Instagram, `c_user` pour Facebook). **Sa valeur n’est jamais lue, copiée ni envoyée.**
Les blocages se font dans des pages ouvertes normalement, avec ta session, comme si tu cliquais toi-même.

Aucun mot de passe n’est demandé ni vu.

## Permissions demandées

| Permission | Usage |
|---|---|
| `tabs`, `scripting` | Ouvrir les profils dans une fenêtre et y cliquer sur les boutons. |
| `cookies` | Vérifier la présence du cookie de connexion (voir plus haut). |
| `storage` | Garder ta progression dans le navigateur. |
| `alarms` | Vérifier toutes les 30 minutes si l’annuaire a de nouveaux comptes (badge « +N »). |
| Accès aux 5 sites listés | Rien d’autre : l’extension n’a pas accès aux autres sites que tu visites. |

## L’annuaire

La liste est publiée par l’annuaire, qui a sa propre politique :
[onbloquelextremedroite.fun/confidentialite](https://onbloquelextremedroite.fun/confidentialite).
L’extension n’est pas réalisée par l’équipe de l’annuaire.
