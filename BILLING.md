# SobriZen — état de l'intégration de paiement

Mise à jour : 30 septembre 2026. **Les ventes ne sont pas ouvertes.** Ce document décrit la préparation, pas une validation commerciale ou juridique.

## Offre existante en production

- Compte Stripe : SOBRIZEN, `acct_1ULRv6B6h4U0FlMo`.
- Premium : **29,99 EUR par an**, 2999 centimes, jamais par mois.
- Produit : `prod_VMAu4k8wMdvkAu`.
- Prix : `price_1ULSYDB6h4U0FlMoAnD7zybM`.
- Portail client : `bpc_1ULSYkB6h4U0FlMoFFlXmdcr`. Résiliation en fin de période, factures et carte bancaire accessibles. Les liens légaux pointent vers la page publiée, explicitement encore en projet pour l'offre payante.
- Ancien Payment Link : `plink_1ULTAZB6h4U0FlMoxsBC7hIu`, désactivé. Ne pas l'activer à la place du Checkout lié au compte : il ne porte pas automatiquement l'identifiant de l'utilisateur attendu par le serveur.
- Virements Stripe vers la banque : réglage manuel constaté, non modifié.

## Éléments installés

Pages `abonnement.html` et `legal.html`, accessibles aussi sous `/abonnement` et `/legal` avec Vercel cleanUrls ; liens depuis l'accueil et le pied de page. Leur réponse HTTP 200 et la présence des éléments attendus ont été vérifiées sur le domaine de production.

Supabase, projet `lnvtowdbbagwfbewnchz` : fonction Edge `sobrizen-billing`, version 1. Le code serveur déployé se consulte dans Supabase. Le module de validation `billing/core.mjs` est versionné dans ce dépôt. La copie du module serveur dans GitHub a été bloquée par l'outil et n'est pas annoncée comme enregistrée.

Routes :

- `GET /health` : état des prérequis, aucun secret divulgué.
- `POST /status` : état enregistré du seul utilisateur connecté.
- `POST /checkout` : création du paiement annuel, soumise aux prérequis et à la connexion.
- `POST /portal` : session Stripe du seul client associé au compte connecté.
- `POST /sync` : vérification Stripe et contrôle d'appartenance du Checkout au compte.
- `POST /webhook` : contrôle de signature, environnement réel et suivi des événements Stripe.
- `POST /request` : enregistrement d'une demande de rétractation ou de suppression, avec accusé téléchargeable. **Ce n'est pas un remboursement ni une suppression automatique ; aucun email n'est automatiquement envoyé au support.**

Webhook Stripe créé : `we_1ULTYkB6h4U0FlMocC2P0puY`, destination `/functions/v1/sobrizen-billing/webhook` du projet Supabase. Version d'API attendue : `2025-02-24.acacia`. Événements : paiement Checkout terminé, facture payée/échouée, abonnement créé/modifié/supprimé, remboursement et litige.

Les tables `billing_config`, `billing_customers`, `billing_subscriptions`, `billing_events`, `billing_checkout_locks`, `billing_consents`, `billing_requests` ont été ajoutées sans supprimer les tables de suivi. RLS activée partout ; seuls les traitements serveur écrivent les droits. Un membre ne peut lire que ses propres états, consentements et demandes. Les quatre tables purement serveur n'ont volontairement aucune politique utilisateur et leurs privilèges utilisateur sont révoqués.

Les réponses des RPC de sauvegarde et de libération de verrou ont été rendues explicitement JSON par la migration `return_explicit_billing_rpc_acknowledgements`, pour être compatibles avec le lecteur de réponses du serveur déployé.

## Vérifications réellement exécutées

