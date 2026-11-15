# SOBRIZEN — revue du code et amélioration de l’expérience

Date : 15 novembre 2026. Base examinée : `63c43bee9a6c7e26641b925281b2d5b160b569b8`.

Cette livraison porte sur l’application de production dans ce dépôt : interface web/PWA, modules métier, jeux, journal, sessions et construction du site. Le prototype Expo du dossier parent n’est pas le site actuellement publié. Les instructions Expo v57 ont été consultées avant les modifications.

Il s’agit d’une revue technique étendue avec corrections et tests de régression. Ce document distingue les contrôles effectués de ce qui reste à prouver ; il ne certifie pas une relecture manuelle exhaustive de chaque ligne, l’absence de toute faille ou une fluidité parfaite sur tous les appareils. Les textes et décisions juridiques restent à la charge du propriétaire.

## Corrections réalisées

| Domaine | Défaut constaté | Correction |
|---|---|---|
| Isolation des comptes | Une pause pouvait conserver intensité, outil et identifiant du compte précédent, même avec deux comptes consentants. | Purge dans l’invalidation de session et arrêt de l’horloge. Test A → B. |
| Récupération de compte | Une récupération vers B pouvait mettre à jour le mot de passe de B tout en affichant l’espace de A. | Purge immédiate de l’ancien espace, adoption du bon compte, chargement différé hors du callback Auth, rejet des événements périmés. |
| Récupération et brouillon | Un dialogue de récupération pouvait lever une erreur en essayant de remplacer une note non enregistrée. | Brouillon conservé, explication visible, ouverture après sa fermeture autorisée et uniquement pour la même session. |
| Ressenti après une pause | Une réponse lente pouvait invalider un formulaire rouvert pour la même pause. | État de sauvegarde explicite, prévention des doubles envois, intensité/UUID conservés, réessai après erreur, aide toujours accessible. |
| Images communautaires | Une URL signée arrivant tard pouvait remplacer un nouveau dialogue ou brouillon. | Vérification de la génération du dialogue, de la page et du dernier clic avant affichage. |
| Images de profil | Décodages remplacés encore actifs, cache sans borne et anciennes images de démo retenues. | Annulation des décodages, libération des URL Blob, cache LRU de 64 entrées, refus des erreurs d’anciens chargements. |
| Journal | Fermeture/remplacement pouvant perdre un brouillon et suppression fondée sur une version périmée. | Confirmation intégrée, protection pendant l’écriture/traitement d’image et suppression conditionnée à `updated_at`. |
| Jeux | Certains contrôles restaient actifs sous la pause et des écouteurs survivaient au changement de niveau. | Plateau inerte, focus de reprise, refus de reprise dans un onglet caché, nettoyage des écouteurs et animations. |
| Bouger | Boucle d’animation encore active quand le geste et le minuteur étaient arrêtés ; mêmes textes réécrits à chaque image. | Aucune RAF au repos, arrêt caché/flou, reprise explicite, SVG borné à environ 30 mises à jour/s, mutations seulement si nécessaires. |
| Rapports | « 0 € d’économies » pouvait être affiché sans information suffisante. | Valeur indisponible distincte d’un zéro déclaré ; couverture quantité/dépense séparée. |
| Agenda | Une absence de données pendant chargement/erreur pouvait devenir un faux compteur à zéro. | États distincts et compteurs affichés uniquement lorsque les données sont disponibles. |
| Mise à jour PWA | Des URL identiques dans le précache pouvaient faire échouer son installation. | Déduplication et validation des URL par le build, y compris leurs formes normalisées. |
| Construction | Une expression régulière prenait un attribut HTML `from` dans un template pour un import JavaScript. | Analyse réelle par Acorn, version exacte en dépendance de développement ; import calculé non vérifiable refusé. |
| Gestion d’abonnement | Une transformation HTML pouvait retirer la section du compte si son point de réinsertion disparaissait. | Vérification d’unicité et arrêt du build en cas d’ancre absente/ambiguë. |

## Fonctionnalités et ergonomie

