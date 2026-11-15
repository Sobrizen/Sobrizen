# Exploitation de SOBRIZEN

Ce guide prépare une exploitation humaine. Aucun envoi d’email, remboursement, effacement de compte, retrait de contenu ou abonnement payant n’est déclenché par ces fichiers.

## Chaque jour et avant d’ouvrir les ventes

Un responsable doit consulter les demandes de support et les signalements. Exécuter [la file de revue](../ops/review-queues.sql) dans l’éditeur SQL Supabase avec un compte administrateur autorisé. Le résultat est borné à 100 lignes par file et ne contient ni email, ni texte publié, ni réflexion privée. Tant qu’aucune notification support n’a été effectivement mise en place et testée, cette consultation manuelle est indispensable. Ne pas promettre une surveillance permanente.

Pour un signalement précis, consulter uniquement le contenu signalé et le motif correspondant dans les outils administrateur. Décider humainement de l’action. La modération n’est pas un service d’urgence. Aucun message privé ni historique de consommation n’est requis pour traiter une publication signalée.

Les demandes de rétractation et de suppression enregistrées par l’application sont des demandes à traiter. Le reçu ne prouve pas un remboursement, une résiliation ou un effacement. Vérifier l’identité et le périmètre de la demande dans les outils autorisés. Vérifier séparément le renouvellement dans Stripe, puis documenter le résultat effectif; ne jamais déduire la résiliation d’une suppression de profil. Pour un effacement, inventorier Auth, tables applicatives, fichiers Storage et données de facturation soumises à conservation avant toute action. Un utilisateur payant ne doit pas continuer à être débité faute de suivi humain.

Après une décision effective, enregistrer uniquement sa référence dans `private.operations_review_log`. Cette table n’est accessible ni au rôle anonyme ni aux membres; elle n’a pas de vue publique. Les valeurs autorisées sont `needs_follow_up`, `no_action`, `content_removed`, `request_completed` et `request_rejected`. Une référence de demande ou de signalement suffit : ne pas recopier un email, le texte d’une note, un motif de santé ou une donnée de paiement. Le propriétaire doit appliquer à ce journal une politique de conservation cohérente avec les documents juridiques.

Exemple à adapter et exécuter manuellement après revue, jamais automatiquement :

```sql
insert into private.operations_review_log(queue,source_id,decision)
values ('content_report','00000000-0000-0000-0000-000000000000','no_action');
```

La référence fictive ci-dessus ne correspond à aucune demande réelle. L’enregistrement d’une décision ne modifie pas les contenus, comptes ou paiements. Les statuts réels des demandes sont `received`, `processing`, `completed` et `rejected`; leur modification doit correspondre au traitement réellement réalisé. Garder une demande ouverte si son effacement, son remboursement ou son contrôle de renouvellement est encore en attente.

## Emails et accès au compte

L’audit a observé deux erreurs SMTP Gmail le 14 novembre 2026 à 21:44:20 et 21:50:16 UTC, puis une reconfiguration et une inscription confirmée à 21:55:42 UTC. Il ne démontre pas une panne SMTP actuelle. Avant lancement, vérifier avec une adresse de test contrôlée l’inscription, la réception, le lien de confirmation, le renvoi et la récupération de mot de passe. Contrôler l’expéditeur et les redirections du domaine. Ne jamais copier le mot de passe SMTP dans le dépôt, les captures ou les journaux.

## Sauvegarde et restauration

Les outils connectés disponibles ne donnent pas accès à la liste des sauvegardes ou au PITR. La commande de lecture `supabase backups list --remote=lnvtowdbbagwfbewnchz --output-format=json`, consultée avec le CLI officiel 3.1.0, a répondu `AccessTokenRequiredError`. Aucune connexion ni export de données n’a été lancé. Le plan Supabase et la couverture actuelle des sauvegardes restent donc **non vérifiés**.

Un propriétaire autorisé doit relever dans le Dashboard le plan, la date de la dernière sauvegarde réussie, sa rétention, le PITR éventuel et le délai de reprise visé. Ne pas activer une option payante sans décision explicite. Vérifier aussi la copie des objets Storage : une sauvegarde de base de données ne contient pas automatiquement les octets des images stockées. Tester une restauration dans un environnement isolé, avec accès restreint, puis documenter le résultat et le nettoyage. Ne pas restaurer sur la production pour un simple essai.

Documentation : [sauvegardes Supabase](https://supabase.com/docs/guides/platform/backups), [fonctions et sécurité](https://supabase.com/docs/guides/database/functions).

## Déploiement des corrections

Les fichiers de migration sont préparés localement; leur présence ne signifie pas qu’ils sont appliqués. Appliquer d’abord les migrations validées, puis publier le client qui appelle le nouveau RPC `save_program_progress`. Le client échoue explicitement si le RPC est absent; il ne revient pas à une écriture qui pourrait écraser un brouillon concurrent.

Les anciens clients continuent à enregistrer les étapes; leurs écritures augmentent aussi la révision. Le nouveau client détecte ainsi une modification intervenue après l’ouverture du formulaire. Deux anciens clients conservent leur comportement historique; cette compatibilité ne leur ajoute pas une comparaison de version qu’ils n’envoient pas.

La migration de téléphone remplace une expression par une classe POSIX sans backslash et teste les formats courants. La vérification finale de la regex réellement déployée a confirmé que les numéros français et internationaux étaient déjà acceptés : il s’agit d’un durcissement de validation, pas de la correction d’une panne avérée.

La CI exécute l’analyse locale de secrets, `npm audit`, les tests et le build sans secret de production. Les actions GitHub sont épinglées à leur commit. Les fichiers de test sont exécutés l’un après l’autre : chaque suite PostgreSQL embarque une instance PGlite, et les lancer toutes en parallèle peut épuiser la mémoire. La CI ne modifie ni Supabase ni Stripe. Les déploiements automatiques Vercel doivent être configurés pour attendre les vérifications requises ou les changements doivent passer par une branche protégée : la création du workflow seule ne bloque pas un déploiement Vercel existant.
