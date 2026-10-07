# Photo Platform

Première version exécutable d’une plateforme photo avec frontend et backend séparés, communication REST et stockage local sécurisé.

## Structure

- `/frontend` : application React + Vite
- `/backend` : API Node.js + Express + SQLite

## Prérequis

- Node.js 20+
- npm 10+

## Installation

### 1) Backend

```bash
cd /home/runner/work/photo-platform/photo-platform/backend
cp .env.example .env
npm install
npm run migrate
npm run init:admin
```

Variables backend (`backend/.env`):

- `PORT` (défaut `3000`)
- `DATABASE_URL` (défaut `./data.sqlite`)
- `SESSION_SECRET` (**obligatoire**)
- `FRONTEND_URL` (défaut `http://localhost:5173`)
- `PICTURES_DIR` (défaut `./Pictures`)
- `TRUST_PROXY` (`true|false`)

### 2) Frontend

```bash
cd /home/runner/work/photo-platform/photo-platform/frontend
cp .env.example .env
npm install
```

Variables frontend (`frontend/.env`):

- `VITE_API_BASE_URL` (défaut `http://localhost:3000`)

## Lancement local

Backend (port 3000):

```bash
cd /home/runner/work/photo-platform/photo-platform/backend
npm run dev
```

Frontend (port 5173):

```bash
cd /home/runner/work/photo-platform/photo-platform/frontend
npm run dev
```

## API disponible

Routes principales implémentées :

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `GET /api/albums`
- `POST /api/albums`
- `GET /api/albums/:id`
- `PUT /api/albums/:id`
- `DELETE /api/albums/:id`
- `GET /api/albums/:id/photos`
- `POST /api/albums/:id/photos`
- `GET /api/photos/:id`
- `GET /api/photos/:id/file`
- `GET /api/photos/:id/thumbnail`
- `DELETE /api/photos/:id`
- `POST /api/photos/move`
- `GET/POST/PUT/DELETE /api/users...`
- `GET /api/permissions`
- `GET /api/admin/logs`

Toutes les routes sensibles vérifient la session, le statut utilisateur et les permissions backend.

## Stockage des photos

Par défaut : `backend/Pictures/album-<id>/original` et `backend/Pictures/album-<id>/thumbnails`.

- nom de fichier généré côté serveur
- taille max : 1 Mo
- JPEG uniquement (extension + MIME + contenu binaire)
- miniatures générées via `sharp`
- accès fichiers toujours via API (pas de service statique direct)

## Permissions minimales gérées

- `VIEW_PUBLIC_ALBUMS`
- `VIEW_PROTECTED_ALBUMS`
- `UPLOAD_PHOTOS`
- `CREATE_ALBUMS`
- `EDIT_ALBUMS`
- `DELETE_ALBUMS`
- `MOVE_PHOTOS`
- `DELETE_PHOTOS`
- `MANAGE_USERS`
- `MANAGE_PERMISSIONS`

Le rôle `main_admin` contourne explicitement les restrictions.

## Tests

Backend :

```bash
cd /home/runner/work/photo-platform/photo-platform/backend
npm test
```

Couvre au minimum :

- échec d’authentification (mauvais mot de passe)
- contrôle des permissions
- refus des uploads non JPEG
- refus des uploads > 1 Mo
- accès refusé à un album protégé

Frontend :

```bash
cd /home/runner/work/photo-platform/photo-platform/frontend
npm run lint
npm run build
```

## Déploiement séparé frontend/backend

- Backend déployé indépendamment avec variables d’environnement de production (`SESSION_SECRET` robuste, cookie `Secure`, CORS strict).
- Frontend déployé séparément avec `VITE_API_BASE_URL` pointant vers le backend.

## Limites actuelles connues

- La gestion utilisateurs/permissions côté UI reste une V1 (fonctionnelle mais sans édition avancée complète des permissions album par album).
- La visionneuse est implémentée avec navigation/clavier/zoom/plein écran de base, sans fonctions avancées de retouche.

Aucun secret réel n’est stocké dans le dépôt.

## Déploiement Vercel (services persistants)

Le fichier `vercel.json` configure un seul projet Vercel avec deux services liés : le frontend Vite et l’API Express. Le navigateur utilise la même origine (`/api`), y compris pour les aperçus.

En production, les données et les sessions utilisent Neon Postgres (`DATABASE_URL`). Les migrations idempotentes sont exécutées au démarrage de l’API. Les fichiers JPEG et leurs miniatures sont enregistrés dans un magasin Vercel Blob **privé**, sous des chemins de la forme `Pictures/<nom de l’album>/original/<nom>.jpg` et `Pictures/<nom de l’album>/thumbnails/<nom>.jpg`. Le backend authentifie les requêtes et vérifie les droits de l’utilisateur avant de transmettre une image. Les noms de fichiers sont générés par le serveur et les images sont normalisées en JPEG.

Le dossier local `backend/Pictures` et SQLite restent disponibles pour le développement local. Ils ne sont pas utilisés par les fonctions Vercel.

### Préparer le projet Vercel

1. Importer le dépôt GitHub comme projet multi-service avec le `vercel.json` de ce dépôt.
2. Relier une base Neon au projet afin que `DATABASE_URL` soit fourni aux environnements de déploiement.
3. Créer un magasin Vercel Blob **privé** et le relier au projet. Vercel fournit alors l’accès au magasin aux fonctions.
4. Définir `SESSION_SECRET` dans les environnements Production, Preview et Development avec une valeur aléatoire longue. Garder les secrets dans Vercel, jamais dans Git.
5. Créer le premier administrateur depuis un environnement local sécurisé relié à la base Neon avec `npm run init:admin` dans `backend`. Les variables `ADMIN_NAME`, `ADMIN_EMAIL` et `ADMIN_PASSWORD` peuvent être fournies à la commande; elles ne doivent pas être commitées.
6. Déployer. Les tables applicatives sont créées automatiquement par l’API. Vérifier `GET /api/health`, puis se connecter et téléverser une image JPEG de test.

`FRONTEND_URL` n’est nécessaire que si le frontend et l’API sont servis depuis des origines différentes. Cette configuration Vercel les sert sur la même origine et utilise les cookies de session `HttpOnly`, `SameSite=Lax` et `Secure` en production.
