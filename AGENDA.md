# Agenda & objectifs

Rubrique privée d’organisation générale : rendez-vous, tâches et objectifs personnels, professionnels ou de bien-être. Elle ne lit ni le journal ni les données de consommation/santé et ne dépend pas du consentement au suivi sensible.

## Intégration

```js
import {createAgenda} from './agenda-ui.mjs';

const agenda = createAgenda({
  S, accountRequest, sessionContext, sameSession,
  modal, closeModal, notify, download,
  isPremium: () => !!S.billing.premium,
  render: () => render(),
});
```

Charger `agenda.css`. La clé de page est `agenda`; `agenda.view()` renvoie la rubrique complète, avec son propre `h1`. Le service `download` suit la signature existante `(filename, text, mimeType)`.

- `agenda.load()` charge les données du compte connecté, sans option `sensitive` d’`accountRequest`. À appeler après l’identification du compte et la récupération du statut d’accès. La rubrique peut aussi charger paresseusement à sa première ouverture. La promesse renvoie `true` en cas de chargement confirmé, `false` sinon ; l’erreur s’affiche dans la rubrique.
- `agenda.reset()` invalide les requêtes en cours, vide le cache et efface tout formulaire ou liste de l’agenda dans le dialogue partagé. À appeler à chaque changement de session/déconnexion.
- `agenda.seedDemo()` réinitialise les six exemples fictifs en mémoire lorsque `S.demo` est actif. Aucun appel distant.
- `agenda.destroy()` retire les écouteurs, pour le démontage complet de l’application ou les tests.

Les événements sont délégués avec le préfixe `data-ag-*`. Les formulaires sont `agendaItemForm` et `agendaDeleteForm`. Le module capture uniquement ses propres clics et soumissions. La session et la version du formulaire sont vérifiées avant et après toute écriture ; l’interface n’affiche de succès qu’après confirmation.

## Comportements

- Vues Jour, Semaine du lundi au dimanche, et Mois avec sélection d’un jour ; navigation précédent/suivant et retour à aujourd’hui.
- Filtres par catégorie, type et statut. Les listes d’objectifs en cours et d’échéances passées permettent de rouvrir chaque élément, y compris au-delà des premières cartes.
- Rendez-vous d’une journée entière ou avec début et fin explicites, éventuellement sur plusieurs jours (durée maximale : sept jours). Une tâche ou un objectif a une échéance civile, sans heure inventée.
- Fuseau IANA enregistré sur chaque élément. Le fuseau d’affichage peut changer ; les rendez-vous se convertissent, les échéances à la journée gardent leur date.
- Une heure inexistante lors d’un changement d’heure est refusée. Une heure répétée exige un choix explicite entre les deux occurrences. Les minutes sont vérifiées dans le fuseau déclaré, y compris pour les décalages historiques avec secondes.
- Objectif : cible entière de 1 à 100 000, progression de 0 à la cible, unité facultative. Le statut « Terminé » est dérivé de la progression. Modifier la progression ou la cible permet de rouvrir un objectif.
- Titres de 120 caractères, notes de 2 000 caractères, dates de 1900 à 2199 ; erreurs liées au champ avec ARIA et conservation du brouillon en cas d’échec réseau ou de conflit.
- La création reçoit un UUID unique conservé en cas de nouvel essai après une réponse perdue. Le serveur accepte uniquement une répétition identique de cette création initiale ; il ne transforme pas un conflit en écrasement.
- L’édition et la suppression utilisent une version entière attendue. Une version ancienne provoque un conflit explicite. Aucun cache privé n’est enregistré dans le navigateur.
- La création et la modification demandent Premium, côté interface et côté serveur. La lecture, l’export et la suppression restent disponibles au propriétaire après expiration. Les exemples de démonstration restent modifiables en mémoire.

## Schéma déployé et accès serveur

`schema/agenda.sql` est la source de la migration **`20261109213640_agenda_objectives`, appliquée en production le 9 novembre 2026**. La présence de la table et des deux RPC a été vérifiée après application. Elle crée uniquement ses nouveaux objets et suit la migration fournissant `public.sobrizen_has_premium()`, sans argument, à partir des abonnements/essais/grants internes réellement validés côté serveur. Ne pas réappliquer la copie source.

La table `public.agenda_items` utilise une clé UUID et une référence `user_id → auth.users`, avec suppression en cascade du compte. Les politiques RLS imposent le propriétaire sur SELECT/DELETE ; INSERT/UPDATE imposent en plus le droit Premium. UPDATE vérifie le propriétaire dans `USING` et `WITH CHECK`. Les privilèges de table sont explicites et limités par colonne : l’utilisateur ne peut pas modifier son propriétaire, son identifiant, sa version ou les timestamps serveur.

RPC `SECURITY INVOKER`, `search_path` vide et accès `authenticated` explicite :

