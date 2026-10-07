const albumRepository = require('../repositories/albumRepository');
const { verifyPassword } = require('../utils/password');
const { PERMISSIONS } = require('../constants/permissions');

function isMainAdmin(user) {
  return user?.role === 'main_admin';
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (isMainAdmin(user)) return true;
  return Boolean(user.permissions?.includes(permission));
}

// Access granted by role, permission or explicit album membership, ignoring
// any password unlocked in the current session.
async function hasDirectAlbumAccess(user, album) {
  if (!album) return false;
  if (album.visibility === 'public') return true;
  if (!user) return false;
  if (isMainAdmin(user) || hasPermission(user, PERMISSIONS.VIEW_PROTECTED_ALBUMS)) return true;
  return albumRepository.userHasAlbumAccess(album.id, user.id);
}

function isUnlockedInSession(req, album) {
  return Boolean(req.session?.unlockedAlbums?.includes(album.id));
}

/**
 * Resolves whether the request may read the album. A password sent in the
 * `x-album-password` header unlocks the album for the rest of the session.
 * Returns 'granted', 'password_required', 'invalid_password' or 'denied'.
 */
async function resolveAlbumAccess(req, album) {
  if (!album) return 'denied';
  if (await hasDirectAlbumAccess(req.user, album)) return 'granted';
  if (album.visibility !== 'protected' || !album.passwordHash) return 'denied';
  if (isUnlockedInSession(req, album)) return 'granted';

  const submitted = req.get('x-album-password');
  if (!submitted) return 'password_required';
  if (!(await verifyPassword(submitted, album.passwordHash))) return 'invalid_password';

  req.session.unlockedAlbums = [...new Set([...(req.session.unlockedAlbums || []), album.id])];
  return 'granted';
}

async function filterVisibleAlbums(req, albums) {
  const user = req.user || null;
  const accessibleIds = user && !isMainAdmin(user) && !hasPermission(user, PERMISSIONS.VIEW_PROTECTED_ALBUMS)
    ? new Set(await albumRepository.listAccessibleAlbumIds(user.id))
    : null;

  return albums.filter((album) => {
    if (album.visibility === 'public') return true;
    if (isUnlockedInSession(req, album)) return true;
    if (!user) return false;
    if (!accessibleIds) return true;
    return accessibleIds.has(album.id);
  });
}

module.exports = { isMainAdmin, hasPermission, hasDirectAlbumAccess, resolveAlbumAccess, filterVisibleAlbums };
