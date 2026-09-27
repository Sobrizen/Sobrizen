# Sobrizen V3 — progression personnelle

## Parcours
- Deux caps distincts : réduire, ou arrêter et maintenir l’arrêt. Une phase d’observation est disponible pour les personnes qui n’ont pas encore choisi.
- Les comptes présents avant la migration gardent leur cap d’arrêt. Une consommation ne change jamais le cap. Sortir du cap d’arrêt exige une confirmation personnelle.
- Chaque choix crée un chapitre privé, sans modifier les objectifs passés. Bilans, jours sans alcool cumulés, meilleure série, réflexions et étapes restent accessibles. Les corrections de données recalculent honnêtement les chiffres.
- Aucune prescription de sevrage ou réduction automatique en pourcentage. Les limites chiffrées facultatives sont masquées lorsque la personne déclare une situation nécessitant un accompagnement. Cette déclaration ne remplace pas un avis médical.

## Mesures et finances
Le bilan journalier accepte une quantité inconnue, un nombre de verres standard ou un calcul volume/degré/portions. Un verre standard français correspond à 10 g d’alcool pur. Les dépenses sont déclarées indépendamment : montant inconnu, aucune dépense, ou montant en euros. Ne pas boire n’implique pas automatiquement une dépense nulle.

Les périodes comparées sont des journées écoulées et entièrement renseignées. Les jours manquants, quantités inconnues, coûts inconnus et dates futures ne sont jamais assimilés à zéro. Un pourcentage avec référence nulle n’est pas calculé.

Les deux courbes montrent une année anniversaire complète, avec vue quotidienne ou moyenne quotidienne sur sept journées complètes. Les douze mois sont visibles sur téléphone. Le tableau mensuel et le CSV contiennent les dates et la couverture. La moyenne hebdomadaire n’est pas une projection.

L’écart financier estimé correspond au budget hebdomadaire de référence / 7 multiplié par le nombre de jours dont la dépense est connue, moins les dépenses sur ces mêmes jours. Un écart négatif reste négatif. Les achats peuvent être consommés un autre jour. Ce calcul n’est ni un solde bancaire ni une économie certaine.

## Début d’abonnement
Aucun fournisseur de facturation n’était connecté à cette version. Ne pas inventer une date d’abonnement :
1. `subscription_anchors.started_on` : date vérifiée écrite uniquement côté serveur ; prioritaire, lecture limitée au propriétaire.
2. `progress_settings.subscription_started_on` : date déclarée par la personne, étiquetée comme non vérifiée.
3. À défaut, date de création du compte, explicitement appelée début du suivi, jamais abonnement.

Une intégration de paiement future doit fournir la date initiale vérifiée via un traitement serveur authentifié et idempotent. Aucune clé privilégiée ne doit être exposée au navigateur. Ces champs ne confèrent aucun droit d’accès payant.

## Base de données
Migration additive : `schema/progression.sql`. Ne pas réexécuter à l’aveugle sur une base déjà migrée. Les nouvelles tables privées ont RLS et des politiques propriétaire explicites. Les chapitres sont append-only côté client. Le déclencheur de compatibilité maintient une quantité inconnue lorsque l’ancien client transforme une journée sans alcool en journée avec consommation.

Aucune donnée privée n’est ajoutée au cache du service worker. Aucun service payant ou traqueur supplémentaire.

## Vérifications
`node --test tests/progress.test.mjs` vérifie les valeurs inconnues, les unités, la cohérence du bilan, les années bissextiles, les anniversaires, les périodes comparables, les coûts et l’historique des objectifs.

Vérifications séparées réalisées lors de la mise en œuvre : isolation en base et écritures en transaction annulée ; conservation des anciennes colonnes vérifiée par empreintes ; rendu et interactions des nouveaux écrans dans Chromium en mémoire (les modules inchangés de jeux, mouvement, programme et l’authentification réseau étaient remplacés par des fixtures locales pour ces essais). Ce dernier contrôle ne constitue pas un test de connexion réelle en production.