- 12 tests unitaires locaux du module de validation réussis : prix annuel exact, fermeture par défaut, paiement validé, conservation jusqu'à l'échéance lors de la résiliation, expiration, paiement échoué, facture remboursée ou contestée, quantités erronées, signature valide, falsifiée, expirée ou de test.
- Tests de protocole en production : `/health` répond 200 ; `/status` et `/checkout` sans connexion répondent 401 ; `/webhook` sans signature répond 400.
- Privileges SQL vérifiés : aucun droit INSERT/UPDATE des abonnements pour les membres, aucun accès utilisateur à la lecture du secret de webhook.
- Les tables de suivi existantes n'ont pas été modifiées pour simuler un paiement.

**Aucun paiement réel de contrôle, aucun cycle de renouvellement réel et aucun parcours complet de paiement de bout en bout n'ont été validés. Les tests unitaires utilisent des données synthétiques.**

## Prérequis non satisfaits — ne pas ouvrir les ventes

### Secrets serveur

Le contrôle `/health` confirme l'absence de `STRIPE_SECRET_KEY` et de `STRIPE_WEBHOOK_SECRET`. Leur installation doit se faire dans Supabase, projet Sobrizen, Edge Functions, Secrets. Ne jamais les mettre dans GitHub, dans le JavaScript du navigateur, dans un document public ou dans une conversation.

La première valeur est une clé serveur du compte Stripe de production SOBRIZEN, avec les permissions nécessaires à l'intégration ; la seconde est le secret de signature de la destination webhook identifiée ci-dessus. L'enregistrement automatique du secret a été bloqué et n'a pas été contourné.

L'installation des clés ne vaut pas validation des autres prérequis et n'ouvre pas automatiquement les ventes.

### Application et vérification du cycle

La séparation des fonctionnalités gratuites et Premium dans les écrans de suivi et d'exercices reste à terminer. Le statut de facturation ne constitue pas à lui seul ce contrôle d'accès. La version bêta existante n'a pas été amputée de ses fonctions. Les ressources d'aide, l'export personnel et les droits sur les données ne doivent pas devenir payants.

Le parcours doit ensuite être testé dans un environnement de test distinct, avec une configuration adaptée : paiement accepté/refusé, authentification supplémentaire, mauvais compte, double clic, événement dupliqué, renouvellement, résiliation, expiration, remboursement, reconnexion et conservation de l'historique. Ne pas utiliser de cartes de test dans la production.

### Informations et exploitation

À confirmer avant vente : régime de TVA applicable, mentions de facturation, médiateur compétent et convention couvrant SobriZen, consentement explicite pour les données sensibles, durées de conservation, suppression effective du compte, traitement et confirmation durable des rétractations, notifications de reconduction, gestion des échecs de paiement et fonctionnement réel de l'adresse de support.

L'identité d'entrepreneur individuel, le SIREN 850869033 et le SIRET 85086903300025 ont été vérifiés avec l'API officielle de recherche d'entreprises. Cela ne valide ni le régime de TVA ni la couverture d'une convention de médiation.

Le forfait Vercel actuel n'a pas pu être confirmé via la connexion, qui ne renvoie aucune équipe. Vérifier qu'il autorise l'exploitation commerciale. Aucun forfait payant n'a été souscrit ou changé dans cette intervention.

Les paramètres publics de Checkout devront pointer vers les conditions définitives avant d'exiger leur acceptation. Les liens du portail client ne remplacent pas nécessairement ces paramètres publics de Checkout.

### Verrouillage de lancement

`billing_config` contient cinq indicateurs, tous laissés à false : `sales_enabled`, `legal_ready`, `tax_ready`, `hosting_ready`, `premium_features_ready`. Le module refuse l'ouverture si ces validations ne sont pas toutes satisfaites. Ne pas les changer uniquement pour faire disparaître le message d'attente : ils représentent des contrôles effectifs à terminer.

## Avis de sécurité supplémentaires

L'audit Supabase signale que la protection contre les mots de passe compromis est désactivée. Vérifier sa disponibilité et son coût avant activation : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Les avis informatifs « RLS enabled, no policy » des tables réservées au serveur correspondent ici au refus d'accès utilisateur intentionnel, contrôlé par révocation des privilèges. Ne pas créer une politique publique permissive pour supprimer cet avis.
