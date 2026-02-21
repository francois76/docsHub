# Référence API

docsHub expose une API REST interne consommée par le frontend Next.js. Toutes les routes sont sous `/api/`.

---

## Repos

### `GET /api/repos`

Liste tous les dépôts configurés dans `.docshub.yml`.

**Réponse**

```json
{
  "repos": [
    {
      "name": "docshub",
      "type": "github",
      "defaultBranch": "main",
      "docsDir": "docs"
    }
  ]
}
```

---

### `GET /api/repos/[repo]/branches`

Liste toutes les branches d'un dépôt (locales + distantes, dédupliquées).

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt (encodé URI) |

**Réponse — succès**

```json
{
  "branches": [
    { "name": "main", "isRemote": false, "isCurrent": true },
    { "name": "feat/review-panel", "isRemote": true, "isCurrent": false }
  ]
}
```

**Réponse — dépôt inaccessible** (HTTP 200, `branches` vide)

```json
{
  "branches": [],
  "error": "no_token",
  "hint": "Aucun token GITHUB configuré. Ajoutez `token` dans .docshub.yml puis cliquez sur Sync."
}
```

| `error` | Cause |
|---------|-------|
| `no_token` | Dépôt distant sans token configuré |
| `not_synced` | Token présent mais dépôt pas encore cloné |
| `local_path_missing` | Chemin `path` introuvable (type: local) |
| `unexpected` | Erreur inattendue (voir `hint`) |

---

### `GET /api/repos/[repo]/tree`

Retourne l'arborescence du dossier `docs/` à une branche donnée.

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt |

**Query string**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `branch` | `string` | `main` | Branche cible |

**Réponse — succès** — structure récursive de `FileTreeNode`

```json
{
  "tree": [
    {
      "name": "README.md",
      "path": "docs/README.md",
      "type": "file"
    }
  ]
}
```

**Réponse — dépôt inaccessible** (HTTP 200, `tree` vide)

```json
{
  "tree": [],
  "error": "no_token",
  "hint": "Aucun token GITHUB configuré. Ajoutez `token` dans .docshub.yml puis cliquez sur Sync."
}
```

Mêmes codes `error` que `/branches` (voir ci-dessus).
      "path": "docs/guides",
      "type": "directory",
      "children": [
        { "name": "configuration.md", "path": "docs/guides/configuration.md", "type": "file" }
      ]
    }
  ]
}
```

---

### `GET /api/repos/[repo]/file`

Retourne le contenu brut d'un fichier à une branche et un chemin donnés.

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt |

**Query string**

| Paramètre | Obligatoire | Description |
|-----------|-------------|-------------|
| `branch` | ✅ | Branche cible |
| `path` | ✅ | Chemin relatif du fichier (ex. `docs/README.md`) |

**Réponse**

```json
{
  "content": "# docsHub\n\n...",
  "path": "docs/README.md",
  "branch": "main"
}
```

**Erreurs**

| Code | Cause |
|------|-------|
| `400` | Paramètre `path` manquant |
| `404` | Fichier ou branche introuvable |

---

### `POST /api/repos/[repo]/sync`

Déclenche un `git fetch --all --prune` (ou clone initial) pour un dépôt distant.  
Pour les dépôts locaux (`type: local`), retourne immédiatement sans action.

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt |

**Réponse — succès**

```json
{ "success": true, "message": "Repository synced" }
```

**Réponse — erreur** (HTTP 500)

```json
{
  "error": "Authentification échouée — aucun token GITHUB n'est configuré. Ajoutez `token` dans .docshub.yml.",
  "rawError": "Error: remote: Invalid username or password."
}
```

Les messages d'erreur sont traduits en langage naturel pour les cas courants :

| Pattern détecté | Message retourné |
|----------------|------------------|
| `authentication failed`, `401` | Token absent ou invalide/expiré |
| `repository not found`, `404` | URL incorrecte dans `.docshub.yml` |
| `permission denied`, `403` | Droits insuffisants sur le dépôt |
| `could not resolve host` | Problème réseau |

---

### `GET /api/repos/[repo]/[branch]/assets/[...path]`

Sert les fichiers binaires (images, PDFs…) référencés dans la documentation.  
Retourne le fichier avec le bon `Content-Type` inféré depuis l'extension.

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt |
| `branch` | `string` | Branche cible |
| `...path` | `string[]` | Chemin du fichier asset |

---

## Reviews

### `GET /api/reviews/[repo]`

Recherche la PR ouverte correspondant à la branche courante et retourne ses commentaires.

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt |

**Query string**

| Paramètre | Obligatoire | Description |
|-----------|-------------|-------------|
| `branch` | ✅ | Branche de la PR (head branch) |

**Réponse — PR trouvée**

```json
{
  "pr": {
    "id": 1,
    "number": 42,
    "title": "feat: add Mermaid support",
    "state": "open",
    "head": "feat/mermaid",
    "base": "main",
    "url": "https://github.com/org/repo/pull/42",
    "reviewState": "pending"
  },
  "comments": [
    {
      "id": "123",
      "author": "alice",
      "body": "LGTM!",
      "createdAt": "2026-02-01T10:00:00Z",
      "isOwn": false
    }
  ],
  "canReview": true
}
```

**Réponse — Pas de PR**

```json
{ "pr": null, "comments": [], "canReview": false }
```

---

### `POST /api/reviews/[repo]`

Poste une action de revue sur une PR (commentaire global, commentaire inline, approbation, demande de changements).

**Paramètres de chemin**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `repo` | `string` | Nom du dépôt |

**Corps de la requête**

```json
{
  "prNumber": 42,
  "action": "comment",
  "comment": "Super travail !",
  "filePath": "docs/README.md",
  "line": 12,
  "commitSha": "abc123"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `prNumber` | `number` | Numéro de la PR |
| `action` | `"comment" \| "approve" \| "request_changes"` | Type d'action |
| `comment` | `string?` | Corps du commentaire |
| `filePath` | `string?` | Chemin du fichier (commentaire inline uniquement) |
| `line` | `number?` | Ligne ciblée (commentaire inline uniquement) |
| `commitSha` | `string?` | SHA du commit (requis pour certains providers inline) |

**Réponse**

```json
{ "success": true }
```

**Erreurs**

| Code | Cause |
|------|-------|
| `400` | Provider de revue non disponible |
| `500` | Erreur API plateforme |

---

## Auth

### `GET/POST /api/auth/[...nextauth]`

Route NextAuth.js gérée automatiquement. Supporte :

- `GET /api/auth/session` — session courante
- `GET /api/auth/signin` — redirection vers la page de connexion
- `GET /api/auth/signout` — déconnexion
- `GET /api/auth/callback/github` — callback OAuth GitHub
- `GET /api/auth/callback/gitlab` — callback OAuth GitLab

Voir [guides/configuration.md](configuration.md#oauth) pour la configuration OAuth.
