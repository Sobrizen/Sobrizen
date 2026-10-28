# Repères colorés — 28 octobre 2026

Base conservée : 5bb14da01701f204d2c8cd3ca3b11576e474b6c3, version restaurée sans navigation compacte.

## Portée

Une feuille CSS additionnelle après clinical.css différencie les neuf rubriques. Le suivi utilise le bleu, le corps et les progrès le vert, le mental et le journal la lavande. Le menu actif possède un fond teinté, un libellé renforcé et une barre de repère. Les actions principales sont pleines, les actions secondaires pâles ; les informations générales restent sur fond neutre. Les avertissements et erreurs conservent des couleurs distinctes.

Aucun changement de disposition, d'onglet, de texte scientifique, de calcul, de formulaire, de règle de jeu, de compte, d'abonnement ou de base de données. Les modules applicatifs et la feuille clinical.css restent inchangés. Le service worker conserve ses règles et reçoit seulement le nouvel asset public et une nouvelle version de cache. La revalidation du nouvel asset est ajoutée à vercel.json.

## Vérification ciblée

Contrôles locaux Chromium contre une fixture de composants et des déclarations de cascade représentatives inspectées dans le dépôt : neuf états de rubrique, thèmes clair/sombre, largeurs 1440, 390 et 320 pixels. 32 paires texte/fond donnent 1728 mesures, minimum 5,25:1. Les neuf accents sont distincts ; les champs du formulaire de ressenti, boutons principaux/secondaires, état actif du menu et détails natifs ont également été vérifiés. Le CSS n'ajoute aucune règle de masquage, de dimension ou de blocage des clics/du zoom.

Ces mesures concernent les composants de la fixture, pas l'intégralité de la cascade et des parcours de production. Elles ne constituent ni un audit d'accessibilité complet ni un test sur téléphone physique. Aucune donnée personnelle n'a été lue ou créée. Le statut de déploiement est contrôlé séparément après publication.
