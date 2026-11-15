# Records personnels des jeux

## Intégration de l’application

```js
import {createGameRecords} from './game-records.mjs';
const gameRecords=createGameRecords({S,getClient,sessionContext,sameSession});
initGames({isPremium:()=>!!S.billing.premium,records:gameRecords,sessionContext,sameSession});
```

Appeler `gameRecords.load()` après le chargement du compte, même sans consentement au suivi sensible. Appeler `gameRecords.reset()` à chaque invalidation de session, déconnexion et entrée dans une nouvelle démo ; appeler `load()` une fois le nouvel état `S.user`/`S.demo` posé. `gamesView({premium})` conserve son API. Les cartes, HUD et résultats sont actualisés sur place via `subscribe()` ; aucune partie n’est reconstruite lors de la réception d’un record.

La fonction `isPremium` sert à autoriser l’ouverture et la poursuite des jeux Premium. `dataset.premium` n’est pas une source d’autorisation. L’événement existant `sobrizen-access-change` ferme une partie devenue non autorisée ou rattachée à une ancienne session. Les records eux-mêmes capturent aussi la génération de session.

Les parties terminées, fermées ou recommencées sauvegardent leur résultat. Les fins répétées et la fermeture après le résultat utilisent le même jeton. Une nouvelle partie reçoit un nouvel UUID. Annuler après une fin de partie ouvre une nouvelle tentative ; les maxima antérieurs restent conservés.

## Métriques

| Jeu | Record affiché |
| --- | --- |
| Snake | Plus grand nombre de fruits |
| Blocs | Meilleur score en points |
| 2048 | Meilleur score en points |
| Séquence | Plus grand nombre de suites correctement reproduites |
| Memory | Niveaux terminés sur quatre, paires ; meilleur temps des quatre niveaux complets, pauses exclues |
| Réflexe | Plus grand nombre de signaux réussis sur quinze ; meilleur délai d’un signal réussi |
| Cibles | Plus grand nombre de cibles dans une partie de vingt secondes |
| 5 choses | Nombre de séances dont les cinq étapes ont été parcourues, sans mesure de performance ou de santé |
| Mosaïque | Meilleur score et plus haut niveau atteint |
| Gemmes, Couleurs, Bulles, Liens | Plus haut niveau terminé et meilleur score d’un plateau |
| SémantiZen | Plus petit nombre d’essais pour un mot trouvé sans indice |
| Labyrinthe | Meilleur score en points et meilleur niveau atteint |
| Solitaire | Plus petit nombre d’actions pour une victoire complète ; aides autorisées et annulations comptées |

Les maxima et minima sont agrégés indépendamment : le meilleur temps de réaction peut provenir d’une autre partie que le meilleur nombre de signaux. Les scores sont déclarés par les contrôleurs du client et restent privés. Il ne s’agit pas d’un classement ou d’un système de vérification anti-triche.

## Persistance et isolation

`game-records.sql` prépare deux tables. Après les migrations additives SémantiZen et arcade, `game_records` conserve au maximum seize lignes par compte, une par jeu. `game_record_completions` ne conserve que le propriétaire, un UUID et une date par séance de « 5 choses » terminée. Ces reçus rendent le compteur idempotent, même après une réponse perdue et un nouvel essai. Aucun historique détaillé des coups n’est conservé. Les deux tables sont supprimées en cascade avec le compte.

Le RPC `save_game_record(p_game_id,p_score,p_level,p_time_ms,p_completed,p_run_id,p_expected_user_id)` est `SECURITY INVOKER`. Les politiques RLS restreignent lecture et écriture au propriétaire. Une seconde vérification compare `auth.uid()` au compte attendu, ce qui empêche qu’une requête préparée pour un compte soit attribuée au compte qui vient de le remplacer. Les trois jeux gratuits peuvent enregistrer leurs résultats sans Premium ; les dix autres vérifient `public.sobrizen_has_premium()` côté SQL, y compris par leurs politiques d’écriture.

