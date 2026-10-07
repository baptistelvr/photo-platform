const unwrap = (value) => value?.default ?? value;
const multer = require('multer');
const { Readable } = require('node:stream');
const { HttpError } = unwrap(require('../utils/httpError'));
const { albumSchema, photoMoveSchema } = unwrap(require('../utils/schemas'));
const albumRepository = unwrap(require('../repositories/albumRepository'));
const photoRepository = unwrap(require('../repositories/photoRepository'));
const { addAuditLog } = unwrap(require('../repositories/auditRepository'));
const { canAccessAlbum, hasPermission } = unwrap(require('../services/accessService'));
const { hashPassword, verifyPassword } = unwrap(require('../utils/password'));
const env = unwrap(require('../config/env'));
const { validateJpegUpload } = unwrap(require('../utils/fileValidation'));
const { normalizeJpeg } = unwrap(require('../services/imageService'));
const storageService = unwrap(require('../services/storageService'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_FILE_SIZE_BYTES, files: 3 } });

async function filterVisibleAlbums(user, albums) {
  const visible = await Promise.all(albums.map(async (album) => {
    if (album.visibility === 'public') return true;
    if (!user) return false;
    if (user.role === 'main_admin') return true;
    if (user.permissions?.includes('VIEW_PROTECTED_ALBUMS')) return true;
    return albumRepository.userHasAlbumAccess(album.id, user.id);
  }));
  return albums.filter((_, index) => visible[index]);
}

async function canAccessAlbumWithPassword(req, album) {
  if (await canAccessAlbum(req.user || null, album)) return true;
  if (album.visibility !== 'protected' || !album.passwordHash) return false;
  const unlocked = req.session?.unlockedAlbums || [];
  if (unlocked.includes(album.id)) return true;
  const submittedPassword = req.get('x-album-password');
  if (!submittedPassword) return false;
  const isValid = await verifyPassword(submittedPassword, album.passwordHash);
  if (isValid) {
    req.session.unlockedAlbums = [...new Set([...(req.session.unlockedAlbums || []), album.id])];
  }
  return isValid;
}

async function listAlbums(req, res, next) {
  try {
    const albums = await filterVisibleAlbums(req.user || null, await albumRepository.listAlbums());
    res.json({ success: true, data: albums });
  } catch (error) { next(error); }
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

    if (payload.accessUserIds?.length) {
      await albumRepository.setAlbumAccess(album.id, payload.accessUserIds);
    }

    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_CREATE', objectType: 'album', objectId: String(album.id), metadata: { name: album.name }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: album });
  } catch (error) {
    next(error);
  }
}

