# Audit fonctionnel et éditorial de Sobrizen

Date : **27 octobre 2026**. Base de travail : commit `df56351a42b30f30d36a6517dd119237386a614f`, puis modifications de la refonte présentes dans le répertoire de travail. Les résultats automatiques portent sur l’état local final ; les observations de production sont décrites séparément.

## Résultat et portée

La suite ajoutée exerce les vrais modules de l’application dans un DOM simulé : navigation, sauvegardes de démonstration, formulaires avec service simulé, accès gratuit et Premium, consentement, changement de compte, aide, jeux et intégration du mouvement. Elle contient **45 scénarios fonctionnels**, répartis en cinq processus indépendants, et **3 contrôles de cohérence du contenu**. La suite dédiée au mouvement contient **10 scénarios**. La passe complémentaire sur Abonnement ajoute **15 scénarios**, soit **70 scénarios ciblés** au total, en plus des trois contrôles de contenu et des suites de calcul déjà présentes.

La dernière exécution globale, effectuée par le responsable de l’intégration après toutes les corrections ci-dessous, y compris la page Abonnement, a terminé avec **15 fichiers de tests réussis, 0 échec, 0 scénario ignoré**. Ce nombre de fichiers ne doit pas être confondu avec le nombre de scénarios internes : les 45 scénarios UX sont rapportés à l’intérieur d’un seul fichier. Les anciennes suites de calcul, de chronologie et de jeux restent comprises dans l’exécution globale.

Aucun compte réel, dossier de santé, publication communautaire réelle, appel téléphonique, paiement ou message à un utilisateur n’a été utilisé. Les utilisateurs, notes, ressentis et publications du service simulé sont fictifs. Le réseau applicatif est désactivé pendant les tests.

Cet audit ne constitue **ni une certification clinique, ni une certification de sécurité, ni une validation de l’accessibilité complète**. La validation visuelle dans un navigateur réel et sur un appareil mobile reste distincte.

## Reproduire les contrôles

Prérequis de l’exécution observée : **Node.js 24.22.1** et **jsdom 30.1.3**. Le harnais utilise `node:module.registerHooks` ; un ancien Node sans cette API ne convient pas à cette suite. La dépendance DOM est installée hors du dépôt et ne modifie pas les dépendances de production.

```sh
npm install --prefix /tmp/sobrizen-audit-qa --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org jsdom@30.1.3
```

Depuis la racine du dépôt :

```sh
node tests/ux-dom.test.mjs
node tests/health-content.test.mjs
node tests/subscription-dom.test.mjs
SOBRIZEN_JSDOM_PATH=/tmp/sobrizen-audit-qa/node_modules/jsdom node tests/movement-dom.test.mjs
```

Pour la suite complète :

```sh
SOBRIZEN_QA_JSDOM=/tmp/sobrizen-audit-qa/node_modules/jsdom/lib/api.js SOBRIZEN_JSDOM_PATH=/tmp/sobrizen-audit-qa/node_modules/jsdom node --test tests/*.test.mjs games.test.mjs
```

Pour isoler un groupe UX :

```sh
node tests/ux-dom.test.mjs --group=demo
node tests/ux-dom.test.mjs --group=without-consent
node tests/ux-dom.test.mjs --group=member
node tests/ux-dom.test.mjs --group=premium
node tests/ux-dom.test.mjs --group=races
```

Les deux variables de chemin ont des conventions différentes : `SOBRIZEN_QA_JSDOM` désigne le fichier `lib/api.js`, tandis que `SOBRIZEN_JSDOM_PATH` désigne le répertoire du paquet. Le chemin par défaut du harnais UX correspond à la commande d’installation ci-dessus.

## Méthode

`tests/ux-dom-support.mjs` charge le vrai `index.html`, puis importe sans transformation les modules de production `app.mjs`, `movement.mjs` et `ergonomics.mjs`, ainsi que leurs dépendances habituelles. Chaque groupe UX démarre dans un nouveau processus pour isoler les modules possédant un état interne.

La date de référence est le 27 octobre 2026 à 12 h 30 UTC. Le fuseau du processus est `Europe/Paris`. Le harnais peut avancer l’heure, déclencher les intervalles et la visibilité de la page, et choisir la réponse aux confirmations de perte d’un brouillon. Il conserve les erreurs JavaScript, les promesses rejetées et les tentatives de téléchargement.

