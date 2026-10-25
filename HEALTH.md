# Santé & bienfaits

## Parcours utilisateur

L’onglet « Santé & bienfaits » est disponible dans le menu et depuis l’accueil. Il sépare les repères documentaires sur l’arrêt d’alcool et les observations personnelles. Onze périodes, des premières minutes à un an et au-delà, permettent de consulter les recherches, leurs populations, leurs limites et leurs liens originaux. La date de vérification documentaire est affichée ; les références ne sont pas mises à jour automatiquement.

Le compteur et les dates indicatives utilisent `progression.snapshot()` : c’est le même historique effectif que celui du suivi de consommation. Une saisie rétroactive, une tranche de consommation ou une correction d’arrêt recalcule les repères sans effacer les ressentis. Pendant une reprise, une réduction sans arrêt déclaré ou en l’absence de parcours, les informations restent consultables sans projection datée d’abstinence personnelle.

Les jalons décrivent le temps écoulé, jamais des organes guéris ou une récupération médicale validée. Les alertes de sevrage et les ressources d’aide restent accessibles à toutes les étapes. Les numéros français sont identifiés comme tels.

## Date, heure et compteur précis

Le formulaire initial et les corrections d’arrêt demandent l’heure du dernier verre, facultative. Un formulaire rapide « Modifier mon arrêt » permet de préciser la date et l’heure, avec un bouton « Maintenant » et le choix « Je ne sais pas ». Les heures répétées lors d’un changement d’heure demandent un choix explicite ; une heure inexistante ou future est refusée. Le fuseau canonique du parcours est affiché et n’est pas modifié lors d’un voyage.

Le document de parcours v3 conserve `stopped_at` (instant UTC à la minute) et `stop_basis` (contexte des consommations connues ce jour-là) sur les événements d’arrêt. Les anciennes données ne reçoivent aucune heure inventée. Un arrêt peut commencer après une consommation le même jour ; le compteur précis est alors actif mais la consommation et les statistiques quotidiennes restent intactes. Toute nouvelle information qui invalide le contexte ou indique une consommation ultérieure empêche de réutiliser l’ancienne heure pour une projection précise. L’heure historique reste conservée.

Les repères sont à 0, 6, 24, 48 et 72 heures, puis 7, 14, 28, 90, 180 et 365 jours. Les premiers seuils situent des périodes documentées, pas des bénéfices garantis à une minute donnée. Aucune baisse universelle de tension ou récupération mentale n’est annoncée à 20 minutes ; aucun calcul d’alcoolémie ou délai de conduite n’est proposé.

Le compteur se rafraîchit localement, sans appel API, toutes les 15 secondes lorsque l’écran est visible et sans interrompre un formulaire. L’étape actuelle est sélectionnée automatiquement ; les autres restent consultables et un bouton permet de revenir à son étape. La prochaine étape affiche sa date et le temps restant. Sans heure connue, les repères restent approximatifs à la journée et les périodes inférieures à 24 heures restent informatives.

La migration `schema/journey_stop_clock.sql` conserve les versions v1/v2, les politiques d’accès et le contrôle de version existants. Elle refuse une rétrogradation qui ferait perdre les heures du document v3. Les quinze références médicales et scientifiques sont accessibles depuis les cartes.

## Observations personnelles

Six ressentis facultatifs sont proposés : humeur, énergie, qualité du sommeil, anxiété, concentration et confort physique. Ils sont notés de 1 à 5, avec au moins une réponse par bilan. Ce questionnaire n’est pas une échelle diagnostique validée. Une diminution d’anxiété est décrite dans le sens favorable, à l’inverse des autres dimensions.

Les moyennes portent sur les observations des sept derniers jours. Une comparaison avec les sept jours précédents exige au moins deux valeurs dans chacune des deux fenêtres. Les journées absentes ne deviennent pas des zéros. Le graphique affiche seulement les points renseignés, sans interpolation ni prévision de scores futurs, sur 30 jours, 90 jours ou 12 mois. Les anciens bilans d’humeur et d’énergie restent utilisables, champ par champ, lorsqu’aucune nouvelle valeur n’est fournie pour la même date.

Le formulaire accepte les jours passés, charge les valeurs de la date sélectionnée et conserve les brouillons des autres dates tant qu’il reste ouvert. Il ne modifie jamais un statut de consommation. L’historique permet la correction et la suppression d’un nouveau bilan, sans supprimer les anciens bilans de consommation dont des ressentis peuvent être issus.

## Confidentialité et sauvegarde

Les nouveaux ressentis sont stockés dans la table privée `health_checkins`, séparément de `daily_checkins`. Les contrôles propriétaire et consentement sont appliqués en base, avec une fonction de sauvegarde `SECURITY INVOKER`. Une sauvegarde vérifie la version de l’observation afin de détecter les modifications concurrentes. Le formulaire conserve ses réponses en cas d’erreur réseau ou de conflit. Le changement de compte et le retrait du consentement invalident l’état privé en mémoire.

Les ressentis font partie de l’export JSON personnel. Aucune donnée personnelle n’est ajoutée au service worker ou au stockage local. Seules les ressources publiques de l’application sont mises en cache. Le mode démo utilise des observations explicitement fictives en mémoire, sans enregistrement distant. Aucun service payant ni nouvelle dépendance de production n’est ajouté.

## Vérifications

`node --test tests/*.test.mjs games.test.mjs` vérifie les règles existantes et les nouveaux calculs de santé. Les cas de santé portent notamment sur les jours manquants, les valeurs invalides, les reprises, les corrections rétroactives, les tranches de consommation, les changements d’heure et les dates bissextiles. Les sources documentaires sont référencées par identifiant depuis chaque affirmation.

La recette d’interface vérifie l’accès par le menu, les périodes, les sources, les champs de ressenti, le changement de date, la sauvegarde, l’échec réseau et les conflits. Les essais de persistance doivent utiliser des données fictives isolées et être annulés par `ROLLBACK`, sans modification de l’historique d’un membre.
