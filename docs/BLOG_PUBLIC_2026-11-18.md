# Blog public et outils indépendants

Publication de quatorze articles et d’un index `/blog` sur `https://www.sobrizen.com`, après un premier lot de sept articles et un second lot ciblé. Les pages sont du HTML complet, lisible et navigable sans JavaScript. Le calendrier, le compteur, les calculateurs et les exercices utilisent uniquement deux petits modules locaux. Aucun SDK de l’application, appel réseau, stockage automatique, police externe, publicité ou script de suivi n’est ajouté à ces pages.

## Contenus et référencement

Les fichiers HTML sont générés depuis `scripts/generate-blog.mjs` et `scripts/blog-targeted-content.mjs` par `npm run blog:generate`, puis versionnés. Chaque page possède titre, description, URL canonique et métadonnées de partage spécifiques. Le balisage des articles et du fil d’Ariane utilise les microdonnées HTML `BlogPosting` et `BreadcrumbList`, sans script en ligne ni modification de CSP. Les liens internes relient les outils, les articles et l’application. Le sitemap inclut l’index et les quatorze articles. Aucune position ou indexation Google n’est garantie par cette publication.

Les sources sont indiquées dans les articles. Les contenus de santé distinguent résultats d’études, observations individuelles et limites. L’auteur est l’organisation « Rédaction Sobrizen ». La page de rédaction précise l’aide à la rédaction par IA et l’absence de relecture médicale revendiquée. Aucune donnée d’efficacité, qualification d’auteur, statistique de trafic ou approbation du Dry January n’est inventée.

## Outils

- Compteur : différence entre dates civiles, jour initial = 0 ; pas d’heure fictive, de mesure de santé ou de calcul des anciennes séries.
- Budget : différence entre deux budgets hebdomadaires ; projections explicites sur 7, 30 et 365 jours, virgules décimales acceptées et surcoût conservé.
- Calendrier : inconnu / sans alcool / avec alcool ; une date inconnue ne devient pas un zéro. Correction et changement de mois restent en mémoire dans la page, sans persistance après rechargement. Les dates futures restent vierges pour l’impression.
- PDF : calendrier réutilisable d’une page, généré avec `scripts/generate-blog-pdf.py` et ReportLab, puis rendu et contrôlé visuellement. Il fait partie des ressources explicitement publiées.
- Journal PDF : deux pages, semaine vierge puis exemple fictif et méthode, générées avec `scripts/generate-journal-pdf.py`. Les journées non renseignées ne sont pas assimilées à zéro. Le document est à imprimer, sans formulaire qui transmettrait des données.
- Verres standard : volume en cl × degré en % × 0,08 × nombre de portions = grammes d’alcool pur ; division par 10 pour l’unité française. Virgules et décimales acceptées, entrées invalides rejetées ; un résultat positif inférieur à 0,01 n’est pas affiché comme zéro. Aucun calcul d’alcoolémie ou d’autorisation de conduire.
- Fiche de soutien : situation, action et appui, texte échappé et téléchargement volontaire d’un fichier texte créé localement. Les champs restent désactivés sans JavaScript afin d’empêcher un envoi GET natif.

## Second lot ciblé

Journal de consommation, reprise après arrêt, envies de boire, refus d’un verre en soirée, verres standard, présentation de l’application et Noël sans alcool. Les liens « Pour continuer » sont choisis selon le sujet, y compris depuis les articles du premier lot. Ces choix éditoriaux ne sont pas présentés comme des volumes de recherche ou des scores de difficulté mesurés.

La page de présentation identifie Sobrizen comme son éditeur, donne les tarifs datés du 18 novembre 2026 et renvoie vers Mon Plan pour leur actualisation et la disponibilité annuelle. Les deux captures proviennent exclusivement du mode démo sur l’aperçu local, avec sa bannière visible et des données fictives. Elles sont chargées paresseusement sur cette seule page ; aucun écran d’un compte réel n’est publié.

La base de comparaison de ce second lot est `cad8bcc406e4db15fd471a03c3024f8ff8cd3431`, récupérée avant les modifications. Le contrôle d’isolation conserve 130 ressources de l’application et ajoute zéro octet à son entrée HTML. Les ressources du blog et le sitemap peuvent changer, sans modification du service worker ni des scripts de l’application.

## Isolation et contrôle

La base de comparaison est le commit de production `7fc86a416ffc89795cc406bb970f6b5fa41957c8`. `scripts/check-blog-isolation.mjs --capture --source ../release-blog-baseline` a enregistré les empreintes du build avant la modification. Après publication des ressources du blog, la comparaison conserve les 128 ressources existantes autres que l’entrée HTML et le sitemap. L’entrée HTML ajoute uniquement un lien de 45 octets sur la page d’accueil publique. Le nom du cache et la liste du service worker restent identiques. Aucun article ni outil n’est préchargé par l’application.

`npm run test:blog` vérifie calculs, dates impossibles, changements d’heure, années bissextiles, erreurs de formulaire, calendrier, absence de faux zéros, échappement de l’exercice, métadonnées, liens et budgets de taille. `npm run release:check` exécute la suite existante et le build public. Le contrôle en navigateur couvre les trois outils et le rendu à 390 px et sur bureau ; le serveur de recette applique les en-têtes de `vercel.json`.

Ne pas ajouter `/blog` à `sw.js`, ni importer ses styles ou modules dans `bootstrap.mjs` ou `app.mjs`. Toute future mesure de trafic doit respecter la séparation des données publiques et des champs des outils.