Pour les scénarios de compte, seul l’import distant du SDK Supabase est remplacé par un client de test. Ce client accepte un ensemble explicite de tables et de RPC, exige un filtre ou un propriétaire dans les opérations portant sur les tables privées, respecte la sélection des colonnes et permet de retenir une réponse jusqu’à un changement de session. La sauvegarde des ressentis reproduit le conflit `PT409` et un résultat REST sous forme de tableau d’une ligne. La sauvegarde du parcours reproduit le contrôle de révision et la réponse attendue par l’application.

Le service simulé sert à vérifier les demandes et le comportement du client. Il ne remplace pas l’application de politiques RLS, de contraintes SQL ou de règles d’autorisation par un serveur réel. Les tests ne contactent pas Supabase.

## Couverture exacte

| Groupe | Scénarios | Résultat final | Ce qui est exercé |
| --- | ---: | --- | --- |
| Démonstration | 15 | Réussite | Huit routes, menu mobile, détails des chiffres, programme et brouillons, journal, santé, communauté, profil, jeux gratuits, aide et pause |
| Compte sans consentement | 5 | Réussite | Chargement des seules métadonnées publiques, accès bloqués, absence de plan sensible, actions directes refusées, erreurs JavaScript |
| Compte avec consentement | 9 | Réussite | Chargement privé, horloge, maintien de Bouger pendant les mises à jour, consommation, journal, conflit RPC, plan personnel, retrait du consentement |
| Compte Premium | 12 | Réussite | Graphique détaillé au clavier, lancement et fermeture des huit jeux, mouvement et niveau Premium |
| Courses entre requêtes et sessions | 4 | Réussite | Réponse de profil après déconnexion, export paginé interrompu, réponse de ressenti après changement de compte, erreurs JavaScript |
| Cohérence éditoriale | 3 | Réussite | Références des constats de santé, ordre des fenêtres temporelles et aide urgente, intégrité des 30 étapes du programme |
| Mouvement, suite dédiée | 10 | Réussite | Onglets, clavier, accès, minuteur, séance guidée, fermeture, visibilité, événements retardés, stabilité du DOM et perte d’accès |
| Abonnement, suite complémentaire | 15 | Réussite | Purge à la déconnexion ou au changement de compte, réponses et redirections tardives, reçus, renouvellement du jeton, refus, erreurs et cohérence de l’offre |

Chaque groupe UX comprend son contrôle final d’absence d’erreur JavaScript non traitée ; ces cinq contrôles sont déjà inclus dans les 45 scénarios.

### Navigation, accueil et suivi

- Les huit routes natives testées sont `home`, `progress`, `health`, `journey`, `journal`, `games`, `community` et `profile`. Bouger est testé séparément par son action de navigation.
- Chaque route possède un titre, un état `aria-current` cohérent et des libellés utilisables. Aucun `NaN`, `undefined` ou `Infinity` n’apparaît dans leur contenu de démonstration.
- La barre mobile expose, dans cet ordre, Accueil, Suivi, Santé, Aide et Menu. Échap ferme le menu et rend le focus au bouton d’ouverture.
- Les deux cartes de consommation et de dépenses sont de vrais éléments `details` : ouverture par `summary`, explication de la provenance des chiffres, changement de période et focus conservé.
- Le graphique détaillé reste réservé à Premium dans les états testés. La sélection au clavier avec Fin et Entrée ne déclenche aucune écriture.

Les tests vérifient des valeurs et des règles précises, notamment deux jours d’arrêt, vingt puis vingt et une minutes, deux consommations et cinq euros enregistrés. Ils ne refont pas tous les calculs financiers ou toutes les combinaisons de périodes, qui relèvent des suites des moteurs purs.

### Programme, journal et formulaires

