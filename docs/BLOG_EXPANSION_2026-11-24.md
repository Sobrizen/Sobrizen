# Dix guides complémentaires, 24 novembre 2026

Le troisième lot porte le carnet public de 14 à 24 articles. Les dix nouvelles pages sont statiques, sans script supplémentaire, sans image nouvelle et sans import de l’application. Elles réutilisent le logo, la feuille de style et les outils publics existants. Le menu « Articles & conseils » continue de mener à l’index séparé dans un nouvel onglet.

## Choix des requêtes

Examen qualitatif des résultats de recherche le 24 novembre 2026. Aucun volume mensuel, score de difficulté ou indice Google Trends n’a été mesuré pour ce lot. Ces priorités sont des hypothèses fondées sur l’intention et la proximité avec le suivi Sobrizen, sans promesse de position ou de trafic.

| Page | Requêtes et intention | Séparation du contenu existant |
| --- | --- | --- |
| `fatigue-apres-arret-alcool` | fatigue arrêt alcool, plus fatigué après arrêt : décrire un ressenti | Pas de chronologie de bienfaits ni de délai de récupération garanti |
| `anxiete-lendemain-alcool-hangxiety` | anxiété lendemain alcool, hangxiety : comprendre les émotions | Distinct des envies de consommer et des effets physiques du lendemain |
| `alcool-sommeil-reveils-nocturnes` | alcool réveil 3 h, alcool sommeil réveils : observations de nuit | Distinct de l’organisation du rituel du soir ; aucune heure de réveil présentée comme diagnostic |
| `apres-dry-january-fevrier` | après Dry January, continuer sans alcool février : préparer la suite | Distinct du calendrier du défi de janvier ; source française publiée en octobre 2026 |
| `biere-sans-alcool-zero-etiquette` | bière sans alcool vraiment sans alcool, bière 0,0 : lire les mentions | Pas de sélection de marques ou de comparatif commercial |
| `aperitif-sans-alcool-recettes-faciles` | apéritif sans alcool facile, cocktail Noël sans alcool maison | Cinq propositions originales, portions et étapes, sans bouteille de substitut nécessaire |
| `alcool-cuisson-vin-chaud-flambage` | alcool cuisson, alcool vin chaud, flambage : comprendre la rétention | Données USDA de 2007 explicitement datées ; aucune teneur universelle attribuée au vin chaud |
| `calories-alcool-biere-vin-cocktails` | calories alcool, calories bière vin, alcool 7 kcal | Énergie de l’éthanol séparée du total nutritionnel ; aucun objectif de perte de poids |
| `gueule-de-bois-lendemain` | gueule de bois lendemain, durée gueule de bois : limites des astuces | Effets et idées reçues ; aucun dosage de médicament ni remède express |
| `conduire-lendemain-soiree-alcool` | conduire lendemain alcool, retour soirée : règles et organisation | Aucun calcul individuel d’alcoolémie ou d’heure de reprise de la conduite |

Les requêtes larges de santé et de nutrition sont concurrentielles. Les trois premiers sujets et l’après-Dry January sont les plus proches d’une intention de suivi. Les recettes et la cuisine complètent les pages de fêtes sans refaire le guide général Noël.

## Sources et méthode

Les sources figurent dans chaque page, avec des liens proches des faits principaux et une bibliographie. Ameli, Alcool Info Service, NHS, NIAAA, HSE, DGCCRF, Légifrance, Service Public et USDA sont utilisés pour les points correspondant à leur domaine. Les exemples de notes, de calculs et les recettes sont identifiés comme propositions ou exemples, sans témoignage inventé.

- La définition française de « bière sans alcool » à 1,2 % vol. inclus concerne cette catégorie. Aucun seuil universel distinct pour « 0,0 % » n’est inventé ; aucune absence absolue de traces n’est garantie.
- Les pourcentages USDA indiquent la part de l’alcool initial conservée, pas le degré du plat. Les facteurs sont arrondis et ne prédisent pas toute recette.
- La cohorte française de Rolland et coll. (2026, PMID 42492218) concerne 1 886 participants au défi 2024. Ses résultats déclaratifs observationnels ne sont pas attribués au futur défi 2027, ni traduits en pourcentages à partir de tailles d’effet.
- Les calories des exemples correspondent seulement à l’éthanol. Elles n’incluent pas automatiquement les sucres ou autres ingrédients.
- Les contenus ne revendiquent pas de relecture médicale et ne proposent pas de protocole de sevrage.

## Référencement et maintenance

Chaque nouvelle page possède titre, description, URL canonique, sommaire, FAQ et microdonnées BlogPosting/BreadcrumbList. Le générateur gère désormais la publication, la modification et la consultation des sources par article : les dates originales du 18 novembre restent conservées ; les nouvelles pages sont datées du 24 novembre. Les pages dont les liens de lecture changent reçoivent une date de modification distincte.

L’index place les articles récents en premier. Le sitemap conserve la date de chaque page et ne redonne pas artificiellement une nouvelle date à la racine de l’application. Les liens de lecture relient les nouveaux sujets aux anciens guides et aux calculateurs.

Sources éditoriales : `scripts/generate-blog.mjs`, `scripts/blog-targeted-content.mjs` et `scripts/blog-expansion-20261124.mjs`. Régénération explicite par `npm run blog:generate`, puis vérification du build et de l’allowlist. Ne pas importer ces sources dans les scripts de l’application ni ajouter le blog au précache du service worker.

La base d’isolation retenue pour ce lot doit être la dernière production `e25db02eb820fd8fd2f26490c17d4955f090722a`, et non l’ancienne réponse de branche mise en cache. La publication préserve les changements récents de suivi, d’activités et de chargement différé de cette production.
