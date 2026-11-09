# SobriZen Premium — préparation du lancement du 9 novembre 2026

**Les ventes restent fermées tant que les prérequis réels ne sont pas confirmés.** Le code, les tarifs Stripe et le service de facturation ont été préparés pour l’offre officielle. Une clé configurée, un compteur à 100 ou un test automatisé réussi ne constituent pas une preuve de paiement réel ni une validation juridique.

## Offre officielle et objets Stripe

Compte SOBRIZEN vérifié par le connecteur : `acct_1ULRv6B6h4U0FlMo`. Produit commun : `prod_VMAu4k8wMdvkAu`.

| Offre | Prix récurrent | Objet Stripe en mode réel |
|---|---:|---|
| Mensuel | 2,99 €/mois | `price_1UZzodB6h4U0FlMoqyWxNKjy` |
| Annuel | 29,99 €/an | `price_1ULSYDB6h4U0FlMoAnD7zybM` |
| Annuel de lancement | 19,99 €/an | `price_1UZzojB6h4U0FlMos31G0H6E` |

Les deux nouveaux prix ont été créés et leurs montants, périodicités, devise EUR, mode réel et produit ont été contrôlés. Le prix annuel existant est conservé. Aucun abonnement ni paiement client n’a été créé pour ces vérifications.

Chaque première souscription éligible reçoit un essai de **7 jours**. Le moyen de paiement est collecté par Stripe ; l’abonnement commence à être facturé à la fin de l’essai si la reconduction reste active. Un compte ayant déjà eu un abonnement n’obtient pas un second essai. Le serveur exige une acceptation de la version `2026-11-09`, un plan connu, le montant attendu et l’éligibilité affichée à l’utilisateur ; il ne choisit pas une offre plus chère à sa place.

Le tarif de lancement est un véritable prix récurrent à 1 999 centimes, conservé à chaque renouvellement de cet abonnement. Il ne s’agit pas d’une remise limitée à la première facture. Une résiliation effective met fin à sa garantie. Le portail ne permet pas de modifier arbitrairement le prix ou la quantité.

La franchise en base de TVA, déjà confirmée pour ce projet, reste configurée : Stripe Tax automatique désactivé et mention « TVA non applicable, article 293 B du CGI » sur les factures des nouveaux clients. Les prix sont définis comme montants finaux. Un changement de régime fiscal exige une nouvelle revue.

## Réservation des 100 places

`billing_checkout_attempts` contient les réservations et allocations de lancement. `billing_launch_pool` fournit le verrou SQL commun à toutes les allocations. La réservation et le contrôle de capacité sont atomiques ; la 101e allocation est refusée.

- La réservation dure au plus une heure sur Checkout. Le compteur déduit les réservations et les souscriptions de lancement confirmées.
- Un simple dépassement de l’heure locale ne libère jamais une place. Stripe doit confirmer que la session est expirée. Les événements signés et une réconciliation bornée assurent ce suivi.
- La confirmation de la souscription, y compris un essai, attribue définitivement la place. Une résiliation ou la suppression du compte ne réinitialise pas le compteur.
- L’identifiant de tentative fixe sert de clé d’idempotence. Un double clic réutilise la session en cours. Un résultat réseau incertain ne permet pas d’en créer une seconde.
- Une tentative ambiguë devenue trop ancienne reste réservée et signale `CHECKOUT_RECOVERY_REQUIRED`. Le support doit réconcilier sa session Stripe avant de la libérer. Ne pas la libérer sur une supposition.
- Une disponibilité inconnue reste inconnue : aucun nombre « 100 » n’est fabriqué côté client.

## Code serveur et déploiement

Le serveur complet est versionné : `billing/core.mjs`, `billing/handler.mjs` et `supabase/functions/sobrizen-billing/index.ts`. Le SDK Stripe est épinglé à **23.1.0**, les requêtes serveur à l’API **2026-10-28.endive**. Le code serveur et les migrations ne sont pas copiés dans `dist/`.

Le service `sobrizen-billing` a été déployé en **version 12** le 9 novembre. Son endpoint reste celui du projet Supabase `lnvtowdbbagwfbewnchz`. `verify_jwt=false` est intentionnel : les routes membres vérifient elles-mêmes le jeton auprès de Supabase Auth, tandis que le webhook vérifie la signature HMAC Stripe, l’horodatage, le mode réel et le compte attendu.

Les secrets existants restent exclusivement côté serveur. Aucun secret n’est copié dans le dépôt, la page ou un rapport. Les identifiants de produit/prix et la clé Supabase publishable ne sont pas des secrets.

