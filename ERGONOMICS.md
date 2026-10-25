# Sobrizen — ergonomie transversale

Intervention du 25 octobre 2026, basée sur le commit `c7689a1a70607629ee0197ba423f00d252d28b01`.

## Intention

Référence fonctionnelle : I Am Sober, pour la visibilité du compteur, la progression lisible et l'accès au soutien. Ce choix ne prétend pas établir un classement mondial actuel : notes et volumes d'avis diffèrent selon les boutiques et les pays. Sources consultées : https://iamsober.com/en/site/home et https://apps.apple.com/fr/app/i-am-sober-je-suis-sobre/id672904239 . Aucun écran, logo ou texte propriétaire n'a été copié.

Sobrizen conserve son identité, ses couleurs par rubrique, la réduction progressive et le parcours d'arrêt protégé. Aucun calendrier ou engagement quotidien obligatoire n'est ajouté.

## Changements

- Navigation mobile persistante : Accueil, Suivi, Aide, Ensemble et Menu. Le menu complet conserve les neuf rubriques, regroupées visuellement. L'écran courant porte un titre court. Le menu fermé est inaccessible au clavier ; le menu ouvert isole le fond, retient le focus et se ferme avec Échap.
- Accueil : compteur lisible, saisie formulée sans injonction à consommer et raccourcis respiration, jeux et mouvement. Tous les nombres proviennent du suivi existant.
- Historique : recherche locale, filtres Tout/Sans alcool/Consommations et affichage progressif par douze déclarations. Aucun enregistrement n'est supprimé ni tronqué en base.
- Journal : filtres de type, textes longs dépliables et recherche explicitement limitée aux notes chargées par l'application existante. La limite serveur existante de notes récentes n'est pas supprimée par cette intervention.
- Parcours : choix des trente étapes repliable, retour du focus vers la leçon choisie et conservation du formulaire original.
- Santé : raccourcis de rubrique, sélecteur de périodes défilable et cartes lisibles. Les avertissements, sources et limites scientifiques restent inchangés.
- Jeux : filtres Calmes/Réflexes et cartes adaptées au téléphone. Ni règles de jeu, ni droits Gratuit/Premium modifiés.
- Mouvement : séance guidée placée avant les cartes, niveaux et commandes tactiles agrandis. Les contenus de sécurité et les limites d'accès restent inchangés.
- Communauté : filtres annoncés aux aides techniques, lecture dépliable et actions secondaires regroupées sous Options. Les boutons de signalement et de masquage sont conservés.
- Profil : groupes repliables, accès aux préférences de lecture et texte agrandi facultatif. Le prix demeure 29,99 EUR par an.
- Formulaires : afficher/masquer le mot de passe, compteurs de caractères, indicateur de modifications non enregistrées et confirmation avant fermeture/navigation lorsque des champs ont changé. Les retours d'erreur sont aussi lisibles dans la boîte de dialogue, au-dessus de son fond modal.

## Frontières de sécurité

L'ajout est constitué de `ergonomics.mjs`, `ergonomics-core.mjs` et `ergonomics.css`. Il délègue les actions aux contrôleurs existants. Il n'appelle aucune API et ne modifie aucune table, politique RLS, règle de calcul, facturation, consentement ou droit Premium. Aucun service payant, suivi publicitaire ou bibliothèque applicative supplémentaire.

La préférence de taille du texte seule est ajoutée au stockage local (`sobrizen-ui-text`). Les comparaisons de champs restent dans des WeakMap en mémoire ; les mots de passe et fichiers en sont exclus. Il ne s'agit pas de sauvegarde automatique : quitter volontairement ou fermer l'application peut toujours perdre une saisie non enregistrée. Les confirmations de fermeture sont soumises aux possibilités du navigateur mobile.

Le service worker ajoute seulement les trois ressources publiques à sa liste autorisée. Il ne met toujours pas en cache les réponses d'authentification ou de suivi.

## Vérifications réalisées

- Syntaxe JavaScript vérifiée avec Node.
- Huit tests unitaires : `node --test tests/ergonomics.test.mjs`.
- 125 assertions d'interface exécutées localement dans Chromium sur des fixtures synthétiques représentant les contrats DOM existants : neuf rubriques, largeurs 320/360/390/768/1440 px, thèmes clair/sombre, navigation clavier, focus, filtres, pagination, sauvegarde simulée, saisies non enregistrées, mot de passe et droits Premium conservés.
- Captures locales examinées sur téléphone et ordinateur. Le navigateur de test ne pouvait pas accéder au réseau : les fixtures et les scripts réels de cette modification ont été injectés dans un document isolé avec un stockage local simulé.

Ces contrôles ne sont PAS une recette réelle des comptes, emails, paiements, appareils iOS/Android ou de la base de production. La suite entière du dépôt et tous les styles de production n'ont pas été exécutés dans cet environnement. Les tests de comptes et la validation commerciale restent distincts. Un statut Vercel réussi ne prouve pas un parcours fonctionnel de bout en bout.

## Retour arrière

Revenir au commit précédent ou retirer les deux inclusions ergonomics de `index.html` et les trois entrées du cache avec un nouveau nom de cache. Aucune migration de données n'est nécessaire.
