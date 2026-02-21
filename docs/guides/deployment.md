# Guide de déploiement

Ce guide couvre le déploiement de docsHub en production sur Vercel (recommandé), sur un serveur Node.js autonome, ou via Docker.

---

## Pré-requis

- Node.js ≥ 18
- npm ≥ 9
- Accès en lecture aux dépôts Git à intégrer
- Un `NEXTAUTH_SECRET` généré (`openssl rand -base64 32`)

---

## Variables d'environnement

Toutes les variables sont à définir dans `.env.local` (développement) ou dans les settings de votre hébergeur (production).

### Obligatoires

| Variable | Exemple | Description |
|----------|---------|-------------|
| `NEXTAUTH_SECRET` | `s3cr3t...` | Clé de chiffrement des sessions NextAuth.js |
| `NEXTAUTH_URL` | `https://docshub.mondomaine.com` | URL publique de l'application |

### OAuth GitHub (si authMode: oauth sur un repo GitHub)

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | Client ID de l'OAuth App GitHub |
| `GITHUB_CLIENT_SECRET` | Client Secret de l'OAuth App GitHub |

### OAuth GitLab (si authMode: oauth sur un repo GitLab)

| Variable | Description |
|----------|-------------|
| `GITLAB_CLIENT_ID` | Client ID de l'OAuth App GitLab |
| `GITLAB_CLIENT_SECRET` | Client Secret de l'OAuth App GitLab |
| `GITLAB_URL` | URL de l'instance GitLab (défaut: `https://gitlab.com`) |

---

## Déploiement sur Vercel (recommandé)

### 1. Importer le projet

1. Connectez-vous sur [vercel.com](https://vercel.com)
2. Cliquez **New Project** → importez votre fork depuis GitHub
3. Vercel détecte automatiquement Next.js

### 2. Configurer les variables d'environnement

Dans **Settings → Environment Variables**, ajoutez :

```
NEXTAUTH_SECRET   = <votre secret>
NEXTAUTH_URL      = https://votre-projet.vercel.app
# + GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET si OAuth
```

### 3. Configurer `.docshub.yml`

> **Important** : sur Vercel, le système de fichiers est en lecture seule et éphémère. Les dépôts distants **ne peuvent pas être clonés** dans `cacheDir`.  
> 
> **Solution** : utilisez uniquement `type: local` avec des chemins relatifs inclus dans le dépôt, ou hébergez docsHub sur un serveur avec système de fichiers persistant.

### 4. Déployer

```bash
vercel --prod
```

---

## Déploiement sur serveur Node.js

### 1. Build de production

```bash
npm run build
```

### 2. Lancer le serveur

```bash
npm start
# ou avec PM2 :
pm2 start npm --name docshub -- start
```

### 3. Reverse proxy (nginx)

Exemple de configuration nginx :

```nginx
server {
    listen 80;
    server_name docshub.mondomaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Avec SSL (certbot) :

```bash
certbot --nginx -d docshub.mondomaine.com
```

### 4. Variables d'environnement

Créez `.env.local` dans le répertoire du projet déployé, ou exportez les variables dans l'environnement :

```bash
export NEXTAUTH_SECRET="..."
export NEXTAUTH_URL="https://docshub.mondomaine.com"
npm start
```

---

## Déploiement Docker

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Dossier pour les dépôts clonés (à monter en volume)
RUN mkdir -p .docshub-cache

EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: "3.9"
services:
  docshub:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./docshub-cache:/app/.docshub-cache
      - ./.docshub.yml:/app/.docshub.yml:ro
    environment:
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
```

```bash
docker compose up -d
```

---

## Checklist de mise en production

- [ ] `NEXTAUTH_SECRET` généré et sécurisé (`openssl rand -base64 32`)
- [ ] `NEXTAUTH_URL` pointant vers l'URL publique finale
- [ ] OAuth App créée avec le bon **callback URL** (`https://votre-domaine.com/api/auth/callback/github`)
- [ ] `.docshub.yml` commité (sans tokens — utiliser des variables d'environnement ou des secrets)
- [ ] `cacheDir` monté sur un volume persistant (si dépôts distants)
- [ ] `cacheDir` ajouté à `.gitignore`
- [ ] Reverse proxy configuré avec HTTPS

---

## Considérations de sécurité

### Tokens dans `.docshub.yml`

**Ne commitez jamais** de tokens dans `.docshub.yml`. Préférez les injecter via des variables d'environnement et les référencer dynamiquement, ou utilisez un système de secrets (Vercel Secrets, GitHub Actions Secrets, HashiCorp Vault…).

### `NEXTAUTH_SECRET`

Doit être différent entre environnements (dev, staging, prod). Renouvelez-le si vous suspectez une compromission — cela invalide toutes les sessions actives.

### Accès en lecture seule

Si possible, utilisez des tokens avec le minimum de permissions nécessaires :
- GitHub : scope `repo:read` pour la lecture seule, `repo` pour les revues
- GitLab : scope `read_repository` pour la lecture, `api` pour les revues