| Route | Comportement |
|---|---|
| `GET /health` | Offre, compteur et disponibilité ; ferme les ventes si un prérequis, le secret, le compte ou la capacité est invalide. |
| `GET /healthz` | Vérifie la clé serveur, le compte Stripe attendu, les encaissements autorisés et le secret webhook. |
| `POST /status` | Droits du compte connecté ; peut réconcilier une ancienne réservation. Ne crée aucun client, prix ou paiement. |
| `POST /checkout` | Compte confirmé, conditions, prix exact, éligibilité, verrou et capacité avant ouverture de Checkout. |
| `POST /portal` | Portail du client Stripe lié au compte ; résiliation en fin de période. |
| `POST /sync` | Réconciliation serveur et refus d’une session appartenant à un autre compte. |
| `POST /webhook` | Signature et idempotence, lecture de l’état Stripe courant, paiements, essai, expiration et incidents. |
| `POST /request` | Accusé de réception d’une demande de rétractation ou d’effacement, à traiter manuellement. |

Un retour navigateur « succès » n’accorde aucun droit. Les droits résultent d’un essai vérifié ou d’une facture encaissée, rattachée au bon abonnement et confirmée par ses paiements/charges. Une facture marquée payée hors Stripe, un paiement incomplet, remboursé ou contesté ne suffit pas. Les horodatages empêchent un ancien résultat de remplacer un état plus récent.

## Webhook et portail

Webhook : `we_1ULTYkB6h4U0FlMocC2P0puY`. Il est actif vers le chemin `/functions/v1/sobrizen-billing/webhook`. Les événements ont été étendus à l’expiration Checkout, paiements différés, essai, pause/reprise, remboursements, litiges et avertissement de fraude précoce.

Le format des événements de cette destination reste `2025-02-24.acacia` ; le handler accepte les références d’abonnement anciennes et nouvelles puis relit les ressources avec son API actuelle. Changer le format de la destination n’était pas nécessaire au fonctionnement et n’a pas été annoncé comme réalisé.

Portail : `bpc_1ULSYkB6h4U0FlMoFFlXmdcr`, vérifié actif, factures/carte/résiliation activées, annulation en fin de période, modification d’offre et pause désactivées. L’ancien Payment Link non lié au compte reste désactivé. Ne pas le réactiver pour contourner Checkout.

Les avertissements de fraude suspendent l’accès concerné ; aucun remboursement ou annulation financière automatique n’est effectué par cette version. Le support doit traiter les demandes et vérifier les incidents dans Stripe. Le formulaire de demande n’envoie pas automatiquement un email et ne supprime pas immédiatement un compte.

## Base de données et ordre de publication

Les fichiers de `supabase/migrations/` sont générés avec la CLI Supabase puis alignés sur les versions effectivement appliquées. Les scripts de `db/`, `schema/` et `game-records.sql` sont les sources relues et testées. Ne pas appliquer les deux copies.

1. Facturation v2 : colonnes d’essai/plan/blocage, réservations, risques et fonction `sobrizen_has_premium()`.
2. Consentement et journal : RPC, politiques supplémentaires et version de note monotone. Les droits de lecture des anciennes colonnes ont été maintenus pendant cette phase, puis retirés à l’étape 6.
3. Records personnels.
4. Agenda privé et ses RPC.
5. Frontend et nouveau service worker.
6. Restriction finale des quatre colonnes sensibles de `user_settings`, désormais lues par RPC contrôlé : migration `20261109214029_private_settings_column_permissions`.

Cet ordre de publication est achevé. La migration Agenda a été appliquée sous la version `20261109213640` ; sa table et ses deux RPC ont été constatés en production. La PR n° 1 a été fusionnée, le build Vercel de production a réussi et les cinq ressources publiques contrôlées correspondent exactement au build testé. La restriction finale des colonnes a ensuite été appliquée sous la version `20261109214029`. Les onglets anciens doivent recharger l’application.

Le contrôle des privilèges en production donne `full_select=false` pour `user_settings`, `private_select=false` pour `response_plan`, `consent_select=true`, et une exécution de `public.read_private_settings()` autorisée à `authenticated` mais refusée à `anon`. Ces vérifications portent sur les objets et permissions déployés ; elles ne remplacent pas un parcours authentifié complet sur un compte réel.

