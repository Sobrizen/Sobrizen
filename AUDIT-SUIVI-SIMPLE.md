# Sobrizen — validation du suivi simplifié

27 octobre 2026. Base de travail : `44904fc422a7a6f8e997eefe2987b55b007dc4f4`.

## Résultat visé et implémenté

L’accueil se concentre sur la durée de l’arrêt, le prochain repère et les bienfaits documentés. La référence d’expérience retenue après la dernière précision de l’utilisateur est **I Am Sober**. Le calendrier et le retour sur les données s’appuient aussi sur les enseignements de Drink Less. Aucun rituel ni liste de tâches quotidiennes n’est affiché sur l’accueil.

Les sept derniers jours restent consultables. Le calendrier mensuel est disponible gratuitement et en Premium, avec une saisie facultative par date. Les fonctions existantes sont conservées dans leurs sections.

## Vérifications automatiques exécutées directement

Les fichiers DOM sont exécutés sans le lanceur imbriqué `spawnSync`, dont l’environnement peut bloquer la création de processus. Chaque invocation a produit un compte réel de scénarios et un code retour 0.

| Ensemble | Résultat |
|---|---:|
| Nouvel accueil, calendrier, saisies, conflits, fuseaux et confidentialité | 26 / 26 |
| Navigation et flux existants : démo, sans consentement, membre, Premium, courses de session | 45 / 45 |
| Santé et encouragements, événements DOM | 21 / 21 |
| Exercices, niveaux de difficulté et lecteur | 10 / 10 |
| Parcours d’abonnement simulés | 15 / 15 |
| Modèle du suivi | 19 / 19 |
| Validation et corrections des journées | 23 / 23 |
| Horloge d’arrêt et maintien de la précision | 22 / 22 |
| Santé, contenus et calculs d’encouragement | 37 / 37 |
| Historique, temps, référence, progression et suivi | 70 / 70 |
| Ergonomie et calculs des jeux mobiles/cognitifs | 42 / 42 |
| Jeux classiques : Snake, blocs, mémoire et réflexes | 12 / 12 |
| **Total des scénarios comptabilisés ci-dessus** | **342 / 342** |

La suite Mouvement a été relancée avec `SOBRIZEN_JSDOM_PATH=/tmp/sobrizen-audit-qa/node_modules/jsdom` après une première invocation qui avait ignoré ses tests faute de variable. Seule l’exécution effective 10/10 est comptée. Les cinq groupes de chaque grande suite DOM ont été appelés directement. Les tests de saisie utilisent un service simulé ; ils n’écrivent pas dans un compte de production.

## Points importants vérifiés

- Un arrêt de vingt minutes ne devient pas une journée entière ni un bénéfice médical certifié.
- Confirmer une journée sans alcool ou noter seulement une envie conserve l’heure précise de l’arrêt. Une nouvelle consommation réelle continue d’invalider l’ancien compteur.
- Un achat est distinct d’une consommation. Déclarer Sans alcool conserve les dépenses déjà notées et un coût inconnu reste inconnu.
- Les notes, sommeil, énergie et détails de boissons restent présents lors d’une correction limitée à l’envie.
- Déclaration réelle, estimation de période, journée inconnue et date future sont distinguées visuellement et par les libellés accessibles.
- Les dates antérieures au début du suivi ne sont pas proposées comme des journées à remplir. Les dates futures sont inactives.
- Les conflits d’insertion et de modification conservent les réponses du formulaire ; le compte, le consentement et les valeurs anciennes sont vérifiés.
- Les réponses tardives après déconnexion ne réintroduisent pas les données dans un autre compte.
- Les dates du calendrier, du journal et du ressenti suivent le fuseau du parcours. Les brouillons restent présents lors du passage à minuit.
- Les modes Réduire et Observer n’affichent pas de faux compteur d’abstinence.
- Les accès gratuits/Premium et les niveaux sportifs sont inchangés et testés.

## Données et sécurité du compte

Métadonnées de production vérifiées en lecture : types et contraintes de `daily_checkins`, unicité propriétaire/date, politiques RLS par propriétaire et trigger de normalisation des quantités. Aucune donnée personnelle consultée et aucune migration effectuée.

Les corrections quotidiennes utilisent un patch limité, un filtre propriétaire/date/id et une comparaison des anciennes valeurs. Cette protection concerne la ligne quotidienne. Le contrôle des occasions canoniques repose sur le document chargé ; il ne constitue pas une transaction intertables ou une synchronisation instantanée entre appareils. Les occasions canoniques restent prioritaires dans le moteur lors du rechargement.

Le format stocké de `stop_basis` et les RPC existants sont conservés. La comparaison de la confirmation d’heure distingue maintenant une modification de consommation d’une dépense ou d’un ressenti.

## Style et livraison

CSS analysé sans erreur ; dix couples texte/fond examinés en clair et sombre dépassent 4,5:1, minimum 4,62:1. Sept contrôles DOM de présentation ont été exécutés par le contributeur CSS. Le style prévoit les petits écrans, le texte agrandi, le focus clavier et la réduction des mouvements. Les simulations DOM ne remplacent pas une mesure géométrique dans un navigateur réel.

Les nouveaux modules n’ajoutent aucune dépendance de production. La liste du cache public du service worker est complète, sa version est incrémentée et les nouveaux assets sont servis sans cache long. Syntaxe JavaScript, configuration JSON et `git diff --check` vérifiées.

La vérification visuelle après déploiement est consignée dans la réponse de livraison avec une capture du navigateur. Aucun résultat clinique propre à Sobrizen n’est prétendu : les essais des applications comparées sont documentés séparément dans `RECHERCHE-APPLICATIONS.md`.
