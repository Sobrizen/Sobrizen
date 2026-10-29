# Formulaires : explications courtes et pseudo simplifié

## Retour au bon endroit

`form-validation.mjs` est initialisé dans l’application et sur la page d’abonnement. Il écoute la validation native en capture, y compris pour les formulaires créés après l’ouverture d’une fenêtre. Une erreur donne un texte bref en français près du champ, relié par `aria-describedby` et `aria-errormessage`. Le premier champ concerné reçoit le focus ; les sections `<details>` nécessaires sont ouvertes. Les erreurs ne reposent pas uniquement sur une couleur ou une bulle du navigateur.

Les contraintes requises, emails, dates, limites numériques, pas, longueurs et messages personnalisés sont expliquées. Les champs texte obligatoires remplis seulement d’espaces sont refusés. Les messages sont réévalués ou retirés après correction ; les indications d’accessibilité et validations appartenant aux contrôleurs sont conservées. Réinitialiser ou retirer un formulaire nettoie ses messages. Les valeurs saisies ne sont ni journalisées ni envoyées par ce module.

Les formulaires en plusieurs étapes gardent leur propre navigation et la validation de l’étape courante. Les erreurs métier du point quotidien et du calculateur sont rattachées aux champs concernés. Les problèmes de réseau ou de service restent expliqués dans le formulaire sans effacer le brouillon. Un message local n’est pas remplacé par « hors connexion » lorsque la démonstration fonctionne sans réseau.

Les cases de consentement et de partage ont une explication adaptée à leur action. Les messages ne cochent pas ces cases et ne modifient pas les conditions d’accès ou de paiement.

## Pseudo

La consigne affichée est : **3 à 30 caractères, avec mise en forme automatique**. `username.mjs` accepte une saisie courante comme `Élan Zen`, `Sarah-2026` ou `@Alex` et produit respectivement `elan_zen`, `sarah_2026` et `alex`. Les espaces et tirets deviennent des tirets bas, les majuscules deviennent des minuscules, les accents sont retirés et les ligatures françaises sont adaptées. Les points et tirets bas déjà utilisés sont conservés.

Un aperçu montre le pseudo final. La mise en forme intervient à la sortie du champ ou à l’enregistrement, sans déplacer le curseur pendant la saisie. Les caractères non pris en charge sont expliqués ; aucun pseudo n’est tronqué silencieusement. La longueur porte sur le résultat final.

Le stockage continue de respecter `^[a-z0-9_.]{3,30}$` et l’unicité imposée par la base. Une collision donne « Ce pseudo est déjà pris. Essaie un autre nom ou ajoute un chiffre. » à côté du champ. Aucune disponibilité n’est promise avant la réponse serveur.

À l’inscription, le champ anciennement nommé « Pseudo public » est clarifié en **Nom affiché · facultatif**. Il garde ses 40 caractères libres ; le véritable `@pseudo` se choisit dans Mon profil. Les mots de passe conservent leur minimum de 10 caractères, indiqué près du champ lors de leur création.

## Vérification

- `tests/username.test.mjs` : normalisation, formats historiques, caractères et limites.
- `tests/form-validation-dom.test.mjs` : explications natives, correction, liens ARIA, focus, champs dynamiques et nettoyage.
- `tests/app-form-feedback.test.mjs` : application réelle, pseudo, doublon serveur, téléphone, mots de passe, email et erreurs de service.
- `tests/amount-form-feedback-dom.test.mjs` : point quotidien et calculateur de consommation.
- `tests/guided-form-feedback.test.mjs` : étapes du suivi, notes, partage et dates de ressentis dans l’application intégrée.
- `tests/subscription-dom.test.mjs` : même module dans la page d’abonnement et maintien des contrôles de session/paiement.

Les services de ces tests sont simulés. La vérification visuelle en ligne utilise uniquement la démonstration ou des formulaires non soumis ; aucune publication, demande au support ou opération de paiement réelle n’est créée pour tester ces changements.