- Journal : catégories, dates inclusives, ordre global avant pagination, recherche littérale sécurisée et états vides/erreurs/réessais. Le parcours courant garde sa requête paginée ; les filtres avancés sont bornés à une page de 20 notes plus un témoin de suite.
- Suivi : navigation entre bilans de 7 jours, 30 jours et 12 mois, retour à la période actuelle, indication des journées closes connues et de la journée en cours.
- Accueil : accès direct au point du jour, à une note et à une pause ; proposition d’installation déplacée après l’essentiel.
- Jeux : commandes et rythme mieux expliqués, clavier amélioré pour Séquence/Couleurs/Mosaïque, pause et reprise cohérentes entre contrôleurs.
- Aide : pause/reprise du minuteur, progression accessible et horloge à 1 Hz uniquement lorsque son écran est ouvert et visible. Le temps écoulé reste calculé à partir de l’heure réelle.
- Design : navigation, cartes, formulaires, dialogues et barre mobile harmonisés avec les couleurs existantes. Animations d’opacité/translation de 130 à 160 ms sur ouverture/changement de page, sans boucle supplémentaire. Préférence de mouvement réduit respectée et animations annulées quand l’onglet est caché.
- Accessibilité : messages d’attente associés aux formulaires, focus à l’entrée du compte, protections du brouillon utilisables au clavier, absence de défilement forcé lors d’un simple rafraîchissement des données.

## Couverture de la revue

Lecture manuelle ciblée et croisée des flux dans `app.mjs`, `bootstrap.mjs`, les modules journal, agenda, daily, health, progress/programme, timeline/rapports, communauté, photos, jeux, ergonomie et construction. Les fichiers effectivement examinés pour la dernière revue client sont détaillés dans `artifacts/final-client-review.json` du dossier de travail parent. Les transformations de publication ont été examinées avec le code source ; les anciens contrôleurs remplacés au build ne sont pas assimilés au code effectif livré.

Tous les JavaScript publics sont analysés syntaxiquement lors du build, avec vérification des imports, de la liste de publication, de la CSP et du précache. Le scan de secrets couvre les fichiers suivis et nouveaux non ignorés. Ces contrôles automatiques ne constituent pas une preuve d’inspection manuelle de chaque ligne.

Les permissions du chemin avancé du journal ont été confirmées en production par métadonnées uniquement : RLS activée, SELECT `authenticated` et refus `anon`, politique propriétaire combinée à la politique restrictive de consentement. Aucune note réelle n’a été lue pour ce contrôle. Aucune migration n’est requise par cette livraison.

## Vérification

Validation générale : `npm run release:check` réussi, **764/764 tests**, aucun échec, aucun test annulé ou ignoré. Build : **118 fichiers publics, 7 998 774 octets** (modèle sémantique inclus, chargé à la demande). Résultats et empreintes SHA-256 consignés dans `verification/2026-11-15-experience/release-check.json`. Scan de secrets : aucun résultat. Audit npm effectué après l’ajout d’Acorn : aucune vulnérabilité connue signalée.

Essais navigateur sur le build public : accueil, navigation mobile, création/enregistrement d’une note fictive, protection du brouillon, filtre de catégorie, changement de période du bilan, ouverture/pause/sortie de Snake Zen et pause/reprise du minuteur. Largeurs contrôlées : 320, 390, 768 et 1280 px, sans débordement horizontal constaté sur les parcours mesurés. Thèmes clair et sombre inspectés. Console sans erreur constatée pendant ces essais. Données de démo seulement, aucun envoi de données utilisateur.

La dépendance Acorn reste réservée au build : aucune nouvelle bibliothèque chargée par les clients. Le modèle sémantique reste chargé à la demande, en dehors du précache général.

## Facturation et limites restantes

Le précédent audit a examiné le handler effectif, les signatures, droits serveur, idempotence et reprises Checkout, avec 148 tests ciblés simulant Stripe/Auth. Des contrôles HTTP réels ont vérifié refus anonymes, CORS, webhook sans signature, santé et `no-store`. La politique sans nouvel essai a déjà été déployée ; l’essai historique existant a été préservé. Cette livraison ne change pas les prix ni les droits Premium.

Un paiement complet authentifié, un débit réel, un renouvellement, un remboursement et l’arrivée d’un virement bancaire ne sont pas prouvés par ces tests. Le statut bancaire/KYC et les capacités de versement ne sont pas certifiés ici. Les parcours email réels, la restauration d’une sauvegarde, un test de charge et une recherche d’intrusion exhaustive restent à valider. La recette sur un vrai Android/iPhone et la migration du cache déjà installé restent nécessaires pour conclure sur ces appareils.

Les CLI historiques des bridges réécrivent les sources et restent hors du parcours recommandé. Utiliser `npm run release:check`, qui teste puis construit le résultat en mémoire et publie uniquement la liste autorisée.

Référence Auth vérifiée : [documentation Supabase onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange). Référence précache : [MDN Cache.addAll](https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll).