async function getAlbum(req, res, next) {
  try {
    const album = await albumRepository.getAlbumById(Number(req.params.id));
    if (!album) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');

    const userHasAccess = await canAccessAlbumWithPassword(req, album);
    if (!userHasAccess) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        album.visibility === 'protected' && album.passwordHash ? 'Mot de passe album requis' : 'Accès album refusé'
      );
    }

    const accessUserIds = await albumRepository.getAlbumAccessUserIds(album.id);
    res.json({
      success: true,
      data: {
        ...album,
        hasPassword: Boolean(album.passwordHash),
        accessUserIds,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateAlbum(req, res, next) {
  try {
    const albumId = Number(req.params.id);
    const current = await albumRepository.getAlbumById(albumId);
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');

    const payload = albumSchema.parse(req.body);
    let passwordHash = current.passwordHash;
    if (payload.visibility === 'public') {
      passwordHash = null;
    } else if (payload.password) {
      passwordHash = await hashPassword(payload.password);
    }

    const updated = await albumRepository.updateAlbum(albumId, {
      name: payload.name,
      description: payload.description,
      visibility: payload.visibility,
      passwordHash,
      coverPhotoId: payload.coverPhotoId,
    });

    if (current.name !== updated.name) {
      const photos = await albumRepository.listAlbumPhotos(albumId);
      const renamedAlbum = { ...current, name: updated.name };
      for (const item of photos) {
        const photo = await photoRepository.getPhotoById(item.id);
        const movedPaths = await storageService.movePhotoFiles(photo, renamedAlbum);
        await photoRepository.movePhoto(photo.id, albumId, movedPaths);
      }
    }

    if (payload.accessUserIds) {
      await albumRepository.setAlbumAccess(albumId, payload.accessUserIds);
    }

    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_UPDATE', objectType: 'album', objectId: String(albumId), ipAddress: req.ip });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteAlbum(req, res, next) {
  try {
    const albumId = Number(req.params.id);
    const album = await albumRepository.getAlbumById(albumId);
    if (!album) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');

    const photos = await albumRepository.listAlbumPhotos(albumId);
    for (const photo of photos) {
      const full = await photoRepository.getPhotoById(photo.id);
      await storageService.deletePhotoFiles(full);
    }

    await albumRepository.deleteAlbum(albumId);
    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_DELETE', objectType: 'album', objectId: String(albumId), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function listAlbumPhotos(req, res, next) {
  try {
    const album = await albumRepository.getAlbumById(Number(req.params.id));
    if (!album) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');
    if (!(await canAccessAlbumWithPassword(req, album))) {
      throw new HttpError(403, 'FORBIDDEN', 'Accès album refusé');
    }

    const photos = await albumRepository.listAlbumPhotos(album.id);
    res.json({ success: true, data: photos });
  } catch (error) {
    next(error);
  }
}

async function uploadAlbumPhotos(req, res, next) {
  try {
    const albumId = Number(req.params.id);
    const album = await albumRepository.getAlbumById(albumId);
    if (!album) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');
    if (!(await canAccessAlbumWithPassword(req, album))) {
      throw new HttpError(403, 'FORBIDDEN', 'Accès album refusé');
    }

    const files = req.files || [];
    if (!files.length) throw new HttpError(400, 'MISSING_FILE', 'Aucun fichier envoyé');

    const uploaded = [];
    for (const file of files) {
      await validateJpegUpload(file);
      const transformed = await normalizeJpeg(file.buffer);
      const stored = await storageService.storePhotoBuffers(album, transformed.normalized, transformed.thumbnail);

      const photo = await photoRepository.createPhoto({
        albumId,
        filename: stored.filename,
        originalName: file.originalname,
        originalPath: stored.originalRelative,
        thumbnailPath: stored.thumbnailRelative,
        size: file.size,
        mimeType: 'image/jpeg',
        width: transformed.width,
        height: transformed.height,
        uploadedBy: req.user.id,
      });
      uploaded.push(photo);
    }

    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_UPLOAD', objectType: 'album', objectId: String(albumId), metadata: { count: uploaded.length }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: uploaded });
  } catch (error) {
    next(error);
  }
}

async function getPhoto(req, res, next) {
  try {
    const photo = await photoRepository.getPhotoById(Number(req.params.id));
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');
    const album = await albumRepository.getAlbumById(photo.albumId);
    if (!(await canAccessAlbumWithPassword(req, album))) {
      throw new HttpError(403, 'FORBIDDEN', 'Accès photo refusé');
    }

    res.json({
      success: true,
      data: {
        id: photo.id,
        albumId: photo.albumId,
        filename: photo.filename,
        originalName: photo.originalName,
        size: photo.size,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        originalUrl: `/api/photos/${photo.id}/file`,
        thumbnailUrl: `/api/photos/${photo.id}/thumbnail`,
        createdAt: photo.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function streamPhoto(req, res, next) {
  try {
    const photo = await photoRepository.getPhotoById(Number(req.params.id));
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');
    const album = await albumRepository.getAlbumById(photo.albumId);
    if (!(await canAccessAlbumWithPassword(req, album))) {
      throw new HttpError(403, 'FORBIDDEN', 'Accès photo refusé');
    }

    const relative = req.params.variant === 'thumbnail' ? photo.thumbnailPath : photo.originalPath;
    const image = await storageService.readPhoto(relative);
    if (!image) throw new HttpError(404, 'NOT_FOUND', 'Fichier photo introuvable');
    res.type('image/jpeg').set('Cache-Control', 'private, no-store');
    const stream = typeof image.stream.pipe === 'function' ? image.stream : Readable.fromWeb(image.stream);
    stream.on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
}

async function deletePhoto(req, res, next) {
  try {
    const photo = await photoRepository.getPhotoById(Number(req.params.id));
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');

    if (!hasPermission(req.user, 'DELETE_PHOTOS')) {
      throw new HttpError(403, 'FORBIDDEN', 'Permission insuffisante');
    }

    await storageService.deletePhotoFiles(photo);
    await photoRepository.deletePhoto(photo.id);
    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_DELETE', objectType: 'photo', objectId: String(photo.id), ipAddress: req.ip });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function movePhoto(req, res, next) {
  try {
    const payload = photoMoveSchema.parse(req.body);
    const photo = await photoRepository.getPhotoById(payload.photoId);
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');

    const targetAlbum = await albumRepository.getAlbumById(payload.targetAlbumId);
    if (!targetAlbum) throw new HttpError(404, 'NOT_FOUND', 'Album cible introuvable');

    const movedPaths = await storageService.movePhotoFiles(photo, targetAlbum);
    const movedPhoto = await photoRepository.movePhoto(photo.id, targetAlbum.id, movedPaths);

    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_MOVE', objectType: 'photo', objectId: String(photo.id), metadata: { from: photo.albumId, to: payload.targetAlbumId }, ipAddress: req.ip });
    res.json({ success: true, data: movedPhoto });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  upload,
  listAlbums,
  createAlbum,
  getAlbum,
  updateAlbum,
  deleteAlbum,
  listAlbumPhotos,
  uploadAlbumPhotos,
  getPhoto,
  streamPhoto,
  deletePhoto,
  movePhoto,
};
module.exports.getPhoto = getPhoto;
module.exports.streamPhoto = streamPhoto;
module.exports.deletePhoto = deletePhoto;

