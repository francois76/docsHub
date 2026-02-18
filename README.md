# docsHub

> Documentation-as-Code multi-repo platform — aggregate and browse the `docs/` folder of multiple Git repositories with branch navigation, rich Markdown rendering (Mermaid diagrams, tables, syntax highlighting) and PR review integration.

## Features

- 📁 **Multi-repo** — configure GitHub, GitLab, Bitbucket, or local repos in a single YAML file
- 🌿 **Branch navigation** — switch branches and browse any commit's documentation
- 📝 **Rich Markdown** — tables, images, fenced code blocks with VS Code-quality syntax highlighting (Shiki)
- 🧜 **Mermaid diagrams** — flowcharts, sequence diagrams, ER diagrams rendered client-side
- 🔍 **File tree sidebar** — collapsible tree view of the `docs/` directory
- 💬 **PR Reviews** — list comments, add global/inline comments, approve, request changes
- 🔐 **Dual auth** — OAuth (GitHub/GitLab) or service token with `[Username]` prefix
- 🔄 **Manual sync** — sync button to pull latest from remote repos

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/docshub.git
cd docshub
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local and set NEXTAUTH_SECRET at minimum
```

### 3. Configure repositories

Edit `.docshub.yml` at the project root:

```yaml
repos:
  # Local example (included — works out of the box)
  - name: example
    type: local
    path: ./example
    docsDir: docs
    defaultBranch: main

  # Add your own GitHub repo:
  - name: my-project
    type: github
    url: https://github.com/your-org/your-project.git
    docsDir: docs
    defaultBranch: main
    authMode: token
    token: ghp_your_personal_access_token
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the first configured repository.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── repos/               # Git API routes (list, branches, tree, file, sync)
│   │   ├── reviews/             # PR review API routes
│   │   └── auth/                # NextAuth.js route
│   ├── auth/signin/             # Sign-in page
│   └── docs/[repo]/[branch]/    # Document viewer pages
├── components/
│   ├── docs/
│   │   ├── MarkdownViewer.tsx   # HTML renderer + Mermaid portal injection
│   │   ├── MermaidDiagram.tsx   # Mermaid client-side renderer
│   │   └── ReviewPanel.tsx      # PR review sidebar
│   ├── layout/
│   │   ├── TopBar.tsx           # Repo/branch selectors + sync button
│   │   └── DocsSidebar.tsx      # File tree
│   ├── providers/
│   │   └── AuthProvider.tsx     # NextAuth SessionProvider
│   └── ui/                      # shadcn/ui-style components
├── lib/
│   ├── config.ts                # .docshub.yml parser
│   ├── git-service.ts           # simple-git wrapper
│   ├── git-registry.ts          # GitService instance registry
│   ├── markdown.ts              # markdown-it + Shiki renderer
│   ├── auth.ts                  # NextAuth options
│   └── review/                  # ReviewProvider implementations
│       ├── types.ts
│       ├── github-provider.ts
│       ├── gitlab-provider.ts
│       ├── bitbucket-provider.ts
│       └── index.ts
└── types/
    ├── config.ts
    └── git.ts

example/                          # Local Git repo for testing (gitignored)
└── docs/
    ├── README.md
    ├── architecture.md           # Mermaid diagrams
    ├── api-reference.md          # Tables
    └── guides/
        ├── deployment.md
        └── configuration.md
```

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Markdown | markdown-it |
| Syntax highlighting | Shiki |
| Diagrams | Mermaid (client-side) |
| Git operations | simple-git |
| Auth | NextAuth.js |
| UI | shadcn/ui + Tailwind CSS |
| Config | YAML (.docshub.yml) |

## Adding a GitHub Repo for PR Review Testing

1. Create a Personal Access Token at <https://github.com/settings/tokens> with `repo` scope
2. Add the repo to `.docshub.yml` with `authMode: token` and your token
3. Open a PR on a non-default branch
4. In docsHub, select that branch — the Review Panel will appear on the right

For OAuth-based reviews (reviews posted under your own account):

1. Create a GitHub OAuth App at <https://github.com/settings/developers>
2. Set `Homepage URL` and `Callback URL` to `http://localhost:3000`
3. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env.local`
4. Set `authMode: oauth` in `.docshub.yml`
5. Click "Sign In" in the Review Panel

## Configuration Reference

See [example/docs/guides/configuration.md](example/docs/guides/configuration.md) or browse it in the app.
