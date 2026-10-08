// Empty by default: on Vercel and with the Vite dev proxy the API shares the site's origin.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const unauthorizedListeners = new Set();

/** Called when an authenticated request comes back 401 (expired session). */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function fallbackMessage(status) {
  if (status === 404) return 'Ressource introuvable';
  if (status === 413) return 'Fichier ou requête trop volumineux';
  if (status === 429) return 'Trop de requêtes, patientez quelques instants';
  if (status >= 500) return `Le serveur a rencontré une erreur (${status}). Réessayez dans un instant.`;
  return `Requête refusée (${status})`;
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const init = {
    method,
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json', ...headers },
  };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', { code: 'NETWORK_ERROR' });
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error = new ApiError(payload?.message || fallbackMessage(response.status), {
      status: response.status,
      code: payload?.error || 'HTTP_ERROR',
      details: payload?.details,
    });
    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      unauthorizedListeners.forEach((listener) => listener(error));
    }
    throw error;
  }

  return payload?.data ?? null;
}

const albumHeaders = (password) => (password ? { 'x-album-password': password } : {});

export const api = {
  health: () => request('/api/health'),

  me: () => request('/api/auth/me'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  listCollections: () => request('/api/collections'),
  getCollection: (id) => request(`/api/collections/${id}`),
  createCollection: (body) => request('/api/collections', { method: 'POST', body }),
  updateCollection: (id, body) => request(`/api/collections/${id}`, { method: 'PUT', body }),
  deleteCollection: (id) => request(`/api/collections/${id}`, { method: 'DELETE' }),

  listAlbums: (options) => request('/api/albums', options),
  getAlbum: (id, password) => request(`/api/albums/${id}`, { headers: albumHeaders(password) }),
  listAlbumPhotos: (id, password) => request(`/api/albums/${id}/photos`, { headers: albumHeaders(password) }),
  createAlbum: (body) => request('/api/albums', { method: 'POST', body }),
  updateAlbum: (id, body) => request(`/api/albums/${id}`, { method: 'PUT', body }),
  deleteAlbum: (id) => request(`/api/albums/${id}`, { method: 'DELETE' }),

  uploadPhoto: (albumId, file, signal) => {
    const form = new FormData();
    form.append('photos', file);
    return request(`/api/albums/${albumId}/photos`, { method: 'POST', body: form, signal });
  },
  showcase: (limit = 32) => request(`/api/photos/showcase?limit=${limit}`),
  movePhoto: (photoId, targetAlbumId) => request('/api/photos/move', { method: 'POST', body: { photoId, targetAlbumId } }),
  deletePhoto: (id) => request(`/api/photos/${id}`, { method: 'DELETE' }),

  listUsers: () => request('/api/users'),
  createUser: (body) => request('/api/users', { method: 'POST', body }),
  updateUser: (id, body) => request(`/api/users/${id}`, { method: 'PUT', body }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id, password) => request(`/api/users/${id}/reset-password`, { method: 'POST', body: { password } }),
  listPermissions: () => request('/api/permissions'),

  getLogs: () => request('/api/admin/logs'),
  getStorage: () => request('/api/admin/storage'),
  pruneStorage: (deleteEmptyAlbums) => request('/api/admin/storage/prune', { method: 'POST', body: { deleteEmptyAlbums } }),
};

export function thumbnailUrl(photoId) {
  return `${API_BASE_URL}/api/photos/${photoId}/thumbnail`;
}

export function photoUrl(photoId, { download = false } = {}) {
  return `${API_BASE_URL}/api/photos/${photoId}/file${download ? '?download=1' : ''}`;
}
