# Blog public et outils indépendants

Publication de sept articles et d’un index `/blog` sur `https://www.sobrizen.com`. Les pages sont du HTML complet, lisible et navigable sans JavaScript. Le calendrier, le compteur, le calculateur de budget et l’exercice du soir utilisent uniquement deux petits modules locaux. Aucun SDK de l’application, appel réseau, stockage automatique, police externe, publicité ou script de suivi n’est ajouté à ces pages.

## Contenus et référencement

Les fichiers HTML sont générés depuis `scripts/generate-blog.mjs` par `npm run blog:generate`, puis versionnés. Chaque page possède titre, description, URL canonique et métadonnées de partage spécifiques. Le balisage des articles et du fil d’Ariane utilise les microdonnées HTML `BlogPosting` et `BreadcrumbList`, sans script en ligne ni modification de CSP. Les liens internes relient les outils, les articles et l’application. Le sitemap inclut l’index et les sept articles. Aucune position ou indexation Google n’est garantie par cette publication.

Les sources sont indiquées dans les articles. Les contenus de santé distinguent résultats d’études, observations individuelles et limites. L’auteur est l’organisation « Rédaction Sobrizen ». La page de rédaction précise l’aide à la rédaction par IA et l’absence de relecture médicale revendiquée. Aucune donnée d’efficacité, qualification d’auteur, statistique de trafic ou approbation du Dry January n’est inventée.

## Outils

- Compteur : différence entre dates civiles, jour initial = 0 ; pas d’heure fictive, de mesure de santé ou de calcul des anciennes séries.
- Budget : différence entre deux budgets hebdomadaires ; projections explicites sur 7, 30 et 365 jours, virgules décimales acceptées et surcoût conservé.
- Calendrier : inconnu / sans alcool / avec alcool ; une date inconnue ne devient pas un zéro. Correction et changement de mois restent en mémoire dans la page, sans persistance après rechargement. Les dates futures restent vierges pour l’impression.
- PDF : calendrier réutilisable d’une page, généré avec `scripts/generate-blog-pdf.py` et ReportLab, puis rendu et contrôlé visuellement. Il fait partie des ressources explicitement publiées.

## Isolation et contrôle

La base de comparaison est le commit de production `7fc86a416ffc89795cc406bb970f6b5fa41957c8`. `scripts/check-blog-isolation.mjs --capture --source ../release-blog-baseline` a enregistré les empreintes du build avant la modification. Après publication des ressources du blog, la comparaison conserve les 128 ressources existantes autres que l’entrée HTML et le sitemap. L’entrée HTML ajoute uniquement un lien de 45 octets sur la page d’accueil publique. Le nom du cache et la liste du service worker restent identiques. Aucun article ni outil n’est préchargé par l’application.

`npm run test:blog` vérifie calculs, dates impossibles, changements d’heure, années bissextiles, erreurs de formulaire, calendrier, absence de faux zéros, échappement de l’exercice, métadonnées, liens et budgets de taille. `npm run release:check` exécute la suite existante et le build public. Le contrôle en navigateur couvre les trois outils et le rendu à 390 px et sur bureau ; le serveur de recette applique les en-têtes de `vercel.json`.

Ne pas ajouter `/blog` à `sw.js`, ni importer ses styles ou modules dans `bootstrap.mjs` ou `app.mjs`. Toute future mesure de trafic doit respecter la séparation des données publiques et des champs des outils.