## Sources des repères
- https://www.alcool-info-service.fr/sinformer-et-evaluer-sa-consommation/alcool-et-sante/les-reperes-de-consommation-quest-ce-que-cest
- https://www.alcool-info-service.fr/agir-sur-sa-consommation/comment-arreter-de-boire/sevrage-ce-quil-faut-savoir-pour-mieux-vous
- https://www.inrs.fr/publications/bdd/solvants/SolvantAG.html?refINRS=SOLVANTS_SOLVANT_64-17-5

## Suivi simple — septembre 2026

- Écran Progrès : semaine civile lundi–dimanche, mois civil, année anniversaire ; navigation bornée au début du suivi et à la période actuelle.
- Deux cartes sélectionnent la courbe (verres standard ou dépenses), avec détail tactile, tableau repliable et export de la période. Les deux totaux restent visibles.
- Comparaisons sur le même nombre de premiers jours clos des périodes, hors aujourd’hui, avec couverture complète par métrique. Pas de pourcentage si la référence vaut zéro ; l’écart absolu reste disponible. Pas de comparaison inégale 31 jours/28 jours.
- Sur l’année, 12 totaux mensuels du suivi. Les points partiels sont creux et séparés des segments entre mois complets. Les courbes annuelles quotidiennes et leur tendance sur sept jours restent accessibles dans les détails.
- Accueil allégé, accès direct aux trois périodes, bilan centré sur consommation et achats ; champs de ressenti regroupés sans effacer les anciennes valeurs.
- Aucun changement de schéma, de connexion ou de stockage personnel. Aucun nouveau service ni dépendance applicative.

Validation : `node --test tests/*.test.mjs` (26 cas). Une simulation DOM avec les vrais modules vérifie navigation, saisie, modification, préservation des notes et confirmation du changement de cap d’arrêt. Elle ne remplace pas le test de connexion et sauvegarde avec un compte réel.

## Date personnelle et habitudes de départ

- La date est visible et modifiable depuis le cap de l’accueil, le cap des Progrès et la rubrique Moi. Libellé « Date de début d’arrêt » en cap d’arrêt, « Date de début de parcours » en réduction ou observation.
- Le même formulaire redemande la consommation en verres standard et les dépenses en euros, estimées par semaine avant le début déclaré. Les champs sont préremplis et obligatoires ; zéro est accepté, une case vide ne vaut pas zéro. Le bouton « Enregistrer et recalculer » confirme les trois repères ensemble.
- La date peut être aujourd’hui ou une date passée depuis 1900, y compris avant la création du compte. Les dates invalides ou futures, les montants négatifs ou non finis sont refusés.
- La migration `20260927235056_save_journey_reference_atomically.sql` ajoute le RPC `save_journey_reference`, exécuté avec les droits du compte connecté et les règles RLS existantes. Il met à jour ensemble `sobriety_journeys.started_at`, l’ancienne estimation de budget et les deux références de `progress_settings`. Les versions des deux lignes sont vérifiées ; un échec annule l’ensemble. Le client applique les deux lignes retournées ensemble, après vérification de session.
- Le bilan d’accueil couvre la date choisie jusqu’à aujourd’hui : consommation notée, dépenses connues, couverture et économies estimées. Une nouvelle estimation recalcule les économies et les références des vues semaine, mois et année. Les économies portent uniquement sur les jours de dépenses renseignés. La comparaison de consommation avec les anciennes habitudes exige une couverture complète des jours écoulés, hors aujourd’hui, et une référence positive.
- La date et sa durée civile sont actualisées dans le cap. Les journées, chapitres, objectifs, raisons, réussites et repères d’abonnement restent conservés. Les cumuls de jours sans alcool décrivent toujours les journées renseignées ; la date déclarée ne crée aucun jour supposé sans alcool. Les périodes du suivi restent ancrées sur l’abonnement ou le compte.
- Le format historique (timestamp à midi local) est conservé. Le serveur valide le fuseau et la date civile ; aucune donnée historique n’est réécrite par la migration.

Validation : les 34 tests de calcul passent, dont 8 consacrés aux nouveaux repères (recalcul, valeurs inconnues, vrais zéros, limites et changements d’heure). Les scénarios DOM vérifient le formulaire et les montants après modification. Des fixtures distantes jetables, intégralement annulées par `ROLLBACK`, ont validé la transaction, les conflits, les droits du propriétaire, l’insertion de repères absents et 17 entrées invalides. Aucun compte existant n’a été utilisé pour ces tests.
