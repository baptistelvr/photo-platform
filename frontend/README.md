# Frontend

React 19, React Router 7 et Vite. Les icônes viennent de `lucide-react`, la police Inter est auto-hébergée (`@fontsource-variable/inter`). Il n'y a pas de framework CSS : les variables de thème (clair et sombre) sont dans `src/styles/tokens.css`, les composants dans `components.css`.

## Scripts

- `npm run dev` : serveur de développement ; `/api` est redirigé vers `http://localhost:3000`
- `npm run build` : build de production dans `dist/`
- `npm run preview` : sert le build localement
- `npm run lint` : oxlint

## Repères

- `src/lib/api.js` : le seul endroit qui parle à l'API. Il normalise les erreurs (`ApiError` avec `status` et `code`) et signale les sessions expirées.
- `src/hooks/` : authentification, thème, notifications, confirmations, chargement de données.
- `src/pages/` : une page par route. Les pages d'administration et d'import sont chargées à la demande.

`VITE_API_BASE_URL` ne sert que si l'API est sur un autre domaine que le site. Sur Vercel, laissez-la vide.