L’UPSERT utilise `GREATEST` pour les scores/niveaux et `LEAST` pour les temps. Un trigger interdit le changement de propriétaire ou de jeu et protège également les valeurs contre une mise à jour directe qui tenterait de les diminuer. Les entrées sont bornées et validées. Il n’y a pas de droit DELETE du client. Le serveur peut administrer et effacer les données.

Les résultats non synchronisés sont conservés en mémoire, avec un message et un bouton de nouvel essai. L’événement `online` retente la synchronisation. Une déconnexion efface cette file : il faut réessayer avant de quitter l’espace si l’enregistrement a échoué. Aucun résultat anonyme ancien (`sobrizen-record-*`, `sobrizen-game-score`) n’est importé. La démo utilise uniquement la mémoire de sa propre session et n’appelle jamais le service de données.

Le SQL est fourni pour la migration de la release. La CLI Supabase n’était pas installée dans l’environnement de préparation ; aucune migration distante n’a été exécutée par les tests des jeux.

## Vérification

Les dépendances de test sont `jsdom@30.1.3` et `@electric-sql/pglite@0.5.16`. PGlite exécute PostgreSQL en mémoire ; il vérifie les rôles, privilèges, RLS, contraintes et fonctions du SQL préparé, avec un schéma `auth` de test. Il ne prouve pas la configuration du projet Supabase déployé.

```sh
node --test tests/game-records.test.mjs tests/game-records-sql.test.mjs tests/games-records-dom.test.mjs
node --test games.test.mjs tests/games-mobile.test.mjs tests/games-brain.test.mjs tests/games-puzzles.test.mjs
```

Si les dépendances sont installées hors du dépôt, `SOBRIZEN_PGLITE_PATH` désigne le paquet PGlite et `SOBRIZEN_QA_JSDOM` le fichier `jsdom/lib/api.js`. La suite ne masque pas une dépendance manquante par un test ignoré.

Les scénarios DOM couvrent les seize affichages, les quatre niveaux de Memory, une résolution complète de Couleurs et Liens, les transitions de Séquence, la mutation trompeuse de `dataset.premium` et le changement de session/droit. Les tests arcade vérifient plusieurs changements de niveau sans duplication du scheduler, pause/reprise, dessin uniquement aux pas de jeu, clavier du Solitaire, focus et annonces, victoire complète et fermeture sans fausse victoire. Le canvas et le temps sont simulés : le rendu tactile et les thèmes doivent être vérifiés dans un navigateur réel.

## Labyrinthe et Solitaire

La migration `20261114232941_arcade_private_records.sql`, générée avec le CLI, ajoute les deux identifiants et leurs contraintes ; elle conserve les données et les policies existantes. Son SQL est également conservé dans `db/arcade-records.sql` pour les vérifications isolées. Elle doit être appliquée avant de publier le client utilisant les nouveaux records.

- **Labyrinthe** : meilleur score en points et meilleur niveau atteint, sauvegardés à la fin ou à la fermeture d’une partie ayant marqué des points. La pause ne déclare pas une victoire et ne termine pas la partie.
- **Solitaire** : une victoire n’est enregistrée qu’une fois les 52 cartes aux fondations. Le score interne `1 000 000 − nombre d’actions` permet de conserver le plus petit nombre d’actions avec la règle monotone existante. Chaque déplacement, pioche, recyclage de la pioche et annulation compte ; l’annulation ne réduit jamais ce compteur. Les indices et la fondation automatique sont autorisés et annoncés dans les règles ainsi que le libellé du record. Une partie inachevée ou quittée ne crée aucun record de victoire.

Ces résultats restent déclarés par le client, privés et sans classement public. Une erreur réseau laisse un résultat non synchronisé et la commande de nouvel essai existante ; les changements de session le retirent de la mémoire sans l’affecter au compte suivant.

Références de conception consultées le 9 novembre 2026 :

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — fonctions et privilèges](https://supabase.com/docs/guides/database/functions)
- [Supabase — exposition explicite des nouvelles tables](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [PostgreSQL — UPSERT atomique](https://www.postgresql.org/docs/current/sql-insert.html)