Les tables serveur de facturation ont RLS activée, sans politique utilisateur, et leurs privilèges sont révoqués. Les avertissements correspondants « RLS enabled, no policy » sont intentionnels. Les trois fonctions `SECURITY DEFINER` de réglages/export sont également intentionnelles : identité `auth.uid()` obligatoire, aucun argument d’identité fourni par le client, recherche SQL vide, tables/colonnes autorisées explicitement, accès anonyme révoqué. Les tests vérifient leur isolation.

## Validation acquise et limites

Les tests utilisent de vrais modules applicatifs, des contrôleurs DOM, des doubles de Stripe/Auth/HTTP et PostgreSQL PGlite avec rôles/RLS. Les scénarios comprennent essai, montants et prix, propriétaire, erreurs réseau, double clic, replay, signature, remboursement, litige, capacité 100 et droits Premium.

Les appels parallèles de PGlite partagent une connexion : ils ne sont pas un test de contention ou de charge sur plusieurs connexions de production. Aucun numéro de carte de test n’a été utilisé en mode réel et aucun paiement de contrôle n’a été déclenché.

Après déploiement v12 : `/health` répond **200**, retourne **100 places**, les trois montants et `trial_days=7` ; `/healthz` répond **204**. La page publique d’abonnement répond **200**, son contenu correspond au build testé et son en-tête CSP est présent. Les ventes sont toujours fermées. Aucun parcours de paiement de bout en bout n’a été testé sur un compte réel. Un test complet Stripe en environnement de test distinct reste à conduire avec les accès correspondants, incluant authentification bancaire, renouvellement, résiliation, remboursement et échec de paiement.

La recette visuelle publique, dans une fenêtre de bureau, confirme le compteur à 100/100, le changement de récapitulatif vers 19,99 €/an après sept jours d’essai lors du choix de l’offre de lancement, et le maintien des achats désactivés. Elle a révélé un conflit de spécificité CSS qui écrasait la disposition des cartes de prix. Le correctif du commit `d4af375864163d557262ebe8e7a15a50361c96b2` est déployé et son résultat a été vérifié après rechargement du domaine public : [capture finale](verification/2026-11-09/offre-production.png), [contrôle du fichier corrigé et de sa CSP](verification/2026-11-09/offre-corrigee.json). Cette recette ne vaut pas validation sur un téléphone physique.

## Points restant nécessaires à l’ouverture commerciale

- Médiateur réellement conventionné couvrant SobriZen, coordonnées à publier ; ne pas inventer une adhésion.
- Forfait d’hébergement autorisant l’exploitation commerciale ; l’accès Vercel à l’équipe a renvoyé 403 et le forfait n’est pas confirmé.
- Recette Stripe de bout en bout et configuration/vérification des confirmations, rappels d’essai et reconductions annuelles.
- Finalisation des informations de conservation/transferts de données et du traitement opérationnel des demandes de support.
- Parcours authentifiés sur comptes réels et recette sur appareils mobiles ; les parcours publics de démonstration décrits dans RELEASE_2026-11-09.md sont vérifiés, et la publication ainsi que les migrations de cette livraison sont réalisées.

`billing_config` conserve `sales_enabled=false`, `legal_ready=false`, `hosting_ready=false`, `tax_ready=true`, `premium_features_ready=true`. La valeur `terms_version=2026-11-09` est désormais appliquée. Ne modifier les indicateurs qu’après résolution documentée des points correspondants.

Le projet Supabase est sur le forfait **Free**. La protection contre les mots de passe compromis via Have I Been Pwned reste désactivée, car elle nécessite **Pro ou supérieur** ; aucun outil de configuration Auth n’était disponible dans cette session. Elle n’est pas activable avec la configuration actuelle. Aucun changement de forfait ni achat n’a été effectué.

La version PostgreSQL constatée est **17.6.1.166**. Supabase signale une mise à niveau ; le chemin documenté pour Free est une mise en pause suivie d’une restauration vers une version mineure plus récente. Cette opération implique une interruption de service et doit être préparée avec une sauvegarde et des contrôles après reprise. Aucune mise en pause, restauration ni mise à niveau n’a été exécutée pendant cette livraison.

Références officielles : [Sécurité des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [mise à niveau Supabase/PostgreSQL](https://supabase.com/docs/guides/platform/upgrading), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [fonctions privilégiées](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker), [Checkout](https://docs.stripe.com/api/checkout/sessions/create), [paiements de factures](https://docs.stripe.com/api/invoice-payment/list), [limites commerciales Vercel](https://vercel.com/docs/limits/fair-use-guidelines), [médiation de la consommation](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/la-mediation-de-la-consommation-ce-que-vous-devez-savoir).
