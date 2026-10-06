const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...options.headers,
  };
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'API error');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  listAlbums: () => request('/api/albums'),
  getAlbum: (id) => request(`/api/albums/${id}`),
  listAlbumPhotos: (id) => request(`/api/albums/${id}/photos`),
  createAlbum: (body) => request('/api/albums', { method: 'POST', body: JSON.stringify(body) }),
  updateAlbum: (id, body) => request(`/api/albums/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAlbum: (id) => request(`/api/albums/${id}`, { method: 'DELETE' }),
  uploadPhotos: (albumId, files) => {
    const form = new FormData();
    files.forEach((file) => form.append('photos', file));
    return request(`/api/albums/${albumId}/photos`, { method: 'POST', body: form });
  },
  listUsers: () => request('/api/users'),
  createUser: (body) => request('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id, password) => request(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  listPermissions: () => request('/api/permissions'),
  getLogs: () => request('/api/admin/logs'),
  getPhoto: (id) => `${API_BASE_URL}/api/photos/${id}/file`,
  getThumbnail: (id) => `${API_BASE_URL}/api/photos/${id}/thumbnail`,
};

export { API_BASE_URL };
