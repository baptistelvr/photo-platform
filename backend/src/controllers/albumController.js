const albumRepository = require('../repositories/albumRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const photoRepository = require('../repositories/photoRepository');
const { hasPermission, resolveAlbumAccess, filterVisibleAlbums } = require('../services/accessService');
const storageService = require('../services/storageService');
const { PERMISSIONS } = require('../constants/permissions');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { hashPassword } = require('../utils/password');
const { albumSchema } = require('../utils/schemas');
const { publicAlbum, publicPhoto } = require('../utils/serializers');

const accessErrors = {
  password_required: [403, 'ALBUM_PASSWORD_REQUIRED', 'Cet album est protégé par un mot de passe'],
  invalid_password: [403, 'INVALID_ALBUM_PASSWORD', 'Mot de passe incorrect'],
  denied: [403, 'ALBUM_FORBIDDEN', 'Vous n’avez pas accès à cet album'],
};

async function loadAlbum(id) {
  const album = await albumRepository.getAlbumById(parseId(id, 'Album'));
  if (!album) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');
  return album;
}

/** Loads an album and throws unless the request may read it. */
async function loadReadableAlbum(req, id) {
  const album = await loadAlbum(id);
  const access = await resolveAlbumAccess(req, album);
  if (access !== 'granted') {
    const [status, code, message] = accessErrors[access];
    throw new HttpError(status, code, message);
  }
  return album;
}

async function listAlbums(req, res, next) {
  try {
    const albums = await filterVisibleAlbums(req, await albumRepository.listAlbums());
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: albums.map((album) => publicAlbum(album)) });
  } catch (error) {
    next(error);
  }
}

async function getAlbum(req, res, next) {
  try {
    const album = await loadReadableAlbum(req, req.params.id);
    const extra = hasPermission(req.user, PERMISSIONS.EDIT_ALBUMS)
      ? { accessUserIds: await albumRepository.getAlbumAccessUserIds(album.id) }
      : {};
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: publicAlbum(album, extra) });
  } catch (error) {
    next(error);
  }
}

async function listAlbumPhotos(req, res, next) {
  try {
    const album = await loadReadableAlbum(req, req.params.id);
    const photos = await albumRepository.listAlbumPhotos(album.id);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: photos.map(publicPhoto) });
  } catch (error) {
    next(error);
  }
}

async function createAlbum(req, res, next) {
  try {
    const payload = albumSchema.parse(req.body);
    const passwordHash = payload.visibility === 'protected' && payload.password ? await hashPassword(payload.password) : null;
    const album = await albumRepository.createAlbum({
      name: payload.name,
      description: payload.description,
      visibility: payload.visibility,
      passwordHash,
    });

    if (payload.accessUserIds?.length) await albumRepository.setAlbumAccess(album.id, payload.accessUserIds);

    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_CREATE', objectType: 'album', objectId: String(album.id), metadata: { name: album.name }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: publicAlbum(album) });
  } catch (error) {
    next(error);
  }
}

async function updateAlbum(req, res, next) {
  try {
    const current = await loadAlbum(req.params.id);
    const payload = albumSchema.parse(req.body);

    let passwordHash = current.passwordHash;
    if (payload.visibility === 'public' || payload.removePassword) passwordHash = null;
    else if (payload.password) passwordHash = await hashPassword(payload.password);

    let coverPhotoId = current.coverPhotoId;
    if (payload.coverPhotoId === null) coverPhotoId = null;
    if (payload.coverPhotoId) {
      const cover = await photoRepository.getPhotoById(payload.coverPhotoId);
      if (!cover || cover.albumId !== current.id) throw new HttpError(400, 'INVALID_COVER', 'La couverture doit être une photo de cet album');
      coverPhotoId = cover.id;
    }

    const updated = await albumRepository.updateAlbum(current.id, {
      name: payload.name,
      description: payload.description,
      visibility: payload.visibility,
      passwordHash,
      coverPhotoId,
    });

    // Files live under Pictures/<album name>/…, so a rename moves them.
    if (current.name !== updated.name) {
      for (const photo of await albumRepository.listAlbumPhotos(current.id)) {
        const paths = await storageService.movePhotoFiles(photo, updated);
        await photoRepository.updatePaths(photo.id, paths);
      }
    }

    if (payload.accessUserIds) await albumRepository.setAlbumAccess(current.id, payload.accessUserIds);

    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_UPDATE', objectType: 'album', objectId: String(current.id), metadata: { name: updated.name }, ipAddress: req.ip });
    res.json({
      success: true,
      data: publicAlbum(updated, { accessUserIds: await albumRepository.getAlbumAccessUserIds(current.id) }),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAlbum(req, res, next) {
  try {
    const album = await loadAlbum(req.params.id);
    const photos = await albumRepository.listAlbumPhotos(album.id);
    await storageService.deletePhotoFiles(photos);
    await albumRepository.deleteAlbum(album.id);
    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_DELETE', objectType: 'album', objectId: String(album.id), metadata: { name: album.name, photos: photos.length }, ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  loadAlbum,
  loadReadableAlbum,
  listAlbums,
  getAlbum,
  listAlbumPhotos,
  createAlbum,
  updateAlbum,
  deleteAlbum,
};
