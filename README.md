# Photo Platform

Une plateforme pour partager des albums photo, rangés en collections. Certains albums sont publics, d'autres protégés, soit par une liste de personnes autorisées, soit par un mot de passe à transmettre. Les images ne sont jamais servies en direct depuis le stockage : chaque requête passe par l'API, qui vérifie les droits avant d'envoyer le fichier.

- `frontend/` : React 19 + Vite, sans framework CSS (design system maison dans `src/styles`).
- `backend/` : API Express 5. SQLite et dossier `Pictures/` en local ; Neon Postgres et un bucket S3 (Cloudflare R2 ou Backblaze B2) en production.
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
2. Créez un bucket chez **Cloudflare R2** (ou Backblaze B2) et renseignez `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY`. Le détail est dans la section suivante.
3. Ajoutez `SESSION_SECRET`, une longue valeur aléatoire (par exemple `openssl rand -base64 48`).
4. Pour le tout premier compte, ajoutez temporairement `ADMIN_NAME`, `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum), redéployez, puis ouvrez `/api/health`. Si la base ne contient encore aucun utilisateur, l'administrateur principal est créé à ce moment-là. Supprimez ensuite ces trois variables.

Attention, ces variables doivent exister pour chaque environnement où l'API doit fonctionner. Si elles ne sont définies qu'en Production, les déploiements Preview afficheront une bannière « Le serveur ne répond pas correctement ». C'est normal : `/api/health` indique précisément ce qui manque.

Les migrations sont idempotentes et s'exécutent au premier appel de chaque instance. Un verrou Postgres évite que deux démarrages à froid simultanés se marchent dessus.

## Où sont stockées les photos

Au début, les photos partaient dans Vercel Blob. Le problème, c'est le quota gratuit : 2 000 « opérations avancées » par mois, et chaque photo importée en consomme au moins deux (l'original et la miniature). Un import d'un millier de photos suffit à le dépasser, et Vercel bloque alors le magasin. Toutes les lectures répondent `403 Forbidden` et plus aucune image ne s'affiche.

L'API parle donc maintenant à n'importe quel stockage compatible S3. Deux offres gratuites conviennent, sans abonnement :

- **Cloudflare R2**, le choix recommandé : 10 Go gratuits, un million d'écritures et dix millions de lectures par mois, et aucun frais de sortie. Cloudflare demande une carte bancaire pour activer R2, mais rien n'est prélevé tant qu'on reste dans ces limites.
- **Backblaze B2** : 10 Go gratuits aussi, mais seulement 2 500 lectures gratuites par jour. Ça passe pour une petite galerie, beaucoup moins si l'on parcourt souvent des albums de plusieurs centaines de photos.

Mise en place avec R2 :

1. Dans le tableau de bord Cloudflare, ouvrez **R2**, activez-le, puis créez un bucket (par exemple `photo-platform`). Laissez-le privé : l'API sert elle-même les images après avoir vérifié les droits.
2. Dans **R2 › Gérer les jetons d'API**, créez un jeton avec la permission « Lecture et écriture d'objets », limité à ce bucket. Notez l'*Access Key ID* et la *Secret Access Key* (cette dernière n'est affichée qu'une fois).
3. Dans Vercel, **Settings › Environment Variables**, ajoutez pour Production (et Preview si vous l'utilisez) :

   | Variable | Valeur |
   | --- | --- |
   | `S3_ENDPOINT` | `https://<ID de compte>.r2.cloudflarestorage.com` (visible dans les réglages du bucket) |
   | `S3_BUCKET` | le nom du bucket |
   | `S3_ACCESS_KEY_ID` | l'Access Key ID du jeton |
   | `S3_SECRET_ACCESS_KEY` | la Secret Access Key du jeton |
   | `S3_REGION` | `auto` (valeur par défaut, facultative pour R2) |