- Une réflexion non enregistrée bloque une navigation refusée par l’utilisateur ; la sauvegarde conserve l’étape choisie et le texte.
- Les actions des étapes 2, 7, 9, 13, 15, 26 et 28 ouvrent leur destination réelle. L’étape 2 mène au profil, où figurent les raisons personnelles. L’étape 8 ouvre l’aide et l’étape 21 ouvre le formulaire de consommation.
- La régression de l’étape 21 vérifie qu’une réflexion saisie ne disparaît pas lorsqu’une action peut ouvrir une modale puis provoquer un nouveau rendu. Le refus de quitter conserve le brouillon.
- Le journal de démonstration est créé, recherché, modifié et supprimé. Un fragment HTML saisi comme texte reste du texte. L’annulation d’une suppression conserve la note.
- Le parcours de consommation à trois étapes utilise le RPC versionné et incrémente la révision du document simulé.

Les formulaires sont soumis par événements DOM : cela ne certifie pas le comportement natif de validation HTML de chaque navigateur.

### Santé et ressenti

- Onze fenêtres d’information, six mesures de ressenti et quinze liens de sources sont présents. La modale de sources expose les populations et les limites.
- La déclaration précise produit vingt minutes, puis vingt et une minutes après progression de l’heure simulée. Une heure future est refusée sans remplacer l’arrêt enregistré.
- L’heure inconnue ne produit pas une fausse phase actuelle de quelques heures. Les repères temporels ne sont pas assimilés à une mesure de santé individuelle.
- Les six groupes de cinq choix du formulaire sont utilisables. Le changement de date conserve un brouillon distinct par date et le restaure au retour.
- Le ressenti enregistré apparaît dans l’historique. Le texte de l’anxiété explique correctement qu’une baisse signifie moins d’anxiété.
- Un conflit de sauvegarde conserve le brouillon. Une réponse RPC en tableau d’une ligne est acceptée lors du nouvel essai.
- Une consommation plus récente invalide l’ancienne horloge de santé et retire la phase actuelle, tout en conservant les observations antérieures.

Les cas de fuseau, heure ambiguë, heure inexistante, rétroactivité, changement de base d’arrêt et de déclarations anciennes sont couverts par les suites de calcul déjà présentes ; le nouveau harnais ne prétend pas les répéter intégralement en DOM.

### Consentement et isolation des sessions

- Sans accord, le chargement initial lit les métadonnées nécessaires du consentement, sans sélectionner les colonnes du plan personnel ni les tables de suivi privé.
- Les pages de suivi privé sont fermées à la saisie ; l’information scientifique publique et les jeux gratuits restent accessibles.
- Un bouton de ressenti ajouté artificiellement au DOM ne permet pas d’ouvrir le formulaire privé sans consentement. Une tentative de soumission du plan ne produit pas d’écriture.
- La modification d’un plan personnel écrit les champs concernés sans réécrire une ancienne valeur de consentement.
- Le retrait du consentement masque les ressentis, le journal et le plan de soutien ; la navigation suivante ne relit pas les données privées dans le scénario testé.
- Une réponse tardive de modification du profil ou de sauvegarde d’un ressenti ne remplit pas le compte suivant.
- Un export de plus de 500 lignes, interrompu par un changement de compte pendant la première réponse, ne demande pas la page suivante et ne produit aucun téléchargement.

Les tests n’annulent pas une écriture déjà exécutée sur un serveur. Ils vérifient l’isolation du rendu et la poursuite des opérations côté client après la transition de session.

### Communauté, jeux, mouvement et aide

- Une publication fictive de démonstration reste présente après actualisation du fil. Les filtres la montrent ou la masquent correctement. Le like change d’état et un commentaire peut être enregistré puis supprimé.
- Le profil de démonstration enregistre un nom d’affichage ; les commandes de taille de texte et de thème changent l’état correspondant.
- Le catalogue gratuit expose trois jeux et cinq accès Premium. Le compte Premium accède aux huit jeux : snake, blocks, merge, sequence, memory, reaction, taps et ground.
- Chacun des huit jeux est lancé, ouvre son aide, est mis en pause puis repris au clavier et par bouton, puis se ferme en restaurant le focus et le défilement. Des interactions supplémentaires vérifient une cible de taps et la progression de ground ; le parcours gratuit termine ground.
- L’intégration Premium ouvre Bouger, change de difficulté et ouvre une fiche d’exercice. La suite dédiée vérifie le minuteur, le précédent/suivant guidé, les onglets au clavier, la fermeture, la mise en pause à la perte de visibilité et le nettoyage lors du retrait d’accès ou de la déconnexion. Elle vérifie aussi qu’une notification d’accès inchangé conserve le DOM, le focus et les détails ouverts, tandis qu’une révocation ferme les commandes Premium concernées.
- L’aide expose les liens d’urgence. Une pause de dix minutes passe à neuf minutes après avancement de l’heure et son résultat peut être enregistré. Aucun numéro n’est appelé.

