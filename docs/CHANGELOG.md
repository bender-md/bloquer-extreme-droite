# Historique des versions

## 2.18

- **Correctif** : quand un réseau coché n’avait aucun compte à faire (tous déjà bloqués), le blocage s’arrêtait avec
  « Erreur inattendue (… reading 'arret') ». Il continue maintenant normalement, et un problème d’affichage ne peut plus arrêter un blocage.

## 2.17

- **La liste est lue sur une copie publiée dans ce dépôt** ([`donnees/annuaire.json`](../donnees/annuaire.json)), mise à jour toutes
  les 10 minutes à partir du site de l’annuaire (ajouts et retraits compris). Depuis le 28/10, le site de l’annuaire ne laisse plus
  d’autres outils lire sa liste ; la copie évite aussi que chaque utilisateur interroge son serveur. Si la copie est injoignable,
  l’extension essaie le site lui-même.

## 2.16

- **« à bloquer » plus clair** : chaque catégorie compte maintenant les comptes pas encore bloqués (une personne = 1, même présente sur
  plusieurs réseaux). Le chiffre ne dépasse donc plus jamais le nombre de comptes de la catégorie.

## 2.15

- **Comptes à rebours en anneau** : pendant les pauses, un cercle se vide avec les secondes au centre (grand dans la carte, petit par réseau).
- **Derniers comptes** dans la carte « Phase de blocage en cours » : les 5 derniers comptes traités, pour voir que ça avance sans descendre.
- **« à bloquer » par catégorie** : chaque catégorie (et chaque pays) indique combien de blocages il reste à faire sur les réseaux cochés.
- Journal plus lisible sur petit écran.

## 2.14

- **Installation plus simple** : le fichier téléchargé donne directement le bon dossier (plus de dossier dans le dossier),
  et ce dossier contient un fichier « C’EST LE BON DOSSIER - choisis celui-ci dans Chrome ».
- En-tête du panneau : « @unfachoko (crédits) » ne se coupe plus en fin de ligne.

## 2.13

- **Partager** : le message renvoie vers l’extension (cette page GitHub) et vers l’annuaire ; bouton Bluesky retiré.

## 2.12

- **Classement automatique** : les nouveaux comptes de l’annuaire sont rangés dans la bonne catégorie (ou leur pays) toutes les 10 minutes,
  et l’extension relit ce classement à chaque ouverture. Plus besoin de réinstaller pour avoir les catégories à jour.

## 2.11

- **Suivi en direct** : une carte « Phase de blocage en cours » montre le profil en cours, l’avancement de chaque réseau
  et le temps restant ; le titre de l’onglet affiche l’avancement.
- **Ordre** : les comptes français d’abord, puis l’étranger, des plus suivis aux moins suivis.
- **Pays, abonnés et raison** affichés pour chaque compte (pendant le blocage, dans le journal et dans la liste).
- **Plus dans la liste** : les comptes bloqués par l’extension puis retirés de l’annuaire sont signalés, avec déblocage automatique
  (X, TikTok, Instagram) ou « Garder bloqué ».
- **Partager** : boutons X, Bluesky, Facebook, WhatsApp, Telegram, Threads et « Copier le message ».
- Vocabulaire « phase » : le maximum de blocages s’applique à chaque lancement, pas au total.
- Nombreuses corrections de robustesse (relectures anonymat, bugs, ergonomie).

## 2.5 — première version publique

- Blocage automatique sur **X, TikTok, Instagram et Facebook**, à partir de l’annuaire
  [onbloquelextremedroite.fun](https://onbloquelextremedroite.fun) relu en direct (à l’ouverture puis toutes les 10 minutes).
- La liste contient **uniquement les comptes de l’annuaire** ; `complements.json` n’ajoute que des liens TikTok / Instagram / Facebook
  vérifiés pour des personnes déjà présentes dans l’annuaire, et le classement par catégorie.
- Détection des sessions (présence du cookie de connexion, jamais lu).
- Lecture de ta liste de comptes déjà bloqués (X et TikTok ; Instagram expérimental).
- Réseaux en alternance, pauses et plafonds prudents par réseau, arrêt sur captcha, déconnexion ou 3 erreurs de suite.
- Mode « à blanc », catégories France / International par pays, fenêtre « Consulter la liste », journal d’activité, barres de progression.
- X : le menu « ⋯ » d’un profil est réessayé jusqu’à 3 fois s’il ne s’ouvre pas du premier coup ; un compte déjà bloqué y est reconnu.
