# Sobrizen — un suivi Santé plus affirmé et encourageant

Date : 27 octobre 2026. Base : `9315ec740178f64b3ddca1faf16a351e8f3a2a81`.

## Comportement livré

Le suivi distingue trois éléments simples : le temps déclaré depuis le dernier verre, les évolutions réellement renseignées et les bénéfices observés par la recherche. Le ton est direct et chaleureux. Les textes affirment les résultats des études dans leur population et leur contexte de soins ; ils n’attribuent pas ces résultats à une personne sur la seule base de son compteur.

- Le héros met en valeur le départ, le cap actuel et le prochain repère. Les célébrations utilisent une durée exacte : 4 semaines pour le seuil de 28 jours, puis 90, 180 et 365 jours. Les fenêtres scientifiques conservent leurs libellés usuels.
- Une animation courte accompagne la première présentation d’un cap réellement atteint pendant la session. Explorer un palier futur, actualiser le compteur ou revenir sur Santé ne rejoue pas le même cap. Un bouton permet de le célébrer volontairement.
- Les cartes de progrès mettent d’abord en avant l’humeur, l’anxiété et la concentration lorsqu’une amélioration est renseignée. Chaque carte ouvre la courbe correspondante, avec le focus clavier sur son titre.
- Les moyennes portent sur les 7 derniers jours et les 7 précédents, avec au moins 2 observations dans chaque période. Une saisie absente n’est jamais remplacée par zéro. Les difficultés restent visibles, même lorsqu’un autre indicateur s’améliore.
- Les anciennes notes d’envie, lorsqu’elles existent, gardent leur échelle de 0 à 10 et leur place distincte des six ressentis de santé. Le zéro reste une vraie réponse. Aucune amélioration n’est déduite d’un exercice commencé ou terminé.
- Le bloc « Plus de liberté face aux envies » propose quatre stratégies du NIAAA et donne accès aux outils existants de pause et de soutien. Aucune durée fixe de disparition d’une envie n’est annoncée.
- Une confirmation chaleureuse apparaît seulement après une sauvegarde confirmée. Les erreurs et conflits conservent les réponses dans le formulaire.
- Lors d’un changement automatique de jour ou de cap, le focus et l’ouverture des détails sont préservés. Les mises à jour ordinaires des minutes ne reconstruisent pas l’écran.

## Présentation et accessibilité

Les nouveaux composants reprennent les surfaces sobres et les couleurs de Sobrizen. Les cartes sont de vrais boutons ou liens, avec une hiérarchie de lecture et des états de focus explicites. Les dispositions se replient sur les petites largeurs. Les animations sont finies et désactivées avec la préférence de réduction des mouvements. Les illustrations décoratives ne sont pas annoncées comme des indicateurs médicaux.

Les raccourcis du suivi sont « Mon arrêt », « Mes progrès », « Mes envies », « Les bienfaits » et « Mes ressentis ». Les formulaires, l’heure exacte du dernier verre, les onze fenêtres scientifiques, les sources et toutes les fonctionnalités existantes sont conservés.

## Recherche et confidentialité

Le catalogue contient 17 sources : les 15 références existantes et deux ressources institutionnelles NIAAA vérifiées le 27 octobre 2026. Chaque référence affiche sa date de vérification, la population étudiée et ses limites.

- https://rethinkingdrinking.niaaa.nih.gov/tools/worksheets-more/how-stop-alcohol-cravings
- https://www.niaaa.nih.gov/health-professionals-communities/core-resource-on-alcohol/support-recovery-its-marathon-not-sprint

Les résultats sur l’anxiété, l’humeur, le sommeil et les capacités cognitives restent contextualisés : soins concomitants, suivis de groupe et rythmes différents. Les messages de sécurité du sevrage et de santé mentale sont conservés intégralement. Sobrizen ne se présente pas comme un dispositif cliniquement certifié.

Les vues privées restent soumises au consentement et à la fin du chargement des données. Le retrait du consentement supprime ces vues. Les clés de célébration restent uniquement en mémoire ; aucun historique sensible supplémentaire n’est stocké dans le navigateur. Aucune migration de base de données, dépendance de production ou prestation externe n’a été ajoutée.

## Vérification

Les scénarios ciblés couvrent les données vides, les progrès et difficultés simultanés, les envies à zéro, les sauvegardes échouées puis confirmées, les courbes accessibles, les paliers actuels et futurs, le maintien du focus, les détails ouverts, la réduction des animations et les frontières de consentement. Ils utilisent les vrais modules clients avec un service et une horloge simulés.

Commande de la suite complète :

```sh
SOBRIZEN_JSDOM_PATH=/tmp/sobrizen-audit-qa/node_modules/jsdom node --test tests/*.test.mjs games.test.mjs
```

Résultat final par exécution directe : **15 fichiers exécutés individuellement avec succès**, plus les deux suites DOM exécutées chacune en cinq groupes indépendants. Les **17 fichiers sont ainsi couverts**. Les groupes UX confirment 45/45 scénarios ; ceux du nouveau suivi Santé confirment 21/21 scénarios. Les autres fichiers comprennent notamment 16 tests unitaires d’encouragement, 6 contrôles de contenu, 10 scénarios Mouvement et 15 scénarios Abonnement.

Un contrôle final a détecté une particularité de cet environnement : `spawnSync` peut renvoyer une erreur `EPERM` avec un statut nul et une sortie vide. Les deux lanceurs de groupes rejettent désormais une erreur de lancement, un statut non nul ou l’absence de marqueur de fin attestant le nombre positif de scénarios réussis. Le lancement global imbriqué échoue donc honnêtement ici ; les résultats ci-dessus viennent des commandes directes, et non du premier « 17/17 » trompeur. Pour les groupes :

```sh
for group in demo without-consent member premium races; do
  node tests/ux-dom.test.mjs --group="$group" || exit 1
done
for group in empty mixed craving motion without-consent; do
  node tests/health-encouragement-dom.test.mjs --group="$group" || exit 1
done
```

Les autres fichiers sont lancés directement avec `node chemin/du/fichier.test.mjs`, en fournissant le chemin jsdom pour le test Mouvement.

Les contrôles DOM ne mesurent pas le rendu réel ni l’accessibilité complète. La vérification visuelle de la version déployée se fait séparément dans Chrome, sur les données fictives de démonstration. Aucun compte personnel, dossier de santé réel, paiement, appel ou publication communautaire n’est utilisé pour cette validation. Il n’y a pas de validation sur un téléphone physique ou dans Safari.

Le cache applicatif passe à `sobrizen-v4-20261027-encouragement-1` et inclut le nouveau module. Les réponses de ce module portent la même politique de revalidation que les autres fichiers du suivi.