## Anomalies observées et corrections vérifiées

| Anomalie | Effet reproductible | Correction intégrée | Vérification |
| --- | --- | --- | --- |
| Les clics internes de Bouger étaient interprétés comme une navigation | La recherche d’un ancêtre `[data-page]` atteignait le `body` ; le changement de niveau pouvait désactiver la vue | Reconnaissance des véritables commandes de navigation | Suite mouvement et intégration Premium |
| Le minuteur Santé pouvait remplacer Bouger à un changement de durée | Après Santé puis Bouger, la mise à jour recréait le DOM et perdait le focus | Le minuteur vérifie la page active, le `body` et la présence réelle du contenu Santé | Identité du DOM et focus conservés après changement de jour simulé |
| Le retour de visibilité à un nouveau jour pouvait remplacer Bouger | Le rafraîchissement global suivait un ancien état de page | État de page synchronisé ; rendu et actualisation de l’en-tête respectent Bouger | Identité du DOM et focus conservés lors de `visibilitychange` |
| Une action du programme pouvait effacer une réflexion | À l’étape 21, ouverture puis sauvegarde d’une consommation provoquait un nouveau rendu sans protection du brouillon | Guard avant les ouvertures de modales depuis une page comportant un formulaire modifié | Régression durable de l’étape 21 |
| Certaines instructions du programme nommaient d’anciennes destinations | Mentions de « calendrier », « Moi » ou d’un indicateur supprimé | Textes corrigés et actions vers les pages actuelles | Contrôle des 30 étapes et parcours des actions |

Aucun échec fonctionnel ne reste ouvert dans le périmètre automatisé décrit après la dernière relance globale. Cette conclusion ne s’étend pas aux domaines exclus ci-dessous.

## Revue des contenus de santé et du programme

La revue a porté sur `health-evidence.mjs`, les textes affichés par la section Santé, les 30 étapes de `program.mjs` et les textes d’information de `movement.mjs`. Le contrôle automatisé exige que chaque constat physique ou psychologique renvoie à une source identifiable, avec une population et des limites. Il vérifie des liens et des métadonnées ; il ne juge pas à lui seul la validité médicale d’un contenu.

Les textes inspectés distinguent le temps depuis une déclaration d’arrêt, les ressentis déclarés et les résultats observés dans des études. Ils ne présentent pas le compteur comme une mesure d’alcoolémie, une permission de conduire ou une évaluation clinique. Aucun pourcentage de santé récupérée, « dopamine réinitialisée », réparation certaine d’un organe, ni certification clinique de l’application n’a été relevé dans les contenus examinés.

Les fenêtres « autour d’un mois », « trois mois », « six mois » et « un an » sélectionnent des informations à 28, 90, 180 et 365 jours. Ce sont des rendez-vous éditoriaux approximatifs, pas une prédiction du calendrier biologique de chaque personne. Les améliorations possibles et les limites des populations étudiées doivent rester visibles. Le repère d’un an ne garantit pas la disparition d’un risque de cancer ni une normalisation du foie.

Le programme est un ensemble de questions de réflexion et d’actions personnelles, pas un protocole de sevrage validé. Le mouvement propose des exercices généraux et des démonstrations, sans mesure automatique de la posture ni effet thérapeutique assuré sur l’arrêt de l’alcool. Les messages de prudence et l’accès au soutien ne sont pas conditionnés à l’atteinte d’un jalon. Les textes de crise et les conseils de consultation ne doivent pas devenir un message demandant d’attendre une échéance malgré une souffrance actuelle.

### Références documentaires consultées pendant cette passe

Les liens ci-dessous permettent de retrouver les sources primaires ou officielles utilisées pour les vérifications ciblées. Cette passe ne prétend pas avoir relu intégralement les quinze publications du catalogue ni constituer une revue systématique.

