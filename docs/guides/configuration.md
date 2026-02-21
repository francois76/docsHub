# Guide de configuration

Ce guide décrit en détail toutes les options du fichier `.docshub.yml`, la configuration des variables d'environnement et la mise en place de l'authentification pour chaque plateforme Git supportée.

---

## Structure du fichier `.docshub.yml`

```yaml
# Schéma complet .docshub.yml
repos:
  - name: string            # (obligatoire) Identifiant unique du dépôt
    type: github|gitlab|bitbucket|local
                            # (obligatoire) Type de plateforme
    url: string             # URL HTTPS de clone (repos distants)
    path: string            # Chemin local ou relatif (type: local)
    docsDir: string         # Sous-dossier contenant les docs (défaut: "docs")
    defaultBranch: string   # Branche par défaut (défaut: "main")
    authMode: token|oauth   # Mode d'auth pour les revues (défaut: "token")
    token: string           # Token de service (authMode: token)
    bitbucketVariant: cloud|server
                            # Bitbucket uniquement (défaut: "cloud")

cacheDir: string            # Dossier de clonage des dépôts distants
                            # (défaut: ".docshub-cache")
```

---

## Référence des champs

### `repos[].name` *(obligatoire)*

Identifiant unique utilisé dans les URLs (`/docs/{name}/...`) et les appels API.  
Doit être unique parmi tous les dépôts configurés.

```yaml
name: mon-projet
```

---

### `repos[].type` *(obligatoire)*

| Valeur | Description |
|--------|-------------|
| `github` | Dépôt hébergé sur GitHub.com ou GitHub Enterprise |
| `gitlab` | Dépôt hébergé sur GitLab.com ou instance auto-hébergée |
| `bitbucket` | Dépôt hébergé sur Bitbucket Cloud ou Bitbucket Server/Data Center |
| `local` | Dépôt Git local, pas de clone — lecture directe |

---

### `repos[].url`

URL HTTPS de clone du dépôt. **Obligatoire** pour les types `github`, `gitlab`, `bitbucket`.  
Le token est injecté automatiquement dans l'URL à la connexion.

```yaml
url: https://github.com/mon-org/mon-projet.git
```

---

### `repos[].path`

Chemin vers le dépôt local. **Obligatoire** pour `type: local`.  
Peut être relatif à la racine du projet docsHub ou absolu.

```yaml
path: ./example          # relatif
path: /home/user/repos/mon-projet  # absolu
```

---

### `repos[].docsDir`

Sous-dossier du dépôt contenant les fichiers Markdown. Défaut : `docs`.

```yaml
docsDir: docs            # docs/ à la racine
docsDir: wiki            # wiki/ à la racine
docsDir: .               # racine du dépôt entier
```

---

### `repos[].defaultBranch`

Branche affichée par défaut lors de la navigation. Défaut : `main`.

```yaml
defaultBranch: main
defaultBranch: master
defaultBranch: develop
```

---

### `repos[].authMode`

Mode d'authentification pour les opérations de **revue de PR**. Défaut : `token`.

| Valeur | Description |
|--------|-------------|
| `token` | Service account — les commentaires sont postés avec un préfixe `[username]` |
| `oauth` | Compte utilisateur — nécessite une OAuth App configurée dans `.env.local` |

> **Note** : le mode `token` est suffisant pour lire et poster des commentaires de revue via un compte de service. Le mode `oauth` permet de poster sous l'identité de l'utilisateur connecté.

---

### `repos[].token`

Token d'accès personnel pour les opérations Git (clone/fetch) et les revues en mode `token`.

| Plateforme | Format du token |
|-----------|----------------|
| GitHub | `ghp_xxxxxxxxxxxx` (Personal Access Token, scope `repo`) |
| GitLab | Token personnel (scope `read_repository` + `api` pour les revues) |
| Bitbucket Cloud | `username:app_password` |
| Bitbucket Server | `username:personal_token` |

**Token en clair** (déconseillé — sera versionné avec `.docshub.yml`) :
```yaml
token: ghp_xxxxxxxxxxxxxxxxxxxx
```

**Token depuis une variable d'environnement** (recommandé) :
```yaml
token: $MY_GITHUB_TOKEN        # syntaxe $VAR
token: ${MY_GITHUB_TOKEN}      # syntaxe ${VAR} (équivalente)
```

La valeur est résolue au démarrage depuis `process.env`. Si la variable n'est pas définie, le champ `token` est considéré absent et l'application affiche un message d'erreur explicite.

