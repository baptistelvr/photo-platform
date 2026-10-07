const unwrap = (value) => value?.default ?? value;
const albumRepository = unwrap(require('../repositories/albumRepository'));

function isMainAdmin(user) {
  return user?.role === 'main_admin';
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (isMainAdmin(user)) return true;
  return user.permissions?.includes(permission);
}

async function canAccessAlbum(user, album) {
  if (!album) return false;
  if (album.visibility === 'public') return true;
  if (!user) return false;
  if (isMainAdmin(user)) return true;
  if (user.permissions?.includes('VIEW_PROTECTED_ALBUMS')) return true;
  return albumRepository.userHasAlbumAccess(album.id, user.id);
}

module.exports = { isMainAdmin, hasPermission, canAccessAlbum };

