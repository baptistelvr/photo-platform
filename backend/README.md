# Backend

API Express 5 en CommonJS. Le point d'entrée Vercel est `api/index.js`, qui exporte simplement l'application construite par `src/app.js`. En local, c'est `src/server.js` qui démarre le serveur.

## Scripts

- `npm run dev` : API avec rechargement automatique (nodemon)
- `npm start` : API sans rechargement
- `npm run migrate` : crée ou met à jour le schéma (SQLite ou Postgres selon `DATABASE_URL`)
- `npm run init:admin` : crée un administrateur principal
- `npm test` : tests d'intégration (Vitest + Supertest, sur une base SQLite temporaire)

## Organisation

```
src/
  app.js            construction de l'app, initialisation paresseuse, /api/health
  routes/index.js   toutes les routes et les permissions requises, en un coup d'œil
  controllers/      logique HTTP (collections, albums, photos, utilisateurs, auth, administration)
  repositories/     requêtes SQL, compatibles SQLite et Postgres
  services/         droits d'accès, stockage (disque ou bucket S3), traitement d'image
  middlewares/      session utilisateur, contrôle d'origine (CSRF), erreurs
  utils/            schémas zod, sérialiseurs, erreurs HTTP
```

Les réponses passent par `utils/serializers.js` : ni les chemins de stockage ni les hash de mot de passe ne sortent du serveur.

## Variables d'environnement

Voir `.env.example`. En production sur Vercel, `POSTGRES_URL` vient de l'intégration Neon. `SESSION_SECRET` et les variables `S3_*` du bucket (Cloudflare R2 ou Backblaze B2) sont à ajouter à la main, voir le README principal.

Avant d'ajouter une dépendance, vérifiez qu'elle propose bien un export `require` (CommonJS). Un paquet ESM uniquement fait planter la fonction sur Vercel (voir le README principal).
