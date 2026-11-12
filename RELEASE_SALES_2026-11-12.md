# SobriZen — préparation de l’ouverture commerciale du 12 novembre 2026

## Périmètre autorisé
Le propriétaire demande explicitement de publier les corrections, de permettre la sélection des trois offres et d’ouvrir les souscriptions. Il prend en charge la documentation juridique séparément et demande de ne pas afficher de bandeau public d’inachèvement. Cette livraison ne certifie pas la conformité juridique.

## Modifications
- Nouveau module purchase-intent : mémorisation de l’offre choisie pendant deux heures et retour vers /abonnement après connexion. Destination interne strictement limitée ; les modes démonstration et récupération du mot de passe ne déclenchent pas de redirection d’achat.
- Les trois tarifs apparaissent avant la gestion de l’abonnement. Un visiteur non connecté peut continuer vers la connexion en conservant son choix. Une offre de lancement épuisée n’est jamais remplacée silencieusement par un autre tarif.
- Description du produit Stripe corrigée pour les trois offres. Identité commerciale affichée : SobriZen — JANNAH BOUTIQUE. L’exploitant individuel existant reste identifié.
- Siège enregistré dans les paramètres Stripe Tax : 21 rue Édith Piaf, 45500 Gien, France. Aucune immatriculation fiscale créée ; automatic_tax reste false conformément à la déclaration du propriétaire. La mention de franchise existante reste sur les factures.
- Prix récurrents inchangés : 2,99 EUR/mois, 29,99 EUR/an, 19,99 EUR/an de lancement. Sept jours d’essai pour une première souscription éligible. Conversion automatique des prix désactivée afin de conserver les montants EUR annoncés.
- Autorisation commerciale de l’exploitant séparée du statut de vérification juridique. Les droits d’administration, le verrou général, le contrôle du compte Stripe, l’hébergement, les prix, l’identité du client, la capacité de lancement et la signature des événements restent requis.

## Tests réalisés sur la version candidate
Node 24.22.3 ; jsdom 30.1.3 ; PGlite 0.5.16. Suite globale : 593 tests réussis, 0 échec, 0 ignoré. Build : 105 fichiers publics ; cache sobrizen-v13-20261112-sales-1.

Onze scénarios supplémentaires dans Chromium, sur le build avec CSP de production et aux largeurs 1280 et 390 pixels : sélection des trois plans, acceptation des conditions, montants et essai transmis, absence de débordement horizontal, visiteur vers connexion avec choix conservé, offre épuisée sans substitution et retour confirmé sans seconde souscription. Authentification et réponses de facturation simulées pour ces onze scénarios ; aucune donnée d’un membre réel utilisée.

Trois sessions Checkout de contrôle ont été créées dans le compte réel par le connecteur Stripe, sans client, sans carte et sans confirmation. Stripe a accepté les prix et l’essai : montant initial nul, taxes automatiques désactivées, aucune souscription créée. Ces pages isolées ne sont pas des liens de vente à diffuser : les clients doivent passer par le Checkout lié au compte dans l’application.

## Limites de validation
Aucun débit réel n’a été exécuté. L’inscription et la réception de l’email de confirmation, la validation bancaire, le premier débit après l’essai, la livraison des emails de facturation et un renouvellement réel n’ont pas été exécutés de bout en bout. Les règles correspondantes sont testées avec des services simulés. Un seul compte Stripe en mode réel est accessible dans cette connexion. Ne jamais utiliser une carte de test sur le service réel.

La suite globale et les contrôles du build ne constituent pas une relecture exhaustive de toutes les dépendances, une certification de sécurité, une garantie d’absence totale de bug ou une recette sur téléphones physiques. Ne pas présenter le service comme validé à 100 %.

## Publication et ouverture
La migration owner_authorized_sales_launch ajoute deux champs administratifs, sans changer les protections de la table billing_config. L’ouverture effective requiert la publication du code serveur actualisé puis la mise à jour explicite des indicateurs administratifs. Les résultats de déploiement et de health doivent être relus après activation avant d’annoncer l’ouverture.
