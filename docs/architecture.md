# Architecture de docsHub

Ce document décrit l'architecture interne de docsHub : flux de données, composants clés, gestion de l'authentification et intégration des revues de PR.

---

## Vue d'ensemble

```mermaid
flowchart TD
    subgraph Client["Navigateur"]
        UI["Pages Next.js\n(App Router)"]
        MD["MarkdownViewer\n(markdown-it + Shiki)"]
        MM["MermaidDiagram\n(client-side)"]
        RP["ReviewPanel"]
    end

    subgraph Server["Serveur Next.js"]
        CFG["config.ts\n(.docshub.yml)"]
        REG["git-registry.ts\n(instances GitService)"]
        GS["GitService\n(simple-git)"]
        MK["markdown.ts\n(renderer)"]
        AUTH["auth.ts\n(NextAuth.js)"]
        subgraph API["Routes API"]
            AR["/api/repos"]
            ABR["/api/repos/[repo]/branches"]
            ATR["/api/repos/[repo]/tree"]
            AF["/api/repos/[repo]/file"]
            AH["/api/repos/[repo]/headings"]
            AS["/api/repos/[repo]/sync"]
            AAS["/api/repos/[repo]/[branch]/assets/[...path]"]
            ARV["/api/reviews/[repo]"]
        end
    end

    subgraph Git["Sources Git"]
        GH["GitHub"]
        GL["GitLab"]
        BB["Bitbucket"]
        LOC["Dépôt local"]
    end

    UI -->|fetch| API
    API --> CFG
    API --> REG
    REG --> GS
    GS -->|clone/pull| GH
    GS -->|clone/pull| GL
    GS -->|clone/pull| BB
    GS -->|read| LOC
    AF -->|contenu brut| MK
    MK -->|HTML| UI
    UI --> MD
    MD -->|portail Mermaid| MM
    ARV --> AUTH
    AUTH -->|token/OAuth| GH
    AUTH -->|token/OAuth| GL
    AUTH -->|token| BB
    UI --> RP
    RP -->|POST /api/reviews| ARV
```

---

## Flux de navigation d'un fichier Markdown

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant Page as "docs/[repo]/[branch]/[...path]"
    participant API as "/api/repos/[repo]/file"
    participant GS as GitService
    participant MD as markdown.ts
    participant GIT as Dépôt Git (cache)

    User->>Page: Sélectionne un fichier dans le sidebar
    Page->>API: GET ?branch=main&path=docs/README.md
    API->>GS: getFileContent(branch, path)
    GS->>GIT: git show branch:path
    GIT-->>GS: Contenu Markdown brut
    GS-->>API: string
    API->>MD: renderMarkdown(content)
    MD-->>API: HTML sécurisé
    API-->>Page: { html, raw }
    Page->>User: Affiche le rendu avec MarkdownViewer
```

---

## Arborescence des composants React

```mermaid
graph TD
    LP["layout.tsx\n(root layout)"] --> AP["AuthProvider"]
    AP --> BL["[branch]/layout.tsx"]
    BL --> TB["TopBar\n(repo + branch selectors, sync,\nbarre de progression, modal erreur)"]
    BL --> RP["ReviewProvider\n(contexte React — état revue)"]

    RP --> DS["DocsSidebar\n(tree + titres H1-H3\n+ badges commentaires)"]
    RP --> MAIN["main (zone de contenu)"]
    RP --> RB["ReviewBar\n(barre de revue en bas)"]

    MAIN --> CP["[...path]/page.tsx\n(page principale)"]
    CP --> MV["MarkdownViewer"]
    MV --> MC["MarkdownContent\n(React.memo —\ndangerouslySetInnerHTML)"]
    MV --> MMD["Mermaid\n(client-side rendering)"]
    MV --> IC["Commentaires inline\n(DOM manipulation + portals)"]

    TB -->|GET /api/repos| API1["API: liste des repos"]
    TB -->|"GET /api/repos/{repo}/branches"| API2["API: branches"]
    TB -->|"POST /api/repos/{repo}/sync"| API3["API: sync"]
    DS -->|"GET /api/repos/{repo}/tree"| API4["API: file tree"]
    DS -->|"GET /api/repos/{repo}/headings"| API6["API: headings batch"]
    RP -->|"GET+POST /api/reviews/{repo}"| API5["API: reviews"]
