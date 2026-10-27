# Sobrizen — une référence pour un suivi simple et encourageant

Recherche documentaire et décision de conception du 27 octobre 2026.

## Décision

**I Am Sober est la référence principale retenue pour l’expérience d’arrêt de Sobrizen.** Son compteur, ses repères et la conservation des épisodes précédents répondent au besoin précisé par l’utilisateur : voir directement le chemin parcouru et trouver une raison de continuer. [Guide officiel](https://iamsober.com/en/site/faq)

La version finale se concentre sur **compteur, bienfaits, prochain repère**, avec le calendrier à portée de main. Aucune liste d’actions quotidiennes ni rituel obligatoire sur l’accueil. Drink Less reste un appui pour le suivi et la lisibilité des données ; ses résultats de réduction de consommation ne sont pas confondus avec une preuve d’abstinence.

Ce choix est un choix d’expérience pour l’arrêt, éclairé par la comparaison clinique et ergonomique. Il ne présente pas I Am Sober comme le vainqueur d’un essai comparatif absent. Les études consultées ne permettent pas d’établir un classement universel de toutes les applications. En particulier, réduire la consommation et maintenir une abstinence après un séjour de soins sont des résultats différents.

L’implémentation adapte cette organisation au besoin de simplicité exprimé avec les textes, composants et données propres à Sobrizen. Elle ne reproduit pas les marques, illustrations ou contenus propriétaires des applications comparées. Les fonctionnalités historiques de Sobrizen restent accessibles.

## Méthode et portée

Revue ciblée approfondie des publications originales, documents institutionnels et guides officiels. Les essais randomisés ont été distingués des cohortes, évaluations de campagnes, témoignages et chiffres promotionnels. Pour chaque résultat : population, comparaison, durée, critère mesuré et limites ont été examinés. Les publications issues d’un même essai n’ont pas été comptées comme plusieurs confirmations indépendantes.

L’analyse d’ergonomie repose sur les guides, descriptions et illustrations officielles accessibles publiquement. Elle n’équivaut pas à une installation et une inspection de toutes les versions mobiles payantes. L’absence d’essai identifié dans cette recherche ne prouve pas l’absence de toute étude existante ou à venir. Les boutiques et avis ne constituent pas ici une preuve d’efficacité thérapeutique.

## Comparaison des principales références

| Référence | Ce que les données permettent de dire | Intérêt pour Sobrizen | Décision |
|---|---|---|---|
| **Drink Less** | Essai randomisé britannique de 5 602 personnes souhaitant réduire leur consommation. À six mois, résultat principal non significatif ; analyse de sensibilité favorable, effet modeste. | Calendrier et retour compréhensible sur les données. | Appui pour le suivi ; son organisation en actions quotidiennes ne correspond pas à la priorité finale. |
| **A-CHESS / Connections** | Résultats randomisés favorables en complément d’un parcours de soins. Le contexte clinique et l’accompagnement font partie de l’intervention. | Continuité, suivi, soutien accessible et maintien des acquis. | Référence complémentaire pour le soutien ; son service humain ne se transpose pas par un simple écran. |
| **Try Dry** | Études de Dry January encourageantes, mais l’effet isolé de l’application n’est pas établi par ces cohortes. | Calendrier immédiatement lisible, objectifs et ressentis facultatifs. | Référence secondaire pour la lisibilité du calendrier. |
| **I Am Sober** | Fonctionnalités officielles documentées ; aucun essai randomisé d’efficacité propre au produit identifié dans cette recherche. | Heure d’arrêt, compteur, repères temporels, historique conservé. | **Référence principale pour une expérience simple, centrée sur l’arrêt.** |
| **Reframe** | Offre structurée et riche ; les taux promotionnels ne constituent pas un comparatif clinique contrôlé. Aucun essai randomisé publié propre au produit identifié ici. | Activités, outils, communauté et programme. | Conserver l’accès à ces fonctions dans Sobrizen sans surcharger l’accueil. |
| **Oz Ensemble / Option Zéro** | Dispositif français décrit par les institutions, articulant application et professionnels. Pas de résultat comparatif d’efficacité de l’application seule identifié dans les documents examinés. | Orientation vers un accompagnement adapté. | Référence contextuelle française, sans prétendre fournir son équipe de soins. |

Sources principales : [Drink Less, essai](https://eprints.whiterose.ac.uk/id/eprint/209532/), [A-CHESS, essai](https://jamanetwork.com/journals/jamapsychiatry/fullarticle/1847578), [Dry January, évaluation](https://www.drugsandalcohol.ie/32647/1/R-de-Visser-Dry-January-evaluation-2019.pdf), [I Am Sober, guide officiel](https://iamsober.com/en/site/faq), [Reframe, présentation officielle](https://www.reframeapp.com/), [Option Zéro, ARS](https://www.iledefrance.ars.sante.fr/option-zero-un-parcours-pour-redonner-aux-usagers-la-maitrise-sur-leur-consommation-dalcool).

## Lecture des résultats cliniques

### Drink Less : ampleur de l’étude, conclusion mesurée

Oldham et coll., *EClinicalMedicine*, 2024 : adultes britanniques, AUDIT ≥ 8, motivés pour réduire, recommandation de Drink Less contre une page de conseils du NHS. Le suivi à six mois atteint 79 % et 80 % dans les deux groupes. L’analyse principale préenregistrée donne −0,98 unité britannique par semaine, IC 95 % [−2,67 ; +0,70]. L’analyse préenregistrée par imputations multiples donne −2,00 unités, IC [−3,76 ; −0,24]. Cela ne démontre ni l’abstinence garantie ni une supériorité sur toutes les applications. Les unités britanniques ne doivent pas être affichées comme des verres standard français. [Publication originale](https://eprints.whiterose.ac.uk/id/eprint/209532/)

Une analyse des mécanismes du **même essai** retrouve une médiation partielle par le suivi de sa consommation ; elle ne détecte pas de médiation par les envies. Notre conséquence de conception est de privilégier la saisie et le retour compréhensible sur les données. Cette interprétation ne démontre pas que chaque composant isolé, ni son adaptation à Sobrizen, produit le résultat clinique. [Garnett et coll., *npj Digital Medicine*, 2024](https://pubmed.ncbi.nlm.nih.gov/38951560/)

### A-CHESS : un contexte clinique différent

Gustafson et coll., 2014 : 349 personnes sortant de soins résidentiels pour dépendance, soins habituels contre soins plus smartphone et A-CHESS. L’intervention dure huit mois, avec quatre mois supplémentaires de suivi. Les jours de consommation à risque rapportés sur les trente derniers jours sont en moyenne de 1,39 contre 2,75. L’abstinence déclarée aux trois évaluations concerne 51,9 % contre 39,6 % ; ce n’est pas une abstinence continue vérifiée pendant un an. L’étude est ouverte et repose sur des déclarations. [Essai original, *JAMA Psychiatry*](https://jamanetwork.com/journals/jamapsychiatry/fullarticle/1847578)

L’essai McKay et coll. (2022, 262 personnes après soins ambulatoires intensifs) retrouve moins de jours de forte consommation avec l’application pendant l’intervention ; le bénéfice ne persiste pas à dix-huit mois. Le dispositif actuel Connections est proposé via des organisations de soins. Ce contexte explique pourquoi il n’est pas retenu comme modèle autonome à reproduire à l’identique. [Essai, *Addiction*](https://onlinelibrary.wiley.com/doi/full/10.1111/add.15771) · [Accès officiel à Connections](https://www.chess.health/erecovery/connections-app/)

### Try Dry : distinguer application et campagne

L’évaluation de Dry January 2019 interroge 7 148 personnes au départ, 3 564 à un mois et 2 741 au dernier suivi. Les participants se sélectionnent eux-mêmes ; site, courriels et application interviennent ensemble. Les différences observées ne doivent donc pas devenir une promesse de réussite « deux fois supérieure » attribuée à l’application seule. [Rapport original, université du Sussex](https://www.drugsandalcohol.ie/32647/1/R-de-Visser-Dry-January-evaluation-2019.pdf)

Le guide officiel permet d’étudier séparément son ergonomie : calendrier, objectif, statistiques et ressentis facultatifs. Sobrizen adopte le calendrier explicite, mais une case vide conserve le statut « inconnu » et ne devient pas automatiquement une consommation ou un échec. [Guide officiel Try Dry](https://alcoholchange.org.uk/help-and-support/managing-your-drinking/dry-january/support/user-guide)

### Applications populaires et contexte français

I Am Sober documente le compteur à partir d’une date et d’une heure, les points quotidiens, les repères et la conservation des épisodes précédents. Ces fonctionnalités justifient un intérêt d’ergonomie ; elles ne suffisent pas à certifier une efficacité médicale. [FAQ officielle](https://iamsober.com/en/site/faq)

Reframe propose un programme et plusieurs espaces d’activités et de soutien. Les pourcentages présentés par l’éditeur n’ont pas été assimilés à des essais indépendants ni utilisés pour classer les applications. [Site officiel](https://www.reframeapp.com/)

L’ARS Île-de-France décrit en janvier 2026 Option Zéro comme un parcours articulant outil numérique et professionnels. Le projet Oz Ensemble avait été transféré en avril 2025. Une promesse de consultation ou de suivi humain ne peut être reprise par Sobrizen sans l’organisation correspondante. [ARS](https://www.iledefrance.ars.sante.fr/option-zero-un-parcours-pour-redonner-aux-usagers-la-maitrise-sur-leur-consommation-dalcool) · [Fiche institutionnelle Oz Ensemble](https://beta.gouv.fr/startups/ozensemble.html)

## Correspondance concrète dans Sobrizen

| Fonction de référence | Réalisation dans Sobrizen | Repère pour l’utilisateur |
|---|---|---|
| Objectif identifiable | Bouton permanent « Mon objectif » dans le nouvel accueil | « J’arrête, je réduis ou j’observe. » |
| Tableau de bord | Accueil centré sur la durée, les bienfaits documentés et le prochain repère | « Je vois ce que je construis. » |
| Saisie simple | Raccourci discret « Renseigner une journée » dans le calendrier : sans alcool/avec alcool, précisions facultatives | « Je complète quand je le souhaite. » |
| Calendrier | Sept derniers jours sur l’accueil ; mois complet dans « Mon suivi » | « J’ouvre la date que je veux comprendre ou corriger. » |
| Retour sur les données | Jours déclarés, périodes estimées et jours inconnus distincts ; bilans existants conservés | « Je comprends d’où vient le chiffre. » |
| Plans d’action | Type « plan » conservé dans le journal et plan de soutien conservé dans le profil | « Je retrouve mes outils dans leurs sections. » |
| Ressentis | Ressentis facultatifs et tendances dans Santé | « Je vois ce que j’ai réellement noté. » |
| Repères d’abstinence | Compteur depuis le dernier verre déclaré ; étapes de 1, 3, 7, 14, 30, 60, 90, 180 et 365 jours | « Je sais ce qui est parcouru et ce qui vient ensuite. » |
| Soutien disponible | Accès aux outils d’envie, respiration, jeux, mouvement et contacts existants | « Je retrouve un appui quand j’en ai besoin. » |

Les fenêtres scientifiques de l’espace Santé restent distinctes des jalons du compteur. Un jalon célèbre une durée déclarée ; il ne mesure pas une réparation d’organe ou un pourcentage de guérison. Une heure inconnue reste signalée. Un objectif de réduction ou d’observation ne devient pas un arrêt fictif.

## Règles d’intégrité de l’implémentation

- Le moteur de parcours existant reste la source des dates, consommations, périodes et économies. Le calendrier ne crée pas un deuxième historique.
- Une saisie est déclarée seulement après enregistrement effectif. L’accueil ne propose pas de liste de tâches, de plan à cocher ou de score de régularité.
- Aujourd’hui est une journée en cours. Les journées à venir et les dates antérieures au début du suivi ne sont pas présentées comme des journées à confirmer.
- Les déclarations explicites ont priorité sur les moyennes de période. Une consommation canonique se corrige dans son formulaire, sans être masquée par un bouton « sans alcool ».
- Une correction limitée à l’envie préserve les anciennes notes, humeur, énergie, sommeil et détails de boissons.
- Les écritures vérifient le compte et le consentement. Les corrections utilisent les anciennes valeurs comme garde contre l’écrasement d’une modification concurrente.
- Les dates du plan quotidien suivent le fuseau du parcours, comme le compteur et le calendrier.
- Les bilans, courbes selon l’abonnement, historique, journal, programme, santé, jeux, exercices et communauté restent disponibles.
- Le nouveau suivi quotidien fonctionne sans nouvelle dépendance de production ni migration des données.

Le ton affirme les faits enregistrés et encourage l’action : « ta journée est enregistrée », « chaque jour compte », « les journées déjà parcourues restent ». Il n’attribue pas à Sobrizen les résultats cliniques d’une autre application. Une reproduction d’interface ne constitue pas une validation thérapeutique.

## Autres publications examinées

- Garnett et coll., 2021 : amélioration de Drink Less par méthodes mixtes, notamment clarification du tableau de bord et du calendrier. [Article original](https://pmc.ncbi.nlm.nih.gov/articles/PMC8431211/)
- Gustafson et coll., 2024 : intervention Tula, trois niveaux de soutien, tous avec l’application ; ne permet pas d’isoler l’effet de l’application contre l’absence d’application. [Article original](https://www.nature.com/articles/s41746-024-01241-2)
- Hester et coll., 2011 : ModerateDrinking.com, essai de petite taille d’un programme web dans un contexte différent. [PubMed](https://pubmed.ncbi.nlm.nih.gov/21319896/)
- Hester et coll., 2016 : Overcoming Addictions et SMART Recovery ; pas de supériorité supplémentaire établie de l’outil sur SMART dans cet essai. [Article original](https://www.jmir.org/2016/10/e262/)
- Dossier réglementaire reSET : population et intervention ne correspondant pas à une application autonome d’arrêt de l’alcool. Aucune certification de ce dispositif ne s’applique à Sobrizen. [Dossier FDA](https://www.accessdata.fda.gov/cdrh_docs/reviews/DEN160018.pdf)

Les preuves ont guidé le choix du fonctionnement ; les vérifications logicielles du changement sont consignées séparément. Aucun résultat clinique propre à cette nouvelle version de Sobrizen n’a été mesuré.
