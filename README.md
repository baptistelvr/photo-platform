# Photo Platform

Une plateforme pour partager des albums photo. Certains albums sont publics, d'autres protégés, soit par une liste de personnes autorisées, soit par un mot de passe à transmettre. Les images ne sont jamais servies en direct depuis le stockage : chaque requête passe par l'API, qui vérifie les droits avant d'envoyer le fichier.

- `frontend/` : React 19 + Vite, sans framework CSS (design system maison dans `src/styles`).
- `backend/` : API Express 5. SQLite et dossier `Pictures/` en local ; Neon Postgres et Vercel Blob privé en production.
- `vercel.json` : un seul projet Vercel avec deux services. `/api/*` part vers le backend, tout le reste vers le frontend. Comme les deux sont servis depuis la même origine, il n'y a pas de CORS à gérer.

## Lancer le projet en local

Il faut Node.js 22 ou plus récent (la production tourne en Node 24).

```bash
# Terminal 1 : l'API sur http://localhost:3000
cd backend
cp .env.example .env        # pensez à changer SESSION_SECRET
npm install
npm run migrate
npm run init:admin          # crée l'administrateur principal (questions dans le terminal)
npm run dev
```

```bash
# Terminal 2 : l'interface sur http://localhost:5173
cd frontend
npm install
npm run dev
```

Vite redirige `/api` vers le port 3000, exactement comme le fait Vercel en production. Inutile donc de renseigner `VITE_API_BASE_URL`, sauf si l'API est hébergée sur un autre domaine.

## Déployer sur Vercel

Le projet Vercel doit utiliser le `vercel.json` du dépôt (préréglage « Services »). Ensuite :

1. Reliez une base **Neon Postgres** au projet. L'intégration crée `POSTGRES_URL`, que l'API lit directement (`DATABASE_URL` reste accepté).
2. Reliez un magasin **Vercel Blob privé**. Vercel fournit alors `BLOB_READ_WRITE_TOKEN`.
3. Ajoutez `SESSION_SECRET`, une longue valeur aléatoire (par exemple `openssl rand -base64 48`).
4. Pour le tout premier compte, ajoutez temporairement `ADMIN_NAME`, `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum), redéployez, puis ouvrez `/api/health`. Si la base ne contient encore aucun utilisateur, l'administrateur principal est créé à ce moment-là. Supprimez ensuite ces trois variables.

Attention, ces variables doivent exister pour chaque environnement où l'API doit fonctionner. Si elles ne sont définies qu'en Production, les déploiements Preview afficheront une bannière « Le serveur ne répond pas correctement ». C'est normal : `/api/health` indique précisément ce qui manque.

Les migrations sont idempotentes et s'exécutent au premier appel de chaque instance. Un verrou Postgres évite que deux démarrages à froid simultanés se marchent dessus.

## Tests

```bash
cd backend && npm test               # API : auth, droits, uploads, albums protégés, CSRF…
cd frontend && npm run lint && npm run build
```

## Le bug qui empêchait le frontend de joindre l'API

Sur Vercel, chaque requête `/api/*` plantait (`FUNCTION_INVOCATION_FAILED`, puis `argument handler must be a function` dans les logs). La cause n'était ni le routage ni les exports CommonJS. Le backend importait `file-type`, un paquet **ESM uniquement**, via `require()`. Ce `require` échouait dans le runtime Vercel, le launcher retentait le chargement, et `albumController` restait en cache à moitié initialisé, avec des handlers `undefined`.

`file-type` a été remplacé par une vérification de la signature JPEG suivie d'un décodage complet par `sharp`. Règle à retenir pour la suite : **n'ajoutez pas au backend de dépendance qui ne fournit qu'un point d'entrée ESM** (vérifiez le champ `exports` de son `package.json`), ou convertissez d'abord le backend en ESM.

## Importer tout un dossier

Sur la page **Importer**, glissez un dossier (ou cliquez sur « choisissez un dossier »). Chaque sous-dossier devient une collection : l'album est créé s'il n'existe pas, et réutilisé s'il existe déjà (même nom, majuscules et accents compris). Les sous-dossiers plus profonds sont rangés dans leur collection, les fichiers qui ne sont pas des JPEG et les fichiers cachés (`.DS_Store`, `._*`) sont ignorés.

Les photos de plus de 1 Mo sont réduites dans le navigateur avant l'envoi (2560 px maximum, orientation corrigée). Vos fichiers d'origine ne sont pas modifiés. L'envoi se fait trois photos à la fois, avec nouvel essai automatique en cas de coupure ; si l'import est interrompu, il suffit de glisser à nouveau le même dossier : les photos déjà présentes dans l'album (même nom de fichier) sont sautées. Laissez l'onglet ouvert pendant l'envoi.

## Page d'accueil

Le fond de l'accueil est un mur de photos en 3D qui défile en continu. Les photos sont tirées au hasard parmi les **albums publics uniquement** (`GET /api/photos/showcase`) ; un album protégé n'y apparaît jamais, même pour un administrateur connecté. Un clic sur une photo l'ouvre dans sa visionneuse. Le mur suit légèrement la souris, s'arrête au survol d'une rangée ou quand il sort de l'écran, et reste immobile si le système demande de réduire les animations.

Les miniatures des albums publics sont mises en cache une heure par le CDN de Vercel, ce qui évite d'appeler la fonction pour chaque visiteur. Conséquence : si un album public devient protégé, ses images peuvent rester accessibles par leur adresse directe pendant une heure au plus. Les images des albums protégés ne sont jamais mises en cache côté CDN.

## Règles côté stockage

- JPEG uniquement, 1 Mo maximum par fichier. Le contrôle porte sur l'extension, le type MIME, la signature binaire, puis un décodage complet.
- Les images sont réencodées (orientation EXIF appliquée) et une miniature de 640 px est générée.
- Chemins de stockage : `Pictures/<nom de l'album>/original/<fichier>.jpg` et `.../thumbnails/...`. Renommer un album déplace donc ses fichiers.
- Le frontend envoie une photo par requête, ce qui reste bien en dessous de la limite de 4,5 Mo par requête des fonctions Vercel.

## Permissions

L'administrateur principal (`main_admin`) a tous les droits. Pour les autres comptes, ce sont les permissions qui décident : `VIEW_PUBLIC_ALBUMS`, `VIEW_PROTECTED_ALBUMS`, `UPLOAD_PHOTOS`, `CREATE_ALBUMS`, `EDIT_ALBUMS`, `DELETE_ALBUMS`, `MOVE_PHOTOS`, `DELETE_PHOTOS`, `MANAGE_USERS`, `MANAGE_PERMISSIONS`. Le rôle « admin » est surtout indicatif.

Un gestionnaire d'utilisateurs ne peut ni créer un administrateur principal ni modifier son compte. Changer les permissions de quelqu'un demande `MANAGE_PERMISSIONS`.