```

---

## Gestion de l'authentification

docsHub supporte deux modes d'authentification, configurables **par dépôt** dans `.docshub.yml`.

L'interface s'adapte automatiquement au mode choisi :
- **`authMode: token`** → aucun bouton de connexion ; toutes les opérations (clone, revue) utilisent le token de service.
- **`authMode: oauth`** → la `ReviewBar` affiche un bouton « Se connecter avec GitHub / GitLab » spécifique au type du dépôt sélectionné. La page de connexion filtre aussi les providers par projet.

Les providers OAuth ne sont enregistrés dans NextAuth que si les variables `*_CLIENT_ID` et `*_CLIENT_SECRET` sont renseignées.

```mermaid
flowchart LR
    subgraph Modes["authMode"]
        TK["token\n(service account)"]
        OA["oauth\n(compte utilisateur)"]
    end

    subgraph Usage["Usage"]
        CLONE["Clone/fetch\n(simple-git)"]
        REVIEW["Revues de PR\n(API REST plateforme)"]
    end

    TK -->|URL avec credentials| CLONE
    TK -->|Authorization: token| REVIEW
    OA -->|NextAuth session| REVIEW
    OA -->|token session| REVIEW

    note1["Pour GitHub OAuth :\nGITHUB_CLIENT_ID\nGITHUB_CLIENT_SECRET"]
    note2["Pour token :\nghp_xxxxx\nou username:password"]
```

### Règles par plateforme

| Plateforme | Clone (token) | Revue (token) | Revue (OAuth) |
|-----------|--------------|---------------|---------------|
| GitHub | `https://x-access-token:{token}@github.com/…` | `Authorization: token {token}` | Session NextAuth → `Authorization: token {session.token}` |
| GitLab | `https://oauth2:{token}@gitlab.com/…` | `Authorization: Bearer {token}` | Session NextAuth → `Authorization: Bearer {session.token}` |
| Bitbucket Cloud | `https://{user}:{token}@bitbucket.org/…` | `Authorization: Basic base64(user:token)` | Non supporté |

---

## Registre des instances GitService

`git-registry.ts` maintient un singleton par dépôt pour éviter les opérations Git concurrentes :

```mermaid
flowchart LR
    A["Route API"] -->|"getGitService(name)"| R["git-registry.ts\n(Map: name → GitService)"]
    R -->|new si absent| G["GitService\n(simple-git)"]
    G -->|repoPath| C[".docshub-cache/{name}"]
```

---

## Rendu Markdown et Mermaid

Le pipeline de rendu fonctionne en deux phases :

```mermaid
sequenceDiagram
    participant Server as Serveur (markdown.ts)
    participant Client as Client (MarkdownViewer)
    participant Mermaid as Mermaid (client-side)
    participant Review as Review (inline)

    Server->>Server: markdown-it.render(raw)
    Note over Server: Plugin source_lines :<br/>ajoute data-source-line-start/end<br/>sur chaque bloc
    Note over Server: Les blocs mermaid → div.mermaid-raw
    Server->>Server: Shiki colore les autres blocs de code
    Server-->>Client: HTML complet (avec attributs de ligne)

    Client->>Client: MarkdownContent (React.memo)<br/>dangerouslySetInnerHTML
    Note over Client: Le memo empêche React de<br/>réinitialiser innerHTML lors<br/>des changements d'état internes
    Client->>Client: Détecte .mermaid-raw dans le DOM
    Client->>Mermaid: import("mermaid") + render
    Mermaid-->>Client: SVG injecté

    alt PR ouverte
        Client->>Review: Scan [data-source-line-start] (enfants directs)
        Review->>Review: Un seul bouton "+" par bloc (prepend, position absolute left:-2rem)
        Note over Review: Blocs sans table/code (data-fine-grained absent) :<br/>bouton visible via CSS au hover du bloc entier<br/>Tableaux/code (data-fine-grained=true) :<br/>JS mouseover repositionne le bouton sur la ligne survolée<br/>et ajoute .review-line-plus--row-hover → un seul bouton visible
        Review->>Review: Commentaires insérés AVANT le bloc (.inline-comments-group--collapsed)
        Review->>Review: Clic "+" → toggle collapsed + ouvre formulaire AVANT le bloc (portal React)
        Note over Review: Contournement API GitHub :<br/>fallback = issue comment avec<br/><!-- docshub:path=… --> + <!-- docshub:line=N -->.<br/>listComments() extrait les marqueurs depuis<br/>les issue comments pour rétablir path + line.<br/>(visible immédiatement et sur F5)
    end
```

---

## Optimisations de performance (Vercel React Best Practices)

Les règles ci-dessous ont été appliquées sur l'ensemble de la codebase (`vercel-react-best-practices` v1.0.0, février 2026).