```text
save_agenda_item(p_id uuid, p_expected_version integer, p_payload jsonb)
  → agenda_items
delete_agenda_item(p_id uuid, p_expected_version integer)
  → uuid supprimé
```

Une version attendue nulle crée ; une version positive modifie la ligne correspondante. Le propriétaire est fourni exclusivement par `auth.uid()`. Le payload est limité à la liste de champs du domaine, et les validations SQL s’appliquent aussi aux écritures directes. La version est incrémentée par un trigger serveur. Les mutations applicatives passent par les RPC pour le contrôle optimiste ; les privilèges nécessaires à leur fonctionnement `INVOKER` restent soumis aux mêmes politiques RLS.

Les lectures sont paginées par curseur UUID et filtrées par propriétaire. Le cache refuse toute réponse ayant un autre propriétaire, une pagination incohérente ou une charge utile de sauvegarde différente de celle envoyée. Une table/RPC absente s’affiche comme une fonctionnalité non activée, sans simuler un chargement réussi.

Références Supabase consultées : [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [fonctions PostgreSQL](https://supabase.com/docs/guides/database/functions), [journal des changements](https://supabase.com/changelog.md).

## Exports et limites explicites

L’export JSON comprend toutes les lignes chargées du compte, indépendamment des filtres visibles. L’export `.ics` contient des `VEVENT` pour les rendez-vous, des `VTODO` pour les tâches/objectifs, des UID stables, les dates de modification, une classe privée et le pourcentage de progression des tâches/objectifs. Les horaires précis sont écrits en UTC ; les journées entières utilisent une fin exclusive. L’échappement des textes et le pliage UTF-8 à 75 octets empêchent la création de propriétés de calendrier par le texte d’une note.

L’import `.ics` est une copie ponctuelle : pas de synchronisation bidirectionnelle ni d’import dans SobriZen. Les applications calendrier peuvent ignorer les `VTODO`. Le JSON conserve les données exactes de progression et les catégories. Les rendez-vous utilisent le statut iCalendar `CONFIRMED`, même s’ils ont été marqués terminés dans SobriZen ; ce statut applicatif reste dans le JSON.

Les rappels sont visuels lorsque l’application est ouverte. Aucune notification push, aucun email et aucune récurrence automatique ne sont promis. Pas de partage, d’invitation à des tiers, d’édition hors ligne ni de stockage local persistant.

## Vérification locale

```sh
node --test tests/agenda-core.test.mjs tests/agenda-dom.test.mjs tests/agenda-sql.test.mjs
```

`npm ci` installe les dépendances de test épinglées ; `npm run test:agenda` configure automatiquement les harnais. Les tests DOM utilisent `jsdom@30.1.3`, chargeable aussi par `SOBRIZEN_QA_JSDOM` (fichier `lib/api.js`). Les tests SQL utilisent `@electric-sql/pglite@0.5.16`, chargeable aussi par `SOBRIZEN_QA_PGLITE`. Ce sont des dépendances de test uniquement. Sans ces dépendances, les tests concernés indiquent explicitement un saut ; les tests de domaine n’en dépendent pas. `npm test` exige les dépendances et configure toutes les variantes de variables historiques pour éviter ces sauts.

Le groupe contient 44 tests : 23 domaine/cache, 11 DOM et 10 PostgreSQL isolé. La base de test utilise deux utilisateurs synthétiques et un droit Premium contrôlé par le serveur simulé. Elle vérifie les vraies politiques RLS, privilèges, triggers et RPC du SQL versionné. Elle ne se connecte à aucun projet Supabase.

## État en production et limites de recette

La migration Agenda est appliquée et le frontend a été publié après fusion de la PR n° 1. `agenda-ui.mjs` répond HTTP 200 en production avec des octets identiques au build testé. La recette sur le site public en démonstration a vérifié les vues Jour/Semaine/Mois, la création d’un rendez-vous Pro fictif, la progression d’un objectif de 3/10 à 5/10 et les thèmes clair/sombre. Voir les captures [claire](verification/2026-11-09/agenda-production.png) et [sombre](verification/2026-11-09/agenda-sombre-production.png).

Le contenu des exports réellement téléchargés a également été vérifié : le JSON indique `demo=true` et contient les sept éléments attendus (six exemples et le rendez-vous créé). Le fichier ICS est délimité par `BEGIN:VCALENDAR` et `END:VCALENDAR` et contient trois `VEVENT`, quatre `VTODO`, le titre du rendez-vous fictif et la progression `PERCENT-COMPLETE:50`.

La recette visuelle a utilisé une fenêtre de bureau. Aucune vérification physique sur un téléphone n’est annoncée. Les interactions de démonstration restent en mémoire : elles ne constituent pas une validation de la persistance, des droits Premium ou des conflits sur un compte réel. Ces parcours authentifiés et la recette sur appareils mobiles doivent être documentés séparément. Les tests locaux ne sont pas présentés comme une preuve de migration ; la migration et la disponibilité du module ont fait l’objet des contrôles distincts décrits ci-dessus.
