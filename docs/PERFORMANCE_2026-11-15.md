# Fluidité du suivi — 15 novembre 2026

Livraison préparée à partir de `475bdf1689822da3542fce846ceb8314226b3f45`, version Mon Plan et interface actualisée déjà publiées. Les correctifs sont isolés des autres modifications locales d’interface.

- La sélection d’un point du graphique et la navigation clavier mettent à jour le point et son panneau de détail, en conservant le SVG, le calendrier, les filtres, les brouillons et le focus.
- Les changements de période ou de mesure remplacent uniquement la carte du graphique et conservent les détails ouverts.
- Les lignes, résumés et compteurs partagent un contexte validé pour chaque calcul. Une nouvelle lecture prend en compte les corrections et le changement de jour ; aucun cache global de données sensibles n’est ajouté.
- Les formats de dates et montants sont réutilisés dans le suivi, l’accueil, les bilans, la santé et l’agenda. Les dates civiles conservent leur jour dans les différents fuseaux.
- Les régressions vérifient les consommations invalidant une horloge, les corrections de dépenses, la navigation au clavier et l’absence de reconstruction du graphique.

Le cache public passe à `sobrizen-v26-20261115-latency`. Les règles d’exclusion des API et réponses privées restent identiques. Aucun changement de facturation ou migration de base de données n’est nécessaire.

Validation de livraison : `npm run release:check`. Un balayage local avec moins de processus simultanés est disponible via `node scripts/audit-test-suite.mjs` ; il produit les résultats individuels dans `verification/latency`. Le script `node scripts/audit-latency.mjs corrected` vérifie les dix rubriques, le calendrier, les saisies quotidiennes, le journal et un graphique comportant 600 déclarations fictives. Il utilise Chrome et Playwright installé dans le projet parent, et bloque toute requête externe.

Ces tests de démonstration ne réalisent aucun paiement ni envoi de données utilisateur. Les durées observées dans le navigateur dépendent de la machine et ne remplacent pas les essais sur appareil physique.
