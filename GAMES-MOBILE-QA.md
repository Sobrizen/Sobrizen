# Jeux mobiles — ergonomie et validation (25 octobre 2026)

## Portée
Les huit activités existantes utilisent un seul contrôleur de session plein écran et des styles isolés. L'interface publique `gamesView` / `initGames`, les filtres du catalogue, les règles gratuites/Premium, les clés de points et de records sont conservés. Aucun accès réseau, dépendance payante, migration de données ou modification des fonctions de santé, de suivi, de paiement ou d'authentification.

Blocs Zen donne la priorité au plateau 10 × 20 non déformé. Les déplacements, rotation et pose restent accessibles sur une rangée en portrait courant et de part et d'autre du plateau en paysage. Les très petits écrans passent à deux rangées sans réduire les cibles tactiles. Les touches ont un retour d'appui, des noms accessibles et des icônes vectorielles. Les textes secondaires sont réduits ; les règles restent dans le bouton d'aide.

Un gestionnaire de répétition indépendant par doigt évite qu'un deuxième doigt interrompe la flèche maintenue. La pose immédiate peut être annulée en glissant hors du bouton avant de relâcher. Les clics de compatibilité ne déclenchent pas une deuxième action. Pause, perte de focus, fermeture, navigation, rotation et sortie du plein écran libèrent correctement les commandes. Les boucles d'animation sont arrêtées quand inutiles. Aucun test ne change les droits d'un compte réel.

## Tests réalisés
- 24 tests Node des règles et des helpers : 24 réussis, 0 échec. Commande : `node --test tests/games-mobile.test.mjs`.
- 240 cas d'affichage dans Chromium avec émulation tactile : 8 jeux × 28 dimensions, plus 8 jeux × 2 simulations d'encoches/barres système. Aucun bouton hors écran, inférieur à 44 pixels CSS ou en chevauchement ; aucun plateau déformé ou tronqué ; aucune erreur JavaScript relevée. Memory est testé au niveau maximal de 20 cartes.
- 41 scénarios d'interaction dans Chromium : 41 réussis, 0 échec, aucune erreur JavaScript. Couvre le démarrage direct, les vrais événements tactiles Chromium via CDP, le multitouch, les annulations, les appuis prolongés, les gestes, le clavier, la pause et la reprise, le changement d'orientation, la destruction de session, les huit jeux et les cartes gratuites/Premium.
- Les tests navigateur injectent les modules regroupés dans une page locale sans accès réseau. Les règles et le CSS viennent des fichiers livrés ; seuls les imports, le chargement du CSS et les hooks de test sont adaptés dans le harnais local.

Dimensions CSS : 280×653, 320×480, 320×568, 360×640, 360×720, 360×800, 375×667, 375×812, 390×844, 393×852, 412×915, 414×896, 430×932, 480×800, 480×320, 568×320, 640×360, 653×280, 667×375, 740×360, 780×360, 812×375, 844×390, 896×414, 915×412, 932×430, 768×1024, 1024×768. Insets supplémentaires : portrait 47/34 pixels haut/bas ; paysage 47/47/21 pixels gauche/droite/bas.

## Limites explicites
Il s'agit de tests automatisés dans Chromium, pas de tests physiques sur tous les modèles. Safari/iOS, les WebViews propriétaires, les anciens navigateurs et les gestes système nécessitent encore une recette sur appareils réels. L'émulation de taille n'est pas une preuve universelle de compatibilité. Le domaine public, les comptes réels, les paiements et l'installation PWA réelle ne font pas partie de cette recette locale.

## Livraison et retour arrière
Le point d'entrée `games.mjs` importe `games-mobile.mjs`, qui dépend de `games-mobile-core.mjs`, `games-core.mjs` et `games-brain-core.mjs`. Le cache public inclut les nouveaux modules et CSS tout en conservant les ressources des changements de santé concurrents. Les anciens modules restent dans le dépôt pour un retour arrière ; rétablir le point d'entrée précédent et changer la version du cache suffit. Ne pas restaurer globalement l'ancien `sw.js`, car cela pourrait retirer des ressources ajoutées par d'autres fonctionnalités.
