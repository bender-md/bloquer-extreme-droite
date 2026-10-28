# Mode d’emploi détaillé

Ce guide suppose que l’extension est installée (voir le [README](../README.md#installation-5-minutes)).
Un clic sur l’icône de l’extension ouvre le **panneau** dans un nouvel onglet.

> L’extension est un outil indépendant. La liste des comptes est celle de l’annuaire
> [onbloquelextremedroite.fun](https://onbloquelextremedroite.fun), initiative de [@unfachoko](https://x.com/unfachoko).

## 1. Au chargement

Le panneau lit l’annuaire en direct (cela prend quelques secondes), puis affiche les compteurs.
Les boutons « Lancer » et « Lire mes bloqués » deviennent actifs quand la liste est chargée.

Si un message « Annuaire injoignable » apparaît : ouvre [onbloquelextremedroite.fun](https://onbloquelextremedroite.fun) dans un onglet,
attends que la page s’affiche, puis recharge le panneau. (Le site a une protection anti-robots ; l’extension sait la plupart du temps
la passer seule en ouvrant le site dans un onglet caché.)

## 2. Ta progression (en haut)

- **Le grand chiffre** : comptes bloqués, tous réseaux confondus, sur le nombre total de comptes à traiter.
  Une même personne présente sur 3 réseaux compte pour 3.
- **La barre** : en couleur pleine les comptes bloqués, en hachuré les comptes **introuvables** (supprimés, suspendus, renommés), en gris ce qui reste.

## 3. Réseaux

Une carte par réseau (X, TikTok, Instagram, Facebook) :

- **La case à cocher** : le réseau sera traité au prochain lancement. Au départ, seuls les réseaux connectés sont cochés.
- **« Connecté » / « Pas connecté »** : l’extension a trouvé (ou non) ta connexion à ce réseau dans ce navigateur.
  Le bouton « Se connecter ↗ » ouvre la page de connexion. En revenant sur le panneau, l’état se met à jour.
- **La barre et les chiffres** : bloqués, restants, total, introuvables, pour ce réseau.
- **« liste lue le … »** : date de la dernière lecture de ta liste de comptes bloqués sur ce réseau (voir § 6).
  Facebook n’a pas de liste lisible : chaque profil y est vérifié une fois, puis retenu.

## 4. Catégories

- **France** : Rassemblement national, Reconquête, droite nationale et souverainistes, militants et mouvements, médias,
  journalistes et chroniqueurs, influenceurs, etc. Les comptes ajoutés à l’annuaire récemment, pas encore rangés, sont dans
  « Nouveaux ajouts (à classer) ».
- **International** : la case « International » coche ou décoche tous les pays ; « Voir par pays » les affiche un par un.
- **Chaque pastille** indique le nombre de comptes et, après « · », les **comptes pas encore bloqués** sur les réseaux cochés (une personne compte pour 1, même sur plusieurs réseaux) (« tout bloqué » quand c’est fini).
- **Une pastille colorée = incluse.** Touche-la pour l’exclure. « Tout » et « Aucune » cochent ou décochent tout.
- **Consulter la liste** ouvre une fenêtre avec tous les comptes : filtre par catégorie, recherche par nom ou @,
  et pour chaque personne ses réseaux (un ✓ vert = déjà bloqué). Un clic sur un réseau ouvre le profil.

## 5. Réglages

- **Mode essai (à blanc)** : l’extension visite les profils et note « Serait bloqué », sans rien bloquer. Idéal pour essayer.
- **Lire d’abord mes comptes déjà bloqués** : une fois par jour, avant de commencer, l’extension lit ta liste de comptes bloqués,
  pour ne pas rouvrir des profils inutilement.
- **Nombre maximum de blocages par phase** : laisse vide pour les valeurs prudentes. Une phase = un lancement.
  **Ce n’est pas une limite au total** : relance une nouvelle phase autant de fois que tu veux.

Valeurs prudentes par défaut :

| Réseau | Blocages par phase | Pause entre deux comptes |
|---|---|---|
| X | 40 | 8 à 20 s |
| TikTok | 25 | 15 à 35 s |
| Instagram | 15 | 30 à 60 s |
| Facebook | 15 | 30 à 60 s |

Les réseaux avancent **en alternance** : pendant la pause de X, l’extension peut traiter TikTok, etc.
Un compte déjà bloqué ou introuvable ne compte pas dans le maximum et n’entraîne qu’une courte pause.

**Ordre** : les comptes français d’abord, puis ceux de l’étranger ; à chaque fois des plus suivis aux moins suivis
(relevés d’abonnés de l’annuaire).

## 6. Lancer, suivre, arrêter

- **Lancer le blocage** : une fenêtre s’ouvre en arrière-plan et visite les profils un par un. Ne la ferme pas ; tu peux la réduire.
- **La carte « Phase de blocage en cours »** apparaît en haut du panneau : nombre de comptes bloqués sur le total prévu,
  le profil en cours (pays ou catégorie, abonnés, raison donnée par l’annuaire), l’état de chaque réseau
  (« En cours », « En pause, encore 12 s », « Phase finie », « Arrêté : … ») et le temps restant estimé.
  Pendant les pauses, un anneau se vide avec les secondes restantes. En bas de la carte, les 5 derniers comptes traités.
  Le titre de l’onglet affiche aussi l’avancement (« 12/80 bloqués »). À la fin, la carte garde le bilan de la phase.
- **Arrêter** : l’extension s’arrête tout de suite (elle termine seulement le compte en cours).
- **Lire mes bloqués maintenant** (Réglages, outils avancés) : lit tout de suite ta liste de comptes bloqués.
  X et TikTok : fiable. Instagram : expérimental. Facebook : non disponible.
- **Tout revérifier…** (outils avancés) : efface la mémoire de l’extension. **Ne débloque personne.**

### Arrêts automatiques

| Ce qui se passe | Ce que fait l’extension |
|---|---|
| Captcha / vérification | Met le réseau de côté, **laisse la fenêtre ouverte** et arrête tout. Fais la vérification, attends, relance. |
| Déconnexion | Met le réseau de côté. Reconnecte-toi puis relance. |
| Le réseau limite les visites | Met le réseau de côté : attends au moins 30 min. |
| 3 erreurs de suite sur un réseau | Met ce réseau de côté pour cette phase. |

## 7. Ce qui se passe (journal)

Chaque ligne : heure, réseau, nom, lien du profil, résultat, et en dessous le pays ou la catégorie, les abonnés et la raison.

| Résultat | Sens |
|---|---|
| **Bloqué** | Le compte vient d’être bloqué. |
| **Déjà bloqué** | Il l’était déjà ; rien n’a été fait. |
| **Introuvable** / **Indisponible** | Compte supprimé, suspendu, renommé, ou page inaccessible. |
| **Serait bloqué** | Mode essai. |
| **Erreur** | La page n’avait pas la forme attendue. Une ligne dépliable montre ce que la page affichait (utile pour signaler un bug). |

## 8. Nouveaux comptes et comptes retirés

- La liste est relue sur l’annuaire toutes les 10 minutes tant que le panneau est ouvert : les nouveaux comptes sont signalés
  dans le journal et ajoutés à la phase en cours s’ils correspondent à tes choix. Panneau fermé, l’icône affiche un badge « +N ».
- **Plus dans la liste** : si un compte que l’extension a bloqué pour toi disparaît de l’annuaire (retrait, ou lien corrigé),
  il apparaît dans cette carte. **Débloquer** le fait automatiquement (X, TikTok, Instagram) ; **Tout débloquer** les fait tous.
  Sur Facebook, le profil d’un compte bloqué n’est plus visible : un lien ouvre la page « Blocage » de Facebook, puis « C’est fait ».
  Si le déblocage automatique échoue, fais-le à la main puis touche **« Fait à la main »**. **Garder bloqué** le retire de la carte.
  Les comptes que tu avais bloqués toi-même avant l’extension ne sont jamais proposés.

## 9. Partager

La carte « Fais passer le mot » propose X, Facebook, WhatsApp, Telegram, Threads et « Copier le message ».
Le message contient ton nombre de comptes bloqués, le lien de l’extension (cette page GitHub) et celui de l’annuaire. Rien n’est publié sans que tu valides sur le réseau.
