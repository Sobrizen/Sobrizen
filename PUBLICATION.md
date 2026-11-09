# Build public et vérifications

## Installation reproductible

Node 24, puis `npm ci`. Les dépendances de QA sont épinglées et verrouillées : jsdom 30.1.3 et PGlite 0.5.16. Elles ne sont pas livrées au navigateur.

- `npm test` exécute la suite complète et configure les deux noms de variables historiques de jsdom et de PGlite. Une dépendance absente fait échouer cette commande avant le lancement des tests, au lieu de laisser certains harnais sauter silencieusement leurs assertions.
- `npm run test:agenda` exécute les 42 tests locaux de domaine, DOM et PostgreSQL de l’agenda.
- `npm run test:build` vérifie les transformations, la politique de ressources et un build réel en copie temporaire isolée.
- `npm run build` prépare uniquement `dist/`. Les sources `app.mjs`, `community.mjs`, `index.html`, `legal.html` et `sw.js` restent inchangées.

## Distribution explicite

`scripts/public-assets.mjs` contient la liste des fichiers publics. Aucun fichier source nouvellement ajouté n’est publié automatiquement. Le build assemble en mémoire les deux ponts historiques de communauté et de photos de profil, vérifie les références et la syntaxe JS, puis remplace le répertoire de sortie.

Le site comprend les pages publiques, leurs CSS, les modules client, les icônes, le manifeste, le service worker, le sitemap et le fichier robots. `billing/core.mjs` est un module public de constantes et de validation. Le gestionnaire `billing/handler.mjs`, les Edge Functions, scripts de développement, tests, fixtures, schémas SQL, documents internes, dépendances Node et fichiers de configuration ne font pas partie de la distribution.

Les ponts acceptent `initGames(...)` avec sa configuration et ne remplacent jamais le nom du cache décidé dans `sw.js`. Le cache de cette livraison est `sobrizen-v11-20261109-premium-agenda-1`. Les assets Agenda, records, modules de facturation publics et scripts externes des pages légales/abonnement en font partie. Les règles du service worker continuent d’exclure les requêtes d’API, les requêtes d’authentification et les réponses privées.

Vercel utilise `outputDirectory: "dist"` et `npm run build`. Les liens sans extension `/legal` et `/abonnement` sont cohérents avec `cleanUrls`. Les vérifications du build tiennent compte de ces liens, des importations relatives, des icônes du manifeste et des assets du service worker.

## Politique de sécurité du contenu

`vercel.json` envoie une CSP appliquée, et pas seulement un rapport :

| Type | Origines autorisées et justification |
| --- | --- |
| Scripts | Le site et `https://esm.sh`, utilisé pour le SDK Supabase épinglé. Aucun script en ligne, attribut d’événement en ligne ni `eval` autorisé. |
| Connexions | Le site, `esm.sh` et le seul projet Supabase de l’application en HTTPS/WSS. |
| Images | Le site, les URL `data:`/`blob:` de préparation d’images et le stockage du même projet Supabase. |
| Styles | Le site et les styles en ligne requis par les composants existants et leurs propriétés calculées. |
| Polices | Le site ; aucune police externe n’a été trouvée dans les sources. |
| Médias | Le site et les blobs locaux. |
| Worker et manifeste | Le site. |
| Cadres, objets | Interdits. Les pages ne peuvent pas être intégrées dans un cadre tiers. Le paiement utilise une redirection vers Stripe, sans iframe embarquée. |
| Formulaires, URL de base | Le site. |

L’interface d’abonnement et le bouton d’impression juridique utilisent des modules externes. Le build refuse la réintroduction de `<script>` en ligne, de gestionnaires HTML `onclick` et assimilés, d’importations non distribuées ou d’une clé secrète reconnaissable dans les fichiers publics. Ces contrôles complètent l’échappement et les validations applicatives ; ils ne remplacent pas une vérification en navigateur.

Les autres en-têtes conservent `nosniff`, la politique de référent `strict-origin-when-cross-origin`, l’interdiction de cadre, et les permissions caméra/microphone/géolocalisation désactivées. Les ressources sont revalidées avec `Cache-Control: no-cache`.

Références consultées : [configuration Vercel](https://vercel.com/docs/project-configuration), [CSP et en-têtes de sécurité Vercel](https://vercel.com/docs/cdn-security/security-headers).

## Recette avant publication

Les tests SQL créent des utilisateurs synthétiques dans une instance PostgreSQL locale PGlite. Aucune migration n’est effectuée par le build. Les migrations préparées et l’installation des fonctions serveur sont des étapes séparées.

Après génération de `dist`, ouvrir la prévisualisation avec les en-têtes HTTP de `vercel.json` réellement appliqués, contrôler les chargements du SDK, l’authentification, les images, les redirections d’abonnement, puis les vues mobile et sombre. Un serveur statique sans ces en-têtes ne vérifie pas l’effet réel de la CSP. Une page servie depuis la copie source ne vérifie pas l’exclusion des documents internes.
