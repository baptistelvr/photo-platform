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

/** Album checks only, before the collection's lock. */
async function resolveOwnAlbumAccess(req, album) {
  if (await hasDirectAlbumAccess(req.user, album)) return 'granted';
  if (album.visibility !== 'protected' || !album.passwordHash) return 'denied';
  if (isUnlockedInSession(req, album)) return 'granted';

  const submitted = req.get('x-album-password');
  if (!submitted) return 'password_required';
  if (!(await verifyPassword(submitted, album.passwordHash))) return 'invalid_password';

  req.session.unlockedAlbums = [...new Set([...(req.session.unlockedAlbums || []), album.id])];
  return 'granted';
}

// Seeing every protected album also opens every locked collection.
function bypassesCollectionLocks(user) {
  return isMainAdmin(user) || hasPermission(user, PERMISSIONS.VIEW_PROTECTED_ALBUMS);
}

function isCollectionUnlockedInSession(req, collectionId) {
  return Boolean(req.session?.unlockedCollections?.includes(collectionId));
}

/** The collection fields carried by album rows (see albumRepository). */
function collectionOf(album) {
  return album.collectionId
    ? { id: album.collectionId, visibility: album.collectionVisibility, passwordHash: album.collectionPasswordHash }
    : null;
}

/** Public album outside any locked collection: anyone may see it, CDN included. */
function isOpenToEveryone(album) {
  return album.visibility === 'public' && album.collectionVisibility !== 'protected';
}

/**
 * Whether the request may enter a collection. A locked collection opens to
 * admins, to people who see every protected album, and to anyone who sends its
 * password in `x-collection-password` (then for the rest of the session).
 * Returns 'granted', 'collection_password_required', 'invalid_collection_password' or 'denied'.
 */
async function resolveCollectionAccess(req, collection) {
  if (!collection || collection.visibility !== 'protected') return 'granted';
  if (bypassesCollectionLocks(req.user) || isCollectionUnlockedInSession(req, collection.id)) return 'granted';
  if (!collection.passwordHash) return 'denied';

  const submitted = req.get('x-collection-password');
  if (!submitted) return 'collection_password_required';
  if (!(await verifyPassword(submitted, collection.passwordHash))) return 'invalid_collection_password';

  req.session.unlockedCollections = [...new Set([...(req.session.unlockedCollections || []), collection.id])];
  return 'granted';
}

/**
 * Resolves whether the request may read the album: its collection must let the
 * viewer in, then the album itself. A password sent in the `x-album-password`
 * header unlocks the album for the rest of the session. Someone given access to
 * the album by name does not need the collection's password.
 * Returns 'granted', 'denied', or which password is missing or wrong.
 */
async function resolveAlbumAccess(req, album) {
  if (!album) return 'denied';
  const collection = collectionOf(album);
  if (collection?.visibility === 'protected' && !bypassesCollectionLocks(req.user)
    && !(req.user && await albumRepository.userHasAlbumAccess(album.id, req.user.id))) {
    const entry = await resolveCollectionAccess(req, collection);
    if (entry !== 'granted') return entry;
  }
  return resolveOwnAlbumAccess(req, album);
}

async function filterVisibleAlbums(req, albums) {
  const user = req.user || null;
  const accessibleIds = user && !isMainAdmin(user) && !hasPermission(user, PERMISSIONS.VIEW_PROTECTED_ALBUMS)
    ? new Set(await albumRepository.listAccessibleAlbumIds(user.id))
    : null;

  const bypass = bypassesCollectionLocks(user);
  const collectionOpen = (album) => album.collectionVisibility !== 'protected' || bypass
    || isCollectionUnlockedInSession(req, album.collectionId) || Boolean(accessibleIds?.has(album.id));

  return albums.filter((album) => {
    if (!collectionOpen(album)) return false;
    if (album.visibility === 'public') return true;
    if (isUnlockedInSession(req, album)) return true;
    if (!user) return false;
    if (!accessibleIds) return true;
    return accessibleIds.has(album.id);
  });
}

module.exports = {
  isMainAdmin, hasPermission, hasDirectAlbumAccess, isOpenToEveryone, resolveCollectionAccess, resolveAlbumAccess,
  filterVisibleAlbums,
};
