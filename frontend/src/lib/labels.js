export const PERMISSIONS = [
  { code: 'VIEW_PUBLIC_ALBUMS', label: 'Voir les albums publics', group: 'Albums' },
  { code: 'VIEW_PROTECTED_ALBUMS', label: 'Voir tous les albums protégés', group: 'Albums' },
  { code: 'CREATE_ALBUMS', label: 'Créer des albums', group: 'Albums' },
  { code: 'EDIT_ALBUMS', label: 'Modifier les albums', group: 'Albums' },
  { code: 'DELETE_ALBUMS', label: 'Supprimer les albums', group: 'Albums' },
  { code: 'UPLOAD_PHOTOS', label: 'Importer des photos', group: 'Photos' },
  { code: 'MOVE_PHOTOS', label: 'Déplacer des photos', group: 'Photos' },
  { code: 'DELETE_PHOTOS', label: 'Supprimer des photos', group: 'Photos' },
  { code: 'MANAGE_USERS', label: 'Gérer les utilisateurs', group: 'Administration' },
  { code: 'MANAGE_PERMISSIONS', label: 'Gérer les permissions et le journal', group: 'Administration' },
];

export const PERMISSION_LABELS = Object.fromEntries(PERMISSIONS.map((p) => [p.code, p.label]));

export const ROLE_LABELS = {
  main_admin: 'Administrateur principal',
  admin: 'Administrateur',
  user: 'Utilisateur',
};

export const ACTION_LABELS = {
  AUTH_LOGIN: { label: 'Connexion', color: '#3b82f6' },
  AUTH_LOGOUT: { label: 'Déconnexion', color: '#94a3b8' },
  AUTH_CHANGE_PASSWORD: { label: 'Mot de passe modifié', color: '#a855f7' },
  ALBUM_CREATE: { label: 'Album créé', color: '#10b981' },
  ALBUM_UPDATE: { label: 'Album modifié', color: '#f59e0b' },
  ALBUM_DELETE: { label: 'Album supprimé', color: '#ef4444' },
  PHOTO_UPLOAD: { label: 'Photos importées', color: '#10b981' },
  PHOTO_MOVE: { label: 'Photo déplacée', color: '#f59e0b' },
  PHOTO_DELETE: { label: 'Photo supprimée', color: '#ef4444' },
  USER_CREATE: { label: 'Utilisateur créé', color: '#10b981' },
  USER_UPDATE: { label: 'Utilisateur modifié', color: '#f59e0b' },
  USER_DELETE: { label: 'Utilisateur supprimé', color: '#ef4444' },
  USER_RESET_PASSWORD: { label: 'Mot de passe réinitialisé', color: '#a855f7' },
};

export const OBJECT_LABELS = { album: 'Album', photo: 'Photo', user: 'Utilisateur' };
