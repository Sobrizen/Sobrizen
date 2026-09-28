# Sobrizen V4 — suivi par périodes

Frontend statique en français, sans build, hébergé sur Vercel. Backend Supabase existant. Aucun nouvel abonnement, API IA, service SMS ou service analytique requis.

## Fonctions
- Questionnaire initial : situation, date d’arrêt ou de changement de rythme, anciennes habitudes, dépenses et objectifs.
- Suivi par périodes déclarées, sans calendrier quotidien ; consommations ponctuelles et changements de rythme en quelques champs.
- Cumuls, séries, records datés et économies recalculés après correction, y compris avant l’inscription.
- Courbes sur 7 jours, 30 jours et 12 mois glissants, avec arrêts/reprises, estimations identifiées et données notées prioritaires.
- Paramètres du parcours, correction des périodes passées, conservation de l’historique et des objectifs.
- 30 étapes de réflexion à son rythme : contenus originaux, non validés comme traitement médical.
- Journal privé (50 notes récentes à l'écran, export complet), plan de soutien et contact facultatif.
- Minuteur basé sur une échéance réelle, respiration et ancrage, ressources d'aide.
- Communauté paginée, commentaires, suppression de ses contenus, signalement manuel, masquage personnel.
- Récupération de mot de passe, renvoi de confirmation, export du suivi, rappel calendrier ICS.
- Thème clair/sombre, icônes PNG, installation PWA ; cache limité aux ressources publiques.

## Déploiement
Site statique : framework Other, aucune build command. Déploiement via le dépôt GitHub existant vers Vercel. La migration V4 `schema/20260928002847_create_journey_timelines.sql` ajoute un suivi privé par périodes, sans supprimer les tables ni les données antérieures. Voir [PROGRESSION.md](PROGRESSION.md) pour les règles de calcul et la persistance atomique.

## Limites explicites
Pas de chatbot IA, pas de vidéos hébergées, pas de notifications push, pas de paiement, pas de sauvegarde automatique. La connexion et la sauvegarde du suivi nécessitent Internet. L'export personnel n'est pas chiffré. Les administrateurs Supabase disposent d'un accès technique ; ce n'est pas un chiffrement de bout en bout. Les signalements exigent une modération humaine. La suppression complète du compte et la documentation juridique doivent être finalisées avant commercialisation.

Les offres gratuites restent soumises aux quotas et conditions des hébergeurs. Vercel Hobby est limité aux usages personnels non commerciaux.

## Validation
Les tests locaux peuvent valider le rendu et les interactions avec un backend simulé. Ils ne remplacent pas une recette réelle des emails, de l'installation iOS/Android et du cycle complet sur le domaine de production.