4. Supprimez `BLOB_READ_WRITE_TOKEN`, qui ne sert plus, puis redéployez. `/api/health` doit renvoyer `"storage": "s3"`.

Pour Backblaze B2, c'est la même chose avec une *Application Key* limitée au bucket, `S3_ENDPOINT=https://s3.<région>.backblazeb2.com` et `S3_REGION` égal à la région du bucket (par exemple `eu-central-003`).

Sans ces variables, l'API refuse de démarrer sur Vercel et `/api/health` dit ce qui manque : le disque d'une fonction Vercel est éphémère, des photos écrites dessus disparaîtraient au bout de quelques minutes. En local, sans `S3_BUCKET`, les photos vont simplement dans `backend/Pictures/`.

### Récupérer la galerie après le changement de stockage

Les fiches des photos (base Neon) sont toujours là, mais leurs fichiers sont restés dans l'ancien Vercel Blob, qui ne répond plus. La marche à suivre :

1. Ouvrez **Administration › Stockage**. La page compare la base et le bucket et indique combien de photos sont introuvables.
2. Cliquez sur « Retirer les photos introuvables ». Laissez cochée l'option qui supprime aussi les albums devenus vides : l'import les recréera, cette fois rangés dans leurs collections.
3. Réimportez votre dossier depuis la page **Importer**. Les collections et albums encore présents sont réutilisés, et les photos déjà dans le bucket sont sautées.

## Tests

```bash
cd backend && npm test               # API : auth, droits, uploads, collections, stockage, CSRF…
cd frontend && npm run lint && npm run build
```

## Le bug qui empêchait le frontend de joindre l'API

Sur Vercel, chaque requête `/api/*` plantait (`FUNCTION_INVOCATION_FAILED`, puis `argument handler must be a function` dans les logs). La cause n'était ni le routage ni les exports CommonJS. Le backend importait `file-type`, un paquet **ESM uniquement**, via `require()`. Ce `require` échouait dans le runtime Vercel, le launcher retentait le chargement, et `albumController` restait en cache à moitié initialisé, avec des handlers `undefined`.

`file-type` a été remplacé par une vérification de la signature JPEG suivie d'un décodage complet par `sharp`. Règle à retenir pour la suite : **n'ajoutez pas au backend de dépendance qui ne fournit qu'un point d'entrée ESM** (vérifiez le champ `exports` de son `package.json`), ou convertissez d'abord le backend en ESM.

## Collections et albums

Deux niveaux : une **collection** regroupe des **albums**, et un album contient les photos. La visibilité se règle album par album (public, liste de personnes, mot de passe). Une collection n'apparaît à un visiteur que si elle contient au moins un album qu'il a le droit d'ouvrir ; les gestionnaires d'albums voient aussi les collections vides. Un album peut rester hors collection, il est alors listé à part.

Supprimer une collection supprime ses albums et leurs photos. La renommer déplace les fichiers dans le stockage, comme pour un album.

## Importer tout un dossier

Sur la page **Importer**, glissez un dossier (ou cliquez sur « choisissez un dossier »). Le premier niveau de sous-dossiers donne les collections, le second les albums :

```
Mes photos/
├── Voyages/          → collection « Voyages »
│   ├── Italie/       → album « Italie »
│   └── Espagne/      → album « Espagne »
└── Famille/          → collection « Famille »
    └── Noël 2024/    → album « Noël 2024 »
```

Quand on glisse un seul dossier qui contient lui-même les collections (comme « Mes photos » ci-dessus), la page le détecte et propose de choisir son rôle : « contient mes collections » ou « est une collection ». Les photos posées directement dans un dossier de collection vont dans un album du même nom, et les dossiers plus profonds que l'album sont fusionnés dans celui-ci. Collections et albums sont créés s'ils n'existent pas, et réutilisés sinon (même nom, majuscules et accents compris). Les fichiers qui ne sont pas des JPEG et les fichiers cachés (`.DS_Store`, `._*`) sont ignorés.