Définissez la variable dans `.env.local` (non versionné) :
```dotenv
MY_GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

---

### `repos[].bitbucketVariant`

Pour Bitbucket uniquement. Défaut : `cloud`.

| Valeur | API utilisée |
|--------|-------------|
| `cloud` | `api.bitbucket.org/2.0` |
| `server` | `{host}/rest/api/1.0` (Bitbucket Server / Data Center) |

---

### `cacheDir`

Dossier où les dépôts distants sont clonés. Défaut : `.docshub-cache`.

```yaml
cacheDir: .docshub-cache
```

> Ce dossier est automatiquement créé s'il n'existe pas. Ajoutez-le à `.gitignore`.

---

## Exemples par plateforme

### Dépôt local

```yaml
repos:
  - name: mon-projet-local
    type: local
    path: ./example
    docsDir: docs
    defaultBranch: main
```

### GitHub (token)

```yaml
repos:
  - name: mon-projet-github
    type: github
    url: https://github.com/mon-org/mon-projet.git
    docsDir: docs
    defaultBranch: main
    authMode: token
    token: ghp_xxxxxxxxxxxxxxxxxxxx
```

### GitHub (OAuth)

```yaml
repos:
  - name: mon-projet-github
    type: github
    url: https://github.com/mon-org/mon-projet.git
    docsDir: docs
    defaultBranch: main
    authMode: oauth
```

Requis dans `.env.local` :
```
GITHUB_CLIENT_ID=Ov23...
GITHUB_CLIENT_SECRET=...
```

### GitLab (token)

```yaml
repos:
  - name: mon-projet-gitlab
    type: gitlab
    url: https://gitlab.com/mon-org/mon-projet.git
    docsDir: docs
    defaultBranch: main
    authMode: token
    token: glpat-xxxxxxxxxxxxxxxxxxxx
```

### GitLab (OAuth)

```yaml
repos:
  - name: mon-projet-gitlab
    type: gitlab
    url: https://gitlab.com/mon-org/mon-projet.git
    docsDir: docs
    defaultBranch: main
    authMode: oauth
```

Requis dans `.env.local` :
```
GITLAB_CLIENT_ID=...
GITLAB_CLIENT_SECRET=...
GITLAB_URL=https://gitlab.com   # ou URL de votre instance
```

### Bitbucket Cloud (token)

```yaml
repos:
  - name: mon-projet-bitbucket
    type: bitbucket
    bitbucketVariant: cloud
    url: https://bitbucket.org/mon-workspace/mon-projet.git
    docsDir: docs
    defaultBranch: main
    authMode: token
    token: mon-user:mon-app-password
```

### Bitbucket Server / Data Center

```yaml
repos:
  - name: mon-projet-bb-server
    type: bitbucket
    bitbucketVariant: server
    url: https://bitbucket.mon-entreprise.com/scm/projet/repo.git
    docsDir: docs
    defaultBranch: main
    authMode: token
    token: mon-user:mon-personal-token
```

---

## Variables d'environnement

Créez un fichier `.env.local` à la racine du projet (copie de `.env.local.example`) :

```bash
cp .env.local.example .env.local
```

### Obligatoire

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` | Clé secrète NextAuth.js (générer avec `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL de base de l'application (ex. `http://localhost:3000`) |

### GitHub OAuth (optionnel)

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | ID de votre OAuth App GitHub |
| `GITHUB_CLIENT_SECRET` | Secret de votre OAuth App GitHub |

### GitLab OAuth (optionnel)

| Variable | Description |
|----------|-------------|
| `GITLAB_CLIENT_ID` | ID de votre OAuth App GitLab |
| `GITLAB_CLIENT_SECRET` | Secret de votre OAuth App GitLab |
| `GITLAB_URL` | URL de votre instance GitLab (défaut: `https://gitlab.com`) |

---

## Créer un token GitHub pour les revues de PR

1. Allez sur <https://github.com/settings/tokens>
2. Cliquez **Generate new token (classic)**
3. Sélectionnez le scope **`repo`** (accès complet aux dépôts privés) ou **`public_repo`** pour les dépôts publics
4. Copiez le token généré dans `.docshub.yml` sous `token:`

---

## Créer une OAuth App GitHub

1. Allez sur <https://github.com/settings/developers> → **New OAuth App**
2. Renseignez :
   - **Homepage URL** : `http://localhost:3000`
   - **Authorization callback URL** : `http://localhost:3000/api/auth/callback/github`
3. Copiez le **Client ID** et le **Client Secret** dans `.env.local`
4. Dans `.docshub.yml`, passez les repos concernés en `authMode: oauth`
