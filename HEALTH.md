# Santé & bienfaits

## Parcours utilisateur

L’onglet « Santé & bienfaits » est disponible dans le menu et depuis l’accueil. Il sépare les repères documentaires sur l’arrêt d’alcool et les observations personnelles. Six périodes permettent de consulter les recherches, leurs populations, leurs limites et leurs liens originaux. La date de vérification documentaire est affichée ; les références ne sont pas mises à jour automatiquement.

Le compteur et les dates indicatives utilisent `progression.snapshot()` : c’est le même historique effectif que celui du suivi de consommation. Une saisie rétroactive, une tranche de consommation ou une correction d’arrêt recalcule les repères sans effacer les ressentis. Pendant une reprise, une réduction sans arrêt déclaré ou en l’absence de parcours, les informations restent consultables sans projection datée d’abstinence personnelle.

Les jalons décrivent le temps écoulé, jamais des organes guéris ou une récupération médicale validée. Les alertes de sevrage et les ressources d’aide restent accessibles à toutes les étapes. Les numéros français sont identifiés comme tels.

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