Les photos de plus de 1 Mo sont réduites dans le navigateur avant l'envoi (2560 px maximum, orientation corrigée). Vos fichiers d'origine ne sont pas modifiés. L'envoi se fait trois photos à la fois, avec nouvel essai automatique en cas de coupure ; si l'import est interrompu, il suffit de glisser à nouveau le même dossier : les photos déjà présentes dans l'album (même nom de fichier) sont sautées. Laissez l'onglet ouvert pendant l'envoi.

## Diaporama

Chaque album et chaque collection a un bouton **Diaporama** (on peut aussi le lancer depuis la visionneuse, à partir de la photo affichée). On choisit la durée d'affichage de chaque photo, de 1 à 120 secondes, l'ordre (normal ou aléatoire), la lecture en boucle et le plein écran. Ces réglages sont mémorisés dans le navigateur.

Les photos s'enchaînent en fondu, et une photo n'apparaît qu'une fois entièrement chargée : pas d'image coupée en deux sur une connexion lente. Les deux suivantes sont préchargées pendant l'affichage de la photo en cours. Au clavier : Espace pour la pause, flèches gauche et droite pour naviguer, + et − pour la durée, F pour le plein écran, Échap pour quitter. Sur mobile, on balaie l'écran pour passer d'une photo à l'autre. Pour une collection, seules les photos des albums que la personne a le droit de voir sont montrées (`GET /api/collections/:id/photos`).

Chaque photo affichée est une lecture dans le bucket. Avec Backblaze B2 en offre gratuite (2 500 lectures par jour), un très long diaporama sur une grosse collection peut donc entamer sérieusement le quota du jour.

## Page d'accueil

Le fond de l'accueil est un mur de photos en 3D qui défile en continu. Les photos sont tirées au hasard parmi les **albums publics uniquement** (`GET /api/photos/showcase`) ; un album protégé n'y apparaît jamais, même pour un administrateur connecté. Un clic sur une photo l'ouvre dans sa visionneuse. Le mur suit légèrement la souris, s'arrête au survol d'une rangée ou quand il sort de l'écran, et reste immobile si le système demande de réduire les animations.

Les miniatures des albums publics sont mises en cache une heure par le CDN de Vercel, ce qui évite d'appeler la fonction pour chaque visiteur. Conséquence : si un album public devient protégé, ses images peuvent rester accessibles par leur adresse directe pendant une heure au plus. Les images des albums protégés ne sont jamais mises en cache côté CDN.

## Règles côté stockage

- JPEG uniquement, 1 Mo maximum par fichier. Le contrôle porte sur l'extension, le type MIME, la signature binaire, puis un décodage complet.
- Les images sont réencodées (orientation EXIF appliquée) et une miniature de 640 px est générée.
- Chemins de stockage : `Pictures/<collection>/<album>/original/<fichier>.jpg` et `.../thumbnails/...` (sans le niveau collection pour un album qui n'en a pas). Renommer une collection ou un album, ou changer un album de collection, déplace donc ses fichiers.
- Le frontend envoie une photo par requête, ce qui reste bien en dessous de la limite de 4,5 Mo par requête des fonctions Vercel.

## Permissions

L'administrateur principal (`main_admin`) a tous les droits. Pour les autres comptes, ce sont les permissions qui décident : `VIEW_PUBLIC_ALBUMS`, `VIEW_PROTECTED_ALBUMS`, `UPLOAD_PHOTOS`, `CREATE_ALBUMS`, `EDIT_ALBUMS`, `DELETE_ALBUMS`, `MOVE_PHOTOS`, `DELETE_PHOTOS`, `MANAGE_USERS`, `MANAGE_PERMISSIONS`. Le rôle « admin » est surtout indicatif.

Un gestionnaire d'utilisateurs ne peut ni créer un administrateur principal ni modifier son compte. Changer les permissions de quelqu'un demande `MANAGE_PERMISSIONS`.
