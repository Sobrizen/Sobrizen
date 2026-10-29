# Sobrizen V4 — suivi par périodes

Frontend statique en français, sans build, hébergé sur Vercel. Backend Supabase existant. Aucun nouvel abonnement, API IA, service SMS ou service analytique requis.

## Fonctions
- Interface clinique moderne partagée par toutes les rubriques : blanc, bleu glacier, turquoise et sauge, navigation mobile, thèmes clair/sombre et texte agrandi.
- Onglets internes dans le suivi, la santé, le parcours et le profil : accès direct aux informations, formulaires et brouillons conservés lors d’un changement d’onglet.
- Journal de motivation : 150 citations sourcées d’auteurs, avec œuvre, repère et lien primaire, traductions signalées, rotation sans répétition avant épuisement et variété d’auteurs. Fermeture libre et enregistrement facultatif avec attribution dans le journal privé existant, sans doublons ni migration de base. Les anciennes pensées déjà gardées restent lisibles. Voir [la sélection et les sources](docs/motivation-sources.md).
- Onglet « Santé & bienfaits » : onze repères scientifiques des premières minutes aux premiers mois, datés selon l’arrêt effectif, sources et limites consultables, six ressentis privés facultatifs et évolution des observations réellement saisies.
- Bilan lisible : consommation, dépenses et économies sur 7 jours, 30 jours ou 12 mois, avec estimations identifiées.
- Formulaires en trois étapes, boutons + / −, raccourci zéro euro, récapitulatif avant sauvegarde et valeurs conservées au retour.
- Questionnaire initial : situation, date et heure facultative du dernier verre, anciennes habitudes, dépenses et objectifs.
- Saisie « Un jour » ou « Une période », du / au inclus, même dans le passé ; arrêts et reprises sans calendrier quotidien.
- Cumuls, séries, records datés et économies recalculés après correction, y compris avant l’inscription.
- Courbes sur 7 jours, 30 jours et 12 mois glissants, avec arrêts/reprises, estimations identifiées et données notées prioritaires.
- Aperçu du bilan avant sauvegarde, correction des dates et périodes passées, conservation des acquis et des objectifs.
- 30 étapes de réflexion à son rythme : contenus originaux, non validés comme traitement médical.
- Journal personnel (50 notes récentes à l’écran, export complet du texte) : image facultative privée, aperçu, remplacement, retrait et téléchargement. Choix « Garder pour moi » par défaut, ou copie relue et explicitement publiée dans la communauté depuis la note. Voir [le fonctionnement et le stockage](docs/journal-images-and-sharing.md). Plan de soutien et contact facultatif.
- Minuteur basé sur une échéance réelle, respiration et ancrage, ressources d'aide.
- Communauté paginée, commentaires, suppression de ses contenus, signalement manuel, masquage personnel. Badge compact à côté du pseudo : durée de l’arrêt en cours reprise automatiquement du suivi, visible avant confirmation du partage, conservée à la date de publication. Aucun chiffre à saisir et aucun badge si aucun arrêt n’est disponible.
- Récupération de mot de passe, renvoi de confirmation, export du suivi, rappel calendrier ICS.
- Thème clair/sombre, icônes PNG, installation PWA ; cache limité aux ressources publiques.

## Déploiement
Site statique : framework Other, commande de préparation `node scripts/integrate-community.mjs` définie dans `vercel.json`. Déploiement via le dépôt GitHub existant vers Vercel. La migration V4 `schema/20260928002847_create_journey_timelines.sql` ajoute un suivi privé par périodes, sans supprimer les tables ni les données antérieures. La migration `schema/20261020001318_support_retroactive_consumption_ranges.sql` accepte les tranches finies du document v2 et protège leur sauvegarde contre les anciens clients. Voir [PROGRESSION.md](PROGRESSION.md) pour les règles de calcul et la persistance atomique.

La migration `schema/journey_stop_clock.sql` ajoute la précision à la minute au document v3, sans convertir les anciennes dates en heures fictives. Voir [HEALTH.md](HEALTH.md) pour les onze étapes scientifiques, la gestion des reprises et le suivi des ressentis.

## Limites explicites
Pas de chatbot IA, pas de vidéos hébergées, pas de notifications push, pas de paiement, pas de sauvegarde automatique. La connexion et la sauvegarde du suivi nécessitent Internet. L'export personnel n'est pas chiffré. Les administrateurs Supabase disposent d'un accès technique ; ce n'est pas un chiffrement de bout en bout. Les signalements exigent une modération humaine. La suppression complète du compte et la documentation juridique doivent être finalisées avant commercialisation.

Les offres gratuites restent soumises aux quotas et conditions des hébergeurs. Vercel Hobby est limité aux usages personnels non commerciaux.

## Validation
Tests ciblés de l’interface : `node tests/section-navigation-dom.test.mjs`, `node tests/journal-motivation-dom.test.mjs`, `node tests/journal-notes-dom.test.mjs`, `node tests/community-journal-dom.test.mjs` et `node tests/community-duration-dom.test.mjs`, avec la dépendance de test jsdom indiquée dans `tests/ux-dom-support.mjs`. Calcul et badge : `node --test tests/community-tracking.test.mjs tests/community-duration-ui.test.mjs`. Les tests ne contactent aucun service réel et utilisent uniquement des données fictives.

Le chargement cohérent du suivi utilisé par la communauté est vérifié par `node tests/community-tracking-load.test.mjs`, y compris les réponses tardives, échecs et changements de session.

Les tests locaux peuvent valider le rendu et les interactions avec un backend simulé. Ils ne remplacent pas une recette réelle des emails, de l'installation iOS/Android et du cycle complet sur le domaine de production.
