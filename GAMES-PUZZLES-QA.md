# Cinq nouveaux puzzles — publication du 27 octobre 2026

## Portée
Ajout des cinq jeux originaux Mosaïque Zen, Gemmes Zen, Couleurs Zen, Bulles Zen et Liens Zen au catalogue existant. Ils sont réservés à Premium. Les huit activités précédentes, leurs règles gratuites/Premium, l'authentification, les paiements et le suivi de santé restent inchangés.

L'entrée publique games.mjs conserve gamesView/initGames et délègue aux modules existants. Les nouveaux jeux utilisent un contrôleur de session isolé, des styles pz-, des records locaux et aucune requête réseau ni nouvelle dépendance. Ils ne promettent aucun traitement de l'addiction. Le service worker inclut les trois nouvelles ressources tout en conservant l'ensemble des ressources précédentes, notamment les mises à jour du suivi et de la santé.

## Vérifications avant publication
Le paquet préparé dans la conversation a été repris, ses fichiers et sa compatibilité avec l'entrée actuelle ont été vérifiés sur main, commit 2d67810410a773ab8f2cf3edd60718dc1b1ca3da.

- 20 tests Node des règles : 20 réussis, aucun échec. Reproductible avec node --test tests/games-puzzles.test.mjs.
- 140 cas d'affichage des cinq jeux sur 28 tailles de fenêtre dans Chromium : aucune erreur JavaScript, aucun échec du contrôle de disposition.
- 35 scénarios d'interaction dans Chromium : tous réussis, aucune erreur JavaScript. Démarrage, pause/reprise, aide, sortie, annulation, clavier, gestes tactiles, changement d'orientation, destruction de session et verrouillage Premium sont couverts.
- Les blobs des trois fichiers de production et du test ont été comparés aux empreintes Git calculées sur le paquet local testé.

Les scénarios navigateur utilisent un harnais local isolé avec des hooks de test non publiés. Ils ne constituent pas une recette complète avec un compte réel sur le domaine public. Safari/iPhone, les appareils physiques, les paiements et les notifications n'ont pas été testés dans cette publication. Aucun diagnostic de santé ni droit d'un compte réel n'a été modifié.

## Livraison et retour arrière
La publication passe par le dépôt Sobrizen/Sobrizen, branche main, et son intégration Vercel existante. L'état réel du déploiement doit être vérifié séparément dans le statut Vercel du commit ; ce document n'est pas une preuve de déploiement réussi.

Pour revenir aux huit jeux précédents, restaurer uniquement games.mjs en exportant gamesView/initGames de games-mobile.mjs et changer la version du cache. Ne pas restaurer globalement un ancien sw.js : conserver les ressources ajoutées par les autres fonctionnalités.
