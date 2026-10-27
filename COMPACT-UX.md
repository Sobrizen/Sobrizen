# Sobrizen — navigation compacte

27 octobre 2026. Base inspectée : `0295543a0ea566e665c65c9c21b435d2899828bc` ; intégration prévue sur `a327c807570d5f0881fcd92be9a3f52d3ccc936f`, en conservant le thème clinique ajouté entre-temps.

## Changements

Les neuf rubriques reçoivent une entrée compacte, avec l'essentiel immédiatement visible. Le suivi est séparé en Résumé, Calendrier et Parcours ; Santé en Bienfaits, Ressentis et Envies ; le parcours en Étapes et Historique. Le calendrier affiche deux semaines à la fois sur les écrans courts, avec accès au mois complet et à sa légende. Les jeux sont proposés par six, les notes et les événements par petites pages. Les sources scientifiques sont sélectionnables une à une.

Les documents originaux, formulaires, sources et fonctions restent disponibles. Les fenêtres de détail déplacent les vrais nœuds, sans dupliquer les formulaires ni leur contexte d'authentification. Les boutons utilisent les commandes existantes, y compris les contrôles Gratuit/Premium. Le compteur et les chiffres proviennent de l'affichage déjà calculé ; aucun calcul médical, financier ou de durée n'est ajouté.

Les longues notes bénéficient d'une lecture paginée sans retrait de caractères. La fermeture d'un formulaire modifié demande confirmation. Les informations sensibles disparaissent lorsque leur vue d'origine est remplacée ou à la déconnexion. Les animations, comptes, paiements, règles des jeux, politiques de base de données et textes scientifiques ne sont pas modifiés. Aucun stockage de données personnelles supplémentaire n'est ajouté.

Le bouton « Tous les détails » présente un index de la rubrique. Les textes complets et formulaires sélectionnés peuvent encore défiler dans leur propre fenêtre ; l'utilisateur n'a plus à parcourir les autres sections pour les trouver.

## Vérification réalisée

- Six tests unitaires réussis : pagination complète, bornes, textes et espaces intégralement conservés.
- 89 contrôles Chromium réussis, dont 70 mesures de géométrie : quatorze combinaisons rubrique/onglet sur cinq tailles, 1440×900, 1366×768, 390×844, 360×640 et 320×568.
- Contrôles d'interaction : choix d'onglet au clavier, maintien du focus, navigation du calendrier, treize jeux atteignables, commandes des difficultés, conservation de l'identité des formulaires, recherche, lecture intégrale des notes, sélection des dix-sept références et purge des anciennes vues.
- Les précautions des premiers jours restent visibles dans la vue compacte testée à 320×568. Un rafraîchissement d'accès ne ferme pas le formulaire en cours.
- Aucune erreur JavaScript non traitée dans ces scénarios.

**Portée exacte :** le vrai nouveau module de présentation est testé dans Chromium contre des structures DOM de test reproduisant les sélecteurs inspectés du dépôt. Les contrôleurs métier sont simulés et les données fictives. Ce n'est pas un test de bout en bout de la version publiée, de l'ensemble des feuilles de style, d'un compte réel ou de Supabase. Les anciens résultats de 342 tests ne sont pas recomptés ici. Aucun test sur téléphone physique, Safari, paiement ou accès médical personnel n'a été effectué.

La validation de publication est distincte : le statut Vercel du nouveau commit doit être contrôlé après le push. Les tests navigateur sont fournis dans le dossier de validation joint à la conversation ; le test unitaire est aussi ajouté au dépôt.

## Accessibilité et limites

Le texte conserve une taille lisible et le zoom n'est pas bloqué. Un très petit écran en paysage, un clavier ouvert ou du texte agrandi peuvent nécessiter un défilement vertical : aucun contenu ne doit être coupé pour prétendre qu'il tient artificiellement sur un écran. Les tests de référence portent sur les vues d'entrée et non sur une promesse universelle d'absence de défilement.

## Reproduire le dossier joint

Avec Node.js, Python, Playwright et Chromium installés :

```sh
node --test tests/compact-core.test.mjs
python tests/compact-browser.py
```

Le test navigateur charge tout en mémoire et n'effectue pas de connexion réseau. Le chemin de Chromium utilisé dans le script est `/usr/bin/chromium` et peut être adapté au poste de test. Les résultats détaillés sont dans `compact-browser-results.json`.
