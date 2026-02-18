# docsHub — Documentation-as-Code Multi-Repo Platform

Application web permettant d'agréger et afficher la documentation (dossier `docs/`) de plusieurs repos Git (GitHub, GitLab, Bitbucket, local), avec navigation par branche, rendu Markdown enrichi (Mermaid, tableaux, images) et review de PR synchronisée avec la plateforme Git source.

## Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Framework | **Next.js** (App Router) | SSR, API routes, routing fichier, écosystème React |
| Markdown | **markdown-it** + plugins GFM | Rapide, tables/images natifs, plugin API simple |
| Diagrammes | **Mermaid** (rendu client direct) | Plugins tiers obsolètes ; appel `mermaid.run()` sur les blocs ` ```mermaid ` |
| Coloration syntaxique | **Shiki** | Qualité VS Code, support large de langages |
| Git serveur | **simple-git** | API riche (branches, diff, tree), 10M+ téléchargements/semaine |
| APIs plateformes | REST direct via un adapter pattern (`ReviewProvider`) | Interface unifiée GitHub / GitLab / Bitbucket |
| Auth | **NextAuth.js** | OAuth GitHub/GitLab/Bitbucket en une seule lib |
| UI | **shadcn/ui** + **Tailwind CSS** | Composants accessibles, sidebar / tree view prêts à l'emploi |
| Config | **YAML** (`.docshub.yml` à la racine du projet) | Lisible, déclaratif |

## Steps

### 1. Initialiser le projet Next.js + config

Créer l'app Next.js avec TypeScript, Tailwind, shadcn/ui. Définir le schéma du fichier de configuration `.docshub.yml` (liste de serveurs Git, repos, type de plateforme, token/auth). Ajouter un parser YAML (lib `yaml`) pour le charger au démarrage.

### 2. Implémenter le service Git serveur (simple-git)

Créer un service `GitService` qui clone/pull les repos configurés dans un répertoire local de cache, expose les opérations : lister les branches (`git branch -r`), lire l'arborescence du dossier `docs/`, lire le contenu d'un fichier à une branche donnée (`git show branch:path`). Gérer aussi le cas "repo local" (pas de clone, lecture directe). Exposer le tout via des API Routes Next.js.

### 3. Construire le layout IHM (sidebar + viewer)

Layout avec : un **sélecteur de projet** (dropdown des repos configurés), un **sélecteur de branche** (select en haut de page alimenté par `GitService`), une **sidebar arborescente** (composant tree view shadcn/ui affichant le contenu récursif de `docs/`), et un **panneau principal** pour le rendu du document sélectionné. Le routing sera de la forme `/docs/[repo]/[branch]/[...path]`.

### 4. Intégrer le rendu Markdown enrichi

Configurer `markdown-it` avec les plugins : GFM (tables, strikethrough), images (chemins relatifs résolus vers le repo), coloration syntaxique via Shiki, et rendu Mermaid client-side (détecter les blocs ` ```mermaid ` dans le HTML rendu, puis appeler `mermaid.run()` côté client via un composant React `useEffect`).

### 5. Implémenter le système de review de PR

Créer une interface `ReviewProvider` avec implémentations pour GitHub, GitLab et Bitbucket (lister commentaires, ajouter un commentaire inline/global, approuver, request changes). Deux modes d'auth :

1. **OAuth personnel** — l'utilisateur se connecte via NextAuth sur la plateforme, les reviews sont portées par son compte.
2. **Token de service** — un token configuré dans `.docshub.yml` porte les reviews, chaque commentaire est préfixé par `[Nom User] : ...`.

Côté IHM : quand on est sur une branche != main, afficher un panneau de review à droite du document avec possibilité de commenter des lignes et de soumettre une review.

### 6. Créer le dossier d'exemple local

Ajouter un dossier `example/` (gitignored) contenant un repo Git local initialisé avec un dossier `docs/` incluant : un fichier Markdown avec des diagrammes Mermaid, un avec des tableaux, un avec des images, et une arborescence de sous-dossiers. Ajouter un `.docshub.yml` d'exemple pointant vers ce repo local. Documenter dans le README comment lancer le projet et ajouter ses propres repos GitHub pour tester la review.

## Further Considerations

### Synchronisation des repos

Faut-il un polling périodique (cron/intervalle), un webhook, ou un refresh manuel à la demande ? Je recommande un refresh à la demande + un bouton "sync" dans l'IHM pour commencer, avec possibilité d'ajouter des webhooks plus tard.

### Gestion des images dans le Markdown

Les images référencées en chemin relatif dans `docs/` devront être servies via une API Route qui les lit depuis le repo cloné (`/api/repos/[repo]/[branch]/assets/[...path]`). Valider que c'est suffisant ou s'il faut supporter des images externes aussi.

### Scope initial de la review

Souhaites-tu que la review permette uniquement des commentaires globaux sur le fichier, ou aussi des commentaires inline (sur une ligne précise du Markdown) ? Les commentaires inline nécessitent un composant plus complexe (diff viewer ou annotation sur le rendu).
