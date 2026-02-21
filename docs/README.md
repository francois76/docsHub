# docsHub

> **Documentation-as-Code multi-repo platform** — agrège et expose le dossier `docs/` de plusieurs dépôts Git en offrant navigation par branche, rendu Markdown riche (diagrammes Mermaid, tableaux, coloration syntaxique) et intégration de revues de PR.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 📁 **Multi-repo** | GitHub, GitLab, Bitbucket et dépôts locaux depuis un seul fichier YAML |
| 🌿 **Navigation par branche** | Changer de branche et consulter la doc à n'importe quel commit |
| 📝 **Markdown riche** | Tables, images, code fencé avec coloration Shiki (qualité VS Code) |
| 🧜 **Diagrammes Mermaid** | Flowcharts, séquences, ER — rendus côté client |
| 🔍 **Arborescence sidebar** | Vue en arbre collapsible du dossier `docs/` |
| 💬 **Revues de PR** | Lister, poster des commentaires globaux/inline, approuver, demander des changements |
| 🔐 **Double auth** | OAuth (GitHub/GitLab) ou service token avec préfixe `[Username]` |
| 🔄 **Sync manuelle** | Bouton sync pour récupérer le dernier état des dépôts distants |

---

## Démarrage rapide

### 1. Cloner et installer

```bash
git clone https://github.com/francois76/docsHub.git
cd docsHub
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.local.example .env.local
# Éditez .env.local — NEXTAUTH_SECRET est le seul champ obligatoire
```

Voir [guides/deployment.md](guides/deployment.md) pour la liste complète des variables.

### 3. Configurer les dépôts

Éditez `.docshub.yml` à la racine du projet :

```yaml
repos:
  # Dépôt local inclus — fonctionne sans configuration
  - name: example
    type: local
    path: ./example
    docsDir: docs
    defaultBranch: main

  # Dépôt GitHub avec token
  - name: mon-projet
    type: github
    url: https://github.com/mon-org/mon-projet.git
    docsDir: docs
    defaultBranch: main
    authMode: token
    token: ghp_mon_token
```

Voir [guides/configuration.md](guides/configuration.md) pour la référence complète.

### 4. Lancer le serveur de développement

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) — vous serez redirigé vers le premier dépôt configuré.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | Next.js 15 (App Router) |
| Rendu Markdown | markdown-it |
| Coloration syntaxique | Shiki |
| Diagrammes | Mermaid (client-side) |
| Opérations Git | simple-git |
| Authentification | NextAuth.js |
| UI | shadcn/ui + Tailwind CSS |
| Configuration | YAML (`.docshub.yml`) |

---

## Structure du projet

```
src/
├── app/
│   ├── api/
│   │   ├── repos/               # Routes Git (list, branches, tree, file, sync)
│   │   ├── reviews/             # Routes revue de PR
│   │   └── auth/                # Route NextAuth.js
│   ├── auth/signin/             # Page de connexion
│   └── docs/[repo]/[branch]/    # Pages du visualiseur de docs
├── components/
│   ├── docs/
│   │   ├── MarkdownViewer.tsx   # Rendu HTML + injection Mermaid
│   │   ├── MermaidDiagram.tsx   # Renderer Mermaid côté client
│   │   └── ReviewPanel.tsx      # Sidebar de revue de PR
│   ├── layout/
│   │   ├── TopBar.tsx           # Sélecteurs repo/branche + bouton sync
│   │   └── DocsSidebar.tsx      # Arborescence des fichiers
│   ├── providers/
│   │   └── AuthProvider.tsx     # NextAuth SessionProvider
│   └── ui/                      # Composants shadcn/ui
├── lib/
│   ├── config.ts                # Parser .docshub.yml
│   ├── git-service.ts           # Wrapper simple-git
│   ├── git-registry.ts          # Registre des instances GitService
│   ├── markdown.ts              # Renderer markdown-it + Shiki
│   ├── auth.ts                  # Options NextAuth
│   └── review/                  # Implémentations ReviewProvider
│       ├── types.ts             # Interface ReviewProvider
│       ├── github-provider.ts
│       ├── gitlab-provider.ts
│       ├── bitbucket-provider.ts
│       └── index.ts             # Factory de providers
└── types/
    ├── config.ts                # Types pour .docshub.yml
    └── git.ts                   # Types FileTreeNode, BranchInfo
```

---

## Liens utiles

- [Architecture détaillée](architecture.md)
- [Référence API](api-reference.md)
- [Guide de configuration](guides/configuration.md)
- [Guide de déploiement](guides/deployment.md)
