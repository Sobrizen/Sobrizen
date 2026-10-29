# Journal : images privées et partage choisi

## Parcours utilisateur

Le formulaire de note propose **Garder pour moi**, sélectionné par défaut, ou **Partager avec la communauté**. Le second choix enregistre d’abord l’original dans le journal, puis ouvre une copie à relire. Une case explicite de partage et le bouton Publier sont nécessaires pour rendre cette copie visible aux membres. Annuler conserve la note privée.

Le bouton sur chaque note existante ouvre le même aperçu. Le titre et le texte complets sont repris, ainsi que l’image facultative. Comme pour les autres nouveaux messages, la durée de l’arrêt en cours est reprise du suivi, affichée dans l’aperçu puis partagée uniquement après confirmation. Elle apparaît en badge à côté du pseudo et reste celle du jour de publication. Aucun badge n’est ajouté si aucun arrêt en cours n’est disponible ; aucune émotion du suivi n’est préremplie. Les notes acceptent 5 000 caractères et les publications 2 000 : un compteur signale les copies trop longues et bloque la publication tant que l’utilisateur ne les a pas raccourcies. L’original n’est jamais tronqué.

Une publication est une copie indépendante. Modifier ou supprimer la note privée ne modifie pas cette copie. Elle se gère dans Communauté. Une référence privée `shared_post_id` mémorise la dernière copie confirmée ; elle est effacée si cette publication est supprimée. Partager de nouveau crée volontairement une nouvelle copie.

## Images

Une note accepte une image JPEG, PNG ou WebP, jusqu’à 10 MiB à la sélection. Le navigateur vérifie la signature, décode l’image (40 mégapixels maximum), la redimensionne à 1 600 pixels sur son plus grand côté et la réencode en JPEG de 2 MiB maximum. Le nom original et les métadonnées EXIF/GPS ne sont pas envoyés. La sélection ne fait qu’ouvrir un aperçu local ; l’envoi commence avec l’enregistrement.

Le bucket **journal-images** est privé et distinct de **community-images**. Les règles d’accès autorisent exclusivement le propriétaire du dossier UUID à lire, créer ou supprimer ses fichiers. Les notes restent soumises aux règles existantes limitant l’accès à leur propriétaire. Les chemins sont validés côté client et base de données.

Les aperçus privés sont chargés par `storage.download()` avec la session authentifiée et affichés via des URL Blob en mémoire. Aucune URL publique ou signée n’est créée pour les images du journal. Les chargements sont différés jusqu’à l’approche de la note dans la zone visible. L’état et les URL temporaires sont révoqués à la déconnexion, au changement de compte ou au retrait du consentement dans l’application. Aucune note ou image personnelle n’est mise dans le cache du service worker ou dans localStorage.

Le partage charge l’image privée dans le brouillon, puis envoie une copie indépendante dans community-images seulement après validation de la publication. Un échec de lecture bloque le partage jusqu’à une nouvelle tentative, un remplacement ou un retrait explicite de l’image. Les règles et liens signés de la communauté restent ceux du module existant.

L’utilisateur peut remplacer, retirer ou télécharger une image depuis le journal. L’export JSON conserve les textes et références d’images ; il n’inclut pas les octets des images. Le téléchargement individuel est disponible dans l’aperçu de chaque note.

## Enregistrement et nettoyage

Les formulaires verrouillent leurs boutons pendant l’enregistrement. Les identifiants de note et publication restent identiques après une réponse réseau incertaine. La publication vérifie le contenu déjà enregistré avant de réessayer, avec le même chemin d’image, pour éviter les doublons.

Les suppressions et remplacements tentent de supprimer les anciens fichiers par l’API Storage seulement après confirmation de la modification et vérification qu’aucune note ne les référence encore. Un échec de nettoyage est signalé. Une réponse d’envoi incertaine ou une déconnexion peut laisser un fichier privé orphelin ; un rapprochement opérationnel reste nécessaire. Aucun service planifié de purge n’est ajouté. Lors de l’effacement d’un compte à la demande de son titulaire, inclure les fichiers de ses dossiers dans les deux buckets via l’API Storage, en plus des données de suivi.

La migration additive `db/journal-images-and-sharing.sql` ajoute trois colonnes, deux index, les règles du nouveau bucket et un déclencheur privé en SECURITY INVOKER. Il interdit de lier une note à la publication d’un autre auteur. Le champ vide permet la suppression de la référence par la clé étrangère. Aucune règle de lecture du journal n’est élargie.

## Vérification

- `node tests/journal-notes-dom.test.mjs` : sauvegarde privée, image, partage explicite, rattachement propriétaire, erreurs, réponse incertaine, doubles clics, retrait et suppression d’image, isolation des comptes et démonstration en mémoire.
- `node tests/community-journal-dom.test.mjs` : aperçu intégral, limite de texte, validation, téléchargement/retrait d’image, annulation, droits révoqués, publication et reprise après erreur.
- `node tests/journal-motivation-dom.test.mjs` : régression des citations, de leur enregistrement et des anciennes pensées.
- `node tests/section-navigation-dom.test.mjs` et `node community-core.test.mjs` : navigation et intégration du build.

Ces tests utilisent un navigateur DOM et des services simulés, jamais des notes ou publications réelles. Le décodage/canvas est adapté dans le harnais DOM. La vérification visuelle de production utilise uniquement le mode démonstration ; elle ne constitue pas un test d’envoi depuis un compte réel.

La migration a été appliquée au projet SobriZen. Un test SQL transactionnel avec deux comptes fictifs a confirmé la lecture et la modification limitées au propriétaire, le rejet des chemins d’image et références de publication d’un autre compte, ainsi que la suppression de la seule référence lors du retrait d’une publication. Tous les enregistrements de test ont été annulés par ROLLBACK.