| Règle | Fichier(s) | Description |
|-------|-----------|-------------|
| **bundle-barrel-imports** | `next.config.js` | `optimizePackageImports: ["lucide-react"]` transforme automatiquement les imports nommés en imports directs à la compilation, évitant le chargement des ~1 500 modules de la lib |
| **async-defer-await** + **async-api-routes** | `api/repos/[repo]/sync/route.ts` | La `Promise` de config est démarrée avant le `try` et réutilisée dans le `catch` (sans second fetch) ; `repoConfig` n'est plus récupéré inutilement dans le chemin de succès |
| **rendering-animate-svg-wrapper** | `TopBar.tsx` | La classe `animate-spin` est appliquée sur un `<div>` wrapper plutôt que directement sur le SVG `<RefreshCw>`, permettant l'accélération GPU |
| **js-hoist-regexp** | `[...path]/page.tsx` | La regex `/\.(md\|mdx\|markdown)$/i` est hoistée au niveau module pour éviter sa recréation à chaque appel |
| **js-tosorted-immutable** | `git-service.ts`, `github-provider.ts`, `gitlab-provider.ts`, `bitbucket-provider.ts` | Remplacement de `.sort()` (mutation in-place) par `.toSorted()` (immutable), ce qui protège les arrays partagés de mutations silencieuses |
| **rerender-lazy-state-init** | `DocsSidebar.tsx` → `TreeNode`, `H2Group`, `FileNode` | `useState(() => ...)` — les initialiseurs de lazy state évitent les calculs coûteux (traversée d'arbre, état actif) à chaque re-render |
| **advanced-event-handler-refs** | `MarkdownViewer.tsx` → `InlineCommentWidget`, `ConfirmModal` | Handlers `keydown` (touche Escape) stockés dans une `ref` : la souscription est stable, plus de `eslint-disable-next-line`, plus de risque de stale closure |
| **rendering-conditional-render** | `MarkdownViewer.tsx` | Remplacement du `&&`-chain incluant `filePath` (string pouvant être `""`) par un ternaire explicite `? createPortal(...) : null` |

---

## Navigation par titres dans la sidebar

`DocsSidebar` offre une navigation arborescente enrichie pour les fichiers Markdown :

1. **Titre H1 comme libellé** — si le fichier a un titre de niveau 1, il remplace le nom du fichier dans la sidebar.
2. **Arbre H2 / H3** — chaque fichier dispose d'un chevron permettant de déplier ses titres de niveau 2 et 3. Le fichier actif se déplie automatiquement.
3. **Navigation par ancre** — cliquer sur un titre H2 ou H3 :
   - si le fichier est déjà ouvert → scroll smooth vers l'ancre (`document.getElementById(slug).scrollIntoView`)
   - sinon → navigation vers `<href>#<slug>` (le slug est généré de manière compatible GitHub)
4. **Badges de commentaires (revue)** — quand une PR est ouverte, un badge `<MessageSquare count>` apparaît à côté de chaque item :
   - **Fichier** : total des commentaires pour ce fichier
   - **H2** : commentaires dont la ligne source appartient à la section H2 (inclut les H3 sous-jacents)
   - **H3** : commentaires dont la ligne source appartient à la section H3

L'algorithme d'agrégation des commentaires parcourt les titres à rebours depuis la ligne du commentaire pour identifier le titre le plus proche et ses ancêtres (même logique que la détection de section GitHub).

### API `/api/repos/[repo]/headings`

`GET /api/repos/[repo]/headings?branch=<b>&paths=<p1,p2,...>`

Retourne `{ headings: { "<path>": HeadingInfo[] } }` pour un batch de fichiers Markdown. Les slugs générés utilisent la même fonction `slugifyHeading` que le renderer `markdown-it`, garantissant la cohérence des ancres HTML et des liens sidebar.

---

## Cycle de vie d'un dépôt distant

```mermaid
stateDiagram-v2
    [*] --> Absent: Premier accès

    Absent --> Clonage: sync() appelé\n(GitService.sync)
    Clonage --> Disponible: clone réussi
    Clonage --> Erreur: clone échoué\n(auth, réseau, URL)

    Erreur --> Clonage: Bouton sync\n(après correction config)

    Disponible --> Synchronisation: Bouton sync\nou accès après TTL
    Synchronisation --> Disponible: fetch --all --prune
    Synchronisation --> Erreur: fetch échoué

    Disponible --> Lecture: Requête API\n(branches, tree, file)
    Lecture --> Disponible: Réponse retournée

    note right of Erreur
        L'API retourne { error, hint }\nL'IHM affiche un message lisible\n(icône ⚠️ + modal de sync)
    end note
```