- [NHS — Alcohol use disorder](https://www.nhs.uk/conditions/alcohol-use-disorder/) : vérification du cadre médical de l’arrêt et des précautions liées au sevrage.
- [NIAAA — Hangovers](https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/hangovers) : vérification de l’absence d’assimilation entre temps écoulé et aptitude à conduire ou récupération garantie.
- [IARC — Reduction or cessation of alcohol consumption, volume 20A](https://www.iarc.who.int/faq/iarc-handbooks-of-cancer-prevention-volume-20a-reduction-or-cessation-of-alcohol-consumption/) : vérification des limites d’interprétation des risques de cancer, sans échéance personnelle universelle.
- [Mehta et al., 2018, notice PubMed](https://pubmed.ncbi.nlm.nih.gov/29730627/) et [Gopaldas et al., 2025, notice PubMed](https://pubmed.ncbi.nlm.nih.gov/40343869/) : identification des études citées dans le catalogue ; ces notices ne remplacent pas une nouvelle analyse complète de leurs méthodes.
- [Supabase — Auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) : référence du contrat d’événements de session reproduit dans les scénarios simulés.

## Limites et contrôles distincts restant nécessaires

- **Rendu réel :** jsdom ne calcule pas la mise en page. Les largeurs sont simulées, le dessin canvas est neutralisé et les animations sont pilotées. Aucun résultat ne certifie les espacements, les contrastes, la lisibilité réelle, l’absence de débordement ou les interactions tactiles sur un téléphone.
- **Accessibilité :** les tests vérifient plusieurs libellés, états, raccourcis et restaurations de focus. Ils ne valident pas la navigation complète avec un lecteur d’écran, le comportement natif de tous les dialogues ni tous les parcours au clavier.
- **Services :** pas d’authentification réelle, de récupération de mot de passe, de lien envoyé par email, de paiement, de portail d’abonnement, de webhook ni de test des politiques RLS ou des contraintes SQL dans cette passe. Les états Gratuit et Premium proviennent des fixtures.
- **Persistance :** les sauvegardes sont vérifiées dans le service simulé ou la mémoire de démonstration. La tenue des données après un rechargement complet, un autre appareil ou une indisponibilité réseau réelle n’est pas établie par cette suite.
- **PWA et réseau :** ni installation sur l’écran d’accueil, ni service worker en navigation réelle, ni cache de production, ni mise à jour entre deux versions déployées ne sont testés ici.
- **Courses asynchrones :** les trois transitions sensibles documentées sont testées. La suite n’énumère pas toutes les permutations possibles du fil communautaire, des filtres, des formulaires et des événements d’authentification.
- **Jeux :** le cycle d’ouverture, d’aide, de pause et de fermeture des huit jeux est exercé. Le DOM simulé ne permet pas de certifier le ressenti de jeu, la précision du toucher ou l’intégralité des niveaux. Les algorithmes possèdent leurs tests séparés.
- **Science :** aucun état médical individuel n’est déduit des fixtures. La présence d’une source ou le passage d’un test de structure n’équivaut pas à une validation scientifique indépendante de chaque phrase.

Les éléments à vérifier dans un navigateur réel doivent être rapportés avec leurs propres observations après publication ; ils ne sont pas inclus par anticipation dans les résultats ci-dessus.

## Contrôle réel après la première publication

Le déploiement Vercel du commit `1a9e52fd17f838d836923d586038ddf8320a920b` a été confirmé terminé. Le site public a ensuite été rechargé et contrôlé dans Chrome, en mode démonstration, avec des données fictives.

- Les neuf rubriques sont accessibles. Les titres, icônes et descriptions du menu sont présents. Aux largeurs de bureau observées (1 348 à 1 363 pixels CSS selon la présence de la barre de défilement), la largeur du document ne dépasse pas celle de la fenêtre.
- Les cartes Consommation et Dépenses se déplient et expliquent les jours saisis, estimés ou inconnus. La valeur n’est pas transformée en indicateur médical.
- Santé affiche le compteur précis, les étapes et les ressentis. La fenêtre des quinze sources s’ouvre. Le formulaire de ressenti a été inspecté en thème sombre : ses choix sélectionnés restent lisibles.
- Depuis Santé, Bouger ouvre correctement son catalogue. Le niveau Moyen mène à la page d’abonnement dans la démo gratuite. La séance Doux démarre ; le minuteur passe de 1 minute à 54 secondes, se met en pause, avance au deuxième mouvement, revient au premier et se remet à zéro. Sa fermeture rend le focus à l’interface.
- Les jeux restent accessibles par leurs commandes existantes. Le contrôle visuel a montré que le module courant utilise `snake`, `blocks` et `ground` comme jeux gratuits : Snake Zen, Blocs Zen et 5 choses. Les cartes du catalogue courant portent la classe `ga-card`, distincte de l’ancien catalogue ; leurs styles ont été harmonisés dans la passe complémentaire, sans changer les lecteurs de jeux.

La relecture de la cascade CSS a également corrigé un risque de débordement entre 421 et 520 pixels : le titre et son bouton pleine largeur peuvent désormais revenir à la ligne. Ce point relève d’une inspection de code ; aucun téléphone physique ni Safari n’a été utilisé.

La visite de la page Abonnement a révélé des textes anciens sur le nombre de jeux gratuits. Les descriptions de l’offre dans Abonnement, le profil et les informations légales ont été alignées sur le catalogue courant. Les messages techniques ont été reformulés ; le tarif, les conditions et la fermeture des nouvelles souscriptions ont été conservés. La description du consentement a été alignée sur les commandes réellement présentes dans Mon profil. Le script de la page Abonnement a ensuite fait l’objet de la vérification complémentaire ci-dessous.

### Page Abonnement : isolation des sessions

Deux défauts ont été reproduits puis corrigés dans le vrai module intégré à `abonnement.html` : un changement de compte laissait le statut ou le reçu de l’ancien compte en mémoire et dans le DOM ; une réponse tardive pouvait réafficher ce contenu ou déclencher une redirection issue de l’ancienne session.

La page capture désormais l’identité et sa révision avant chaque action, les vérifie avant l’envoi et après les réponses, et purge immédiatement les reçus, liens email, cases cochées et statuts lors d’un changement d’identité. Le renouvellement du jeton pour le même utilisateur conserve l’état. Les routes serveur, les corps métier, l’autorisation des seuls domaines Stripe prévus et les règles de paiement sont conservés.

`tests/subscription-dom.test.mjs` vérifie **15 scénarios** : déconnexion, passage A→B, statuts et accès temporaires tardifs, demandes anciennes après création du reçu B, résolution tardive de session sans nouveau POST, absence de redirection checkout/portail périmée, retour de paiement tardif, renouvellement du jeton, refus et erreurs, souscriptions fermées et cohérence des trois jeux gratuits. Les 15 réussissent. Le SDK, le service, les comptes, les téléchargements et les navigations sont simulés ; aucun paiement, email ou traitement de demande réel n’a été effectué.

### Vérifications de métadonnées du service

Une requête en lecture seule sur `information_schema.columns` a confirmé la présence des champs explicitement sélectionnés dans `user_settings`. Aucune ligne de suivi personnel n’a été lue ni écrite pour ce contrôle.

Le conseiller de sécurité Supabase signale quatre tables internes de facturation avec RLS activé sans politique publique (`billing_checkout_locks`, `billing_config`, `billing_customers`, `billing_events`) : leur accès client reste fermé et aucune politique n’a été ajoutée. Il signale aussi que la vérification des mots de passe compromis n’est pas activée dans la configuration d’authentification. Ce dernier réglage de service n’a pas été modifié : le connecteur disponible n’expose pas sa configuration. Il reste un point distinct de l’audit du code et des interactions, à traiter depuis les réglages d’authentification du projet. Voir la [documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).


## Complément : vérification directe après le suivi encourageant

La passe Santé du 27 octobre 2026 a durci les lanceurs DOM contre un faux succès de `spawnSync` dans un environnement qui refuse les processus enfants avec `EPERM`. Un code de sortie nul ne suffit plus : chaque groupe doit confirmer son exécution complète. Les 45 scénarios UX et les 21 nouveaux scénarios Santé ont été réexécutés groupe par groupe, tous avec succès. Les 15 autres fichiers de tests ont été exécutés directement, avec succès, dont les 10 scénarios Mouvement et les 15 scénarios Abonnement. Le compte rendu détaillé et les commandes figurent dans `HEALTH-ENCOURAGEMENT.md`. Les conclusions fonctionnelles sont ainsi confirmées par des exécutions réelles, indépendamment de l’ancien résultat du lanceur global.
