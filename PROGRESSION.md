# Sobrizen V4 — un parcours par périodes

## Comportement actuel

Le suivi repose sur des périodes déclarées, à partir du questionnaire initial. L’utilisateur confirme sa situation (arrêt ou consommation), sa date de début, ses anciennes habitudes hebdomadaires et la date depuis laquelle cette estimation est valable. Les périodes peuvent commencer avant l’inscription. Le cap personnel est un choix séparé : une reprise ou une consommation ponctuelle ne modifie jamais automatiquement un objectif d’arrêt.

Une période d’arrêt déclarée continue jusqu’à un changement de rythme renseigné. Il n’y a plus de calendrier quotidien à compléter. Deux actions suffisent pour actualiser le parcours : noter une consommation ponctuelle, ou déclarer un changement de rythme avec sa date et ses estimations hebdomadaires. Les périodes et les occasions passées sont modifiables dans l’historique. Une occasion enregistrée par erreur peut être annulée après confirmation, sans toucher aux périodes.

## Règles de calcul

- Les jours sans alcool et les séries comptent les journées civiles écoulées, sans ajouter une journée inachevée. Un arrêt commencé il y a 14 jours donne 14 jours, même si le compte vient d’être créé.
- Corriger cette date à 30 jours puis à 7 jours recalcule les cumuls, la série, les records, la période du bilan, les économies et les courbes. Une correction remplace la déclaration concernée ; elle ne crée pas un deuxième arrêt.
- Une reprise termine la période précédente. Un nouvel arrêt conserve les jours et les records des arrêts antérieurs. Les plus longues périodes affichent leurs dates et leur durée.
- Une consommation ponctuelle remplace les valeurs de cette journée et interrompt la série sans effacer les jours antérieurs. Les totaux explicitement notés aujourd’hui sont visibles immédiatement ; aucun budget journalier estimé supplémentaire n’est crédité pour aujourd’hui.
- Les anciennes journées réellement renseignées restent conservées. Leurs valeurs connues remplacent les estimations de la période pour les mêmes jours. Les occasions corrigées dans le nouveau suivi sont prioritaires pour leur journée, sans double comptage.
- Une estimation hebdomadaire est répartie sur les jours de la période. Ces valeurs sont étiquetées comme estimations, jamais présentées comme des mesures quotidiennes. Une quantité ancienne explicitement inconnue reste inconnue.
- Les économies estimées correspondent à la dépense de référence proratisée sur les jours écoulés dont le coût est connu, moins les dépenses de la période et les dépenses connues d’aujourd’hui. Les valeurs négatives sont conservées. Le pourcentage d’évolution compare uniquement les journées closes ; aucune division par zéro.

Les cumuls de longue durée sont calculés par intervalles et exceptions. Le moteur ne génère ni n’enregistre des milliers de faux bilans journaliers.

## Courbes et paramètres

Les vues Semaine, Mois et Année couvrent 7 jours, 30 jours et 12 mois glissants, avec navigation dans l’historique. L’année passée est accessible avant l’inscription si elle fait partie de l’estimation confirmée par l’utilisateur. Les repères d’abonnement existants sont conservés en base, mais ne bloquent plus l’accès au passé déclaré.

Les courbes distinguent les estimations et les valeurs notées. Les périodes d’arrêt restent visibles ; l’intensité du vert s’éclaircit lorsque la consommation ou les dépenses baissent. Les moyennes annuelles évitent de confondre un mois plus long avec une hausse du rythme quotidien. Le point d’aujourd’hui reste distinct des moyennes closes. Les dates inconnues n’ont pas de fausse valeur zéro.

Les paramètres réunissent anciennes habitudes, dates de référence, objectif (arrêt, réduction ou observation), limites personnelles facultatives en réduction, échéance facultative, motivation, prochaine action et situations à préparer. Une priorité d’accompagnement masque les limites autonomes. Il n’existe ni prescription de sevrage ni suggestion automatique de recommencer à boire. Quitter un objectif d’arrêt exige une confirmation explicite.

Le programme de 30 étapes, le journal, le plan de soutien, les jeux, le mouvement, la communauté et les données antérieures sont conservés.

## Persistance et compatibilité

La migration additive `schema/20260928002847_create_journey_timelines.sql` crée `journey_timelines`. Son document privé constitue la source du nouveau suivi. Il contient les périodes, occasions, références et objectifs, avec une révision entière pour détecter les formulaires périmés.

`save_journey_timeline` valide le document et sauvegarde la timeline, la date et les références dans une seule transaction. Il vérifie les versions de la timeline, du parcours, des références et du cap courant. Un nouveau chapitre d’objectif est ajouté uniquement lorsqu’un choix de cap change réellement, à la date du jour. L’historique des chapitres n’est jamais réécrit.

Les tables restent protégées par RLS propriétaire ; la fonction est `SECURITY INVOKER`, sans clé privilégiée dans le navigateur. La migration ne crée aucune période pour un compte existant et ne réécrit aucun bilan. Le premier questionnaire permet à son propriétaire de confirmer ses propres déclarations.

Les anciens modules de calcul et leurs tests restent disponibles pour la compatibilité et la vérification des données historiques. Les anciens écrans de calendrier et de bilan quotidien ne sont plus les points d’entrée du suivi actuel. Les exports JSON incluent la timeline et les données historiques ; le CSV d’une courbe conserve la provenance des valeurs.

Le service worker ne stocke que des ressources publiques de l’application. Aucune donnée de parcours n’est ajoutée au cache public. Aucun service payant ou nouvelle dépendance applicative n’est nécessaire.

## Vérifications

`node --test tests/*.test.mjs` couvre les calculs historiques et le moteur par périodes. Les cas du nouveau moteur vérifient notamment les 14 et 30 jours à l’inscription, les corrections dans les deux sens, les reprises, les occasions d’aujourd’hui, les données anciennes contradictoires, les zéros, les dates bissextiles et les changements d’heure.

Les scénarios d’interface utilisent les vrais modules avec des données fictives. La persistance et l’isolation en base sont vérifiées avec des fixtures jetables entièrement annulées par `ROLLBACK`. Le contrôle visuel publié utilise la démo ; aucun compte personnel existant n’est utilisé pour les essais.

## Repères de soutien existants

- [Comprendre le sevrage — Alcool Info Service](https://www.alcool-info-service.fr/agir-sur-sa-consommation/comment-arreter-de-boire/sevrage-ce-quil-faut-savoir-pour-mieux-vous)
- [Repères de consommation — Alcool Info Service](https://www.alcool-info-service.fr/sinformer-et-evaluer-sa-consommation/alcool-et-sante/les-reperes-de-consommation-quest-ce-que-cest)
