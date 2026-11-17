# Audit du parcours client Sobrizen — 18 novembre 2026

Demande : compléter les fonctions usuelles d’une application, comparer avec I Am Sober, retrouver ses publications et recevoir les réactions/commentaires. Audit du code et du service existant, puis intégration sur la branche issue de `dc84918` pour préserver Mon Plan, les tarifs, l’administration, la marque et les améliorations récentes.

La comparaison s’appuie sur la [FAQ officielle I Am Sober](https://iamsober.com/en/site/faq) et sa [présentation des fonctions](https://iamsober.com/en/site/home), consultées le 17 novembre. Il s’agit des fonctions documentées, sans test de son application native. Les choix de Sobrizen restent adaptés à son suivi de l’alcool et à son installation web.

| Étape | Avant cet audit | Résultat |
|---|---|---|
| Inscription, consentement et confirmation d’email | Présents | Conservés ; aide au renvoi de confirmation et récupération déjà disponibles |
| Connexion, lien de récupération expiré | Présents | Conservés et retestés |
| Changer le mot de passe dans le compte | Aucun accès dans le profil | Formulaire dédié, ancien mot de passe vérifié dans une session isolée, confirmation, affichage/masquage et code de réauthentification si nécessaire |
| Changer l’email | Absent | Nouvelle adresse saisie deux fois, ancien mot de passe, liens de confirmation, adresse en attente affichée ; aucun nouveau compte créé |
| État de confirmation de l’email | Peu visible | Adresse de connexion et statut dans Connexion et sécurité |
| Autres appareils | Seulement une déconnexion locale | Déconnexion des autres appareils ou de tous les appareils ; retrait de leurs abonnements push ; délai d’expiration des jetons expliqué |
| Nom, pseudo, bio, photo | Présents | Conservés |
| Retrouver ses publications | Absent | « Mes publications » dans Trier par ; filtre propriétaire côté serveur avant pagination, compatible recherche/émotion/durée |
| Édition/suppression des posts, commentaires et signalements | Présents pour les posts ; suppression et signalement des commentaires | Conservés ; aucune publication ou modération réelle effectuée pour les tests |
| Notifications des réactions reçues | Absentes | Une alerte par membre et publication pour les « J’aime », une par nouveau commentaire ; exclusion des propres réactions et des membres masqués |
| Centre de notifications | Absent | Cloche, compteur exact, historique paginé, état lu/non lu, tout marquer comme lu, accès au post et aux commentaires, publication supprimée gérée |
| Préférences de notification | Absentes | Catégories « J’aime » et commentaires indépendantes, alertes système sur chaque appareil, accord explicite du navigateur |
| Application fermée | Pas de push | Web Push chiffré, service worker, file de livraison, reprise bornée des erreurs temporaires, suppression des appareils expirés, déclenchement au plus chaque minute si une livraison attend |
| Confidentialité sur l’écran verrouillé | Sans objet | Texte générique, sans pseudo, contenu, sobriété ni donnée du journal |
| Export | Suivi privé exporté | Export existant étendu aux propres posts, propres commentaires, réactions et notifications ; clés push exclues |
| Suppression du compte | Demande au support via Mon Plan | Accès et explication dans le profil ; demande suivie dans Mon Plan. Le traitement reste humain, sans promesse d’effacement instantané |
| Offre, factures, renouvellement et résiliation | Mon Plan présent | Conservés ; aucune modification de tarif, paiement ou abonnement pendant cet audit |
| Centre d’aide | Informations dispersées | FAQ intégrée, récupération de compte, transfert de téléphone, notifications, confidentialité, support, abonnement et suppression |
| Erreurs réseau et changements de compte | Garde-fous existants | Formulaires conservés après échec, mots de passe actuels vidés, réponses tardives ignorées et données de notification réinitialisées |
| Suivi, journal, statistiques, envies, étapes et agenda | Présents | Conservés et contrôlés par la suite globale |

## Comparaison et limites à garder explicites

I Am Sober documente notamment le changement d’adresse vérifiée, les sauvegardes, la communauté, les engagements quotidiens et des fonctions natives. Les manques de gestion de compte et d’activité communautaire relevés dans Sobrizen sont traités ici. Ses groupes privés, sa montre connectée, ses widgets, ses multiples addictions et son fonctionnement hors connexion relèvent d’évolutions distinctes ; cette livraison n’annonce pas une parité complète.

La sauvegarde Sobrizen demande Internet. Une application PWA n’est pas un binaire App Store/Google Play. Sur iOS/iPadOS, le push nécessite l’installation sur l’écran d’accueil et un accord depuis l’application installée. Les systèmes peuvent retarder une alerte ; la cloche conserve l’historique indépendamment du push. Les interactions antérieures à la migration ne créent pas rétroactivement d’alertes.

Les demandes d’effacement et la modération exigent une intervention humaine existante. La livraison réelle des emails de changement d’adresse, l’autorisation des notifications et la réception sur téléphone physique doivent être validées avec un compte de recette et les appareils concernés. Les tests automatisés n’envoient aucun email ni publication à de vrais membres.

## Vérification et exploitation

- Suite globale finale : 847 tests réussis, zéro échec, zéro test ignoré sur la version intégrée ; build public validé avec liste de ressources autorisées.
- Tests PostgreSQL : migrations réelles dans PGlite, droits anonymes, isolation entre trois comptes, préférences, masquage, dédoublonnage, export, suppression en cascade, validation d’URL push et réservation exclusive des livraisons.
- Tests DOM : changements email/mot de passe, erreurs et confirmation, masquage des mots de passe, historique et ouverture d’une notification, préférences, changement de session pendant un chargement, démonstration sans écriture.
- Tests d’envoi : destinations autorisées, texte discret, succès, erreur temporaire, appareil expiré et refus d’URL non autorisée, avec fournisseur simulé.
- Recette Chrome du build réel : 390 et 1280 pixels, formulaires de sécurité, ouverture/fermeture de l’historique, publication de démonstration retrouvée dans « Mes publications », aucune erreur JavaScript ni débordement horizontal. Les requêtes externes sont bloquées.
- Service Edge déployé : appel invalide refusé avec HTTP 401 ; appel interne autorisé retournant HTTP 200 et une file vide (`processed=0`, `sent=0`, `failed=0`). Aucune alerte n’a été envoyée à un membre pour ces contrôles.

Le service `sobrizen-notifications` vérifie son propre jeton de dispatch. Les secrets VAPID et de dispatch sont stockés dans Supabase Vault, sans fichier local ni code public. Les fonctions accessibles aux membres vérifient `auth.uid()` et ne permettent de gérer que leurs appareils. Les tables de livraison sont privées et leurs accès directs sont révoqués. Les avertissements de l’analyseur sur ces RPC `SECURITY DEFINER` sont intentionnels et couverts par les tests de propriété ; les autres tables privées restent fermées sans politique RLS autorisant un client.

L’analyse Supabase signale également la protection des mots de passe compromis désactivée et le schéma d’installation non déplaçable de `pg_net`. Le premier est un réglage Auth existant à activer avec une configuration administrateur adaptée ; les fonctions réseau de `pg_net` résident dans le schéma `net`, non exposé par l’API. Aucun réglage global Auth ou SMTP n’a été réécrit.

La construction ne réapplique pas les migrations. Les fichiers locaux portent les versions retournées par l’historique distant. Le planning `sobrizen-community-notifications` ne contacte le service que si une livraison est en attente et le push activé. Les doublons de tentative restent possibles après une interruption entre l’envoi et l’accusé de réception ; un identifiant de notification stable remplace la même alerte sur le navigateur.
