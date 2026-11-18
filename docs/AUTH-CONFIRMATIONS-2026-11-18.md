# Confirmations de compte — 18 novembre 2026

Les instructions après une action de compte étaient essentiellement un texte discret ou un message de quelques secondes. Elles deviennent un écran de confirmation visible jusqu’à sa fermeture, avec adresse concernée, boîte de réception, courriers indésirables, étape suivante et accès au support.

| Action | Comportement |
|---|---|
| Créer un compte avec confirmation requise | « Vérifie ta boîte mail », adresse, rappel des spams, lien le plus récent, renvoi après 60 secondes, correction de l’adresse et retour à la connexion |
| Créer un compte avec session immédiate | Confirmation de création dans l’espace ; aucun email annoncé comme obligatoire |
| Mot de passe oublié | Email de réinitialisation demandé, rappel des spams, étapes pour choisir le nouveau mot de passe ; formulation conditionnelle pour préserver la confidentialité des comptes |
| Renvoyer la confirmation | Message distinct, attente avant nouvel envoi, conservation de l’adresse réellement utilisée |
| Modifier l’adresse email | Instruction de vérifier les boîtes concernées, nouvelle et ancienne adresse, sans annoncer le changement comme terminé avant confirmation |
| Changement d’adresse immédiat autorisé par le serveur | Confirmation du changement déjà effectué ; pas de fausse demande de lien |
| Demander un code de sécurité | Explication persistante et rappel des spams dans le formulaire ; nouveau mot de passe conservé comme brouillon |
| Enregistrer le nouveau mot de passe | Confirmation persistante du succès ; aucune deuxième confirmation par email inventée |
| Ouvrir un lien expiré, déjà utilisé ou invalide | Écran explicatif et accès à une nouvelle demande ; erreurs serveur et jetons exclus de l’affichage |
| Erreur d’envoi, limite d’envoi ou adresse non confirmée | Message en français avec l’action à effectuer ; aucune fausse annonce d’email livré |

Les messages sont des confirmations dans l’application. Ils ne demandent aucune permission de notification système et fonctionnent avant la création effective d’un compte. Le renvoi reste contrôlé côté serveur ; le délai local sert à éviter les doubles demandes involontaires. Les mots de passe et jetons ne sont jamais copiés dans ces messages ni stockés dans le contrôleur. Les réponses tardives sont ignorées après un changement de compte.

## Contrôles de configuration effectués

La lecture de l’endpoint public Supabase `/auth/v1/settings` a renvoyé HTTP 200 avec authentification email activée, inscriptions autorisées, confirmation d’adresse exigée (`mailer_autoconfirm=false`) et authentification par téléphone désactivée.

Les liens d’inscription et de renvoi conservent la sélection d’offre gérée par le déploiement. Les liens de récupération gardent leur parcours distinct et les paramètres d’offre sont conservés lorsqu’une URL d’erreur est nettoyée. Aucun tarif ni droit d’accès n’est modifié.

La lecture agrégée des journaux Auth disponibles n’a pas relevé de catégorie d’erreur SMTP/envoi dans les événements email consultés ; cela ne prouve pas une livraison en boîte de réception. Aucun email de test n’a été envoyé à un membre.

## Contrôles nécessitant la session administrateur

Le tableau de bord Supabase ouvert dans Chrome demande une connexion administrateur. Le connecteur ne donne pas accès à sa configuration Auth détaillée. La vérification de l’expéditeur SMTP, des modèles hébergés, des URL autorisées, de la durée des liens et des limites d’envoi reste donc conditionnée à cet accès. Aucun de ces réglages n’est présenté comme vérifié ou modifié sans lecture de sa valeur réelle.

Pour une recette de livraison complète, utiliser une adresse de test autorisée : inscription, arrivée du message, lien, confirmation, récupération puis changement d’adresse. Les tests automatiques utilisent exclusivement un service Auth simulé et des adresses `example.test`.

## Validation

Les tests couvrent les messages, l’échappement des adresses, les comptes inconnus, le délai de renvoi, les erreurs conservées, le code de sécurité sans perte du brouillon, les liens expirés et les changements de session. La recette Chrome à 390 et 1280 pixels vérifie inscription, récupération, renvoi et correction de l’adresse avec zéro requête externe inattendue, zéro erreur JavaScript et aucun débordement horizontal. Le build et le scanner de secrets doivent réussir avant publication.

Références : [authentification par mot de passe](https://supabase.com/docs/guides/auth/passwords), [URL de redirection](https://supabase.com/docs/guides/auth/redirect-urls), [limites Auth](https://supabase.com/docs/guides/auth/rate-limits), [SMTP personnalisé](https://supabase.com/docs/guides/auth/auth-smtp).
