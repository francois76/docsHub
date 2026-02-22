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
    BL --> DS["DocsSidebar\n(file tree)"]
    BL --> RP["ReviewProvider\n(contexte React — état revue)"]

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
        Review->>Review: Ajoute boutons "+" dans le gutter (type=button, data-line=X)
        Review->>Review: Insère commentaires inline (DOM)
        Note over Review: Le formulaire de commentaire<br/>est un React portal<br/>Fermeture : Échap, Annuler ou clic sur "+"
        Note over Review: Quand un form est ouvert :<br/>tous les "+" restent visibles (CSS class)<br/>le bouton actif est mis en évidence
    end
```

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
