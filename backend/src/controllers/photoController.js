const multer = require('multer');
const { pipeline } = require('node:stream/promises');
const env = require('../config/env');
const albumRepository = require('../repositories/albumRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const photoRepository = require('../repositories/photoRepository');
const settingsRepository = require('../repositories/settingsRepository');
const { isOpenToEveryone, resolveAlbumAccess } = require('../services/accessService');
const { rehomePhoto } = require('../services/albumService');
const { normalizeJpeg } = require('../services/imageService');
const storageService = require('../services/storageService');
const { validateJpegUpload } = require('../utils/fileValidation');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { photoAlbumsSchema, photoMoveSchema } = require('../utils/schemas');
const { publicPhoto } = require('../utils/serializers');
const { accessErrors, loadAlbum, loadReadableAlbum } = require('./albumController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES, files: env.MAX_FILES_PER_UPLOAD },
});

async function loadPhoto(id) {
  const photo = await photoRepository.getPhotoById(parseId(id, 'Photo'));
  if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');
  return photo;
}

/**
 * A photo can be seen through any album it appears in: it is readable as soon
 * as one of them is. Returns that album, a public one when there is one.
 */
async function loadReadablePhotoAlbum(req, photo) {
  const albums = await albumRepository.listAlbumsOfPhoto(photo.id);
  const open = albums.find(isOpenToEveryone);
  if (open) return open;
  let refusal = null;
  for (const album of albums) {
    const access = await resolveAlbumAccess(req, album);
    if (access === 'granted') return album;
    refusal ??= access;
  }
  const [status, code, message] = accessErrors[refusal || 'denied'];
  throw new HttpError(status, code, message);
}

/** "alsoIn" form field: other albums where the uploaded photos should also appear. */
async function parseAlsoIn(value, albumId) {
  const ids = [...new Set(String(value || '').split(',').map((v) => Number.parseInt(v, 10)).filter((v) => v > 0 && v !== albumId))];
  for (const id of ids) {
    if (!(await albumRepository.getAlbumById(id))) throw new HttpError(400, 'INVALID_ALBUM', 'Un des albums choisis n’existe plus');
  }
  return ids;
}

async function uploadAlbumPhotos(req, res, next) {
  try {
    const album = await loadReadableAlbum(req, req.params.id);
    const files = req.files || [];
    if (!files.length) throw new HttpError(400, 'MISSING_FILE', 'Aucun fichier envoyé');
    const alsoIn = await parseAlsoIn(req.body?.alsoIn, album.id);
    const location = await albumRepository.getAlbumLocation(album.id);

    // Validate and decode everything first so a bad file never leaves a partial upload behind.
    files.forEach(validateJpegUpload);
    const prepared = [];
    for (const file of files) prepared.push({ file, image: await normalizeJpeg(file.buffer) });

    const uploaded = [];
    for (const { file, image } of prepared) {
      const stored = await storageService.storePhotoBuffers(location, image.normalized, image.thumbnail);
      const photo = await photoRepository.createPhoto({
        albumId: album.id,
        filename: stored.filename,
        originalName: file.originalname.slice(0, 255),
        originalPath: stored.originalRelative,
        thumbnailPath: stored.thumbnailRelative,
        size: image.normalized.length,
        mimeType: 'image/jpeg',
        width: image.width,
        height: image.height,
        uploadedBy: req.user.id,
      });
      for (const otherId of alsoIn) await photoRepository.addToAlbum(photo.id, otherId);
      uploaded.push(publicPhoto({ ...photo, albumIds: [album.id, ...alsoIn].sort((a, b) => a - b) }));
    }

    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_UPLOAD', objectType: 'album', objectId: String(album.id), metadata: { count: uploaded.length, album: album.name }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: uploaded });
  } catch (error) {
    next(error);
  }
}

async function getPhoto(req, res, next) {
  try {
    const photo = await loadPhoto(req.params.id);
    await loadReadablePhotoAlbum(req, photo);
    res.json({ success: true, data: publicPhoto(photo) });
  } catch (error) {
    next(error);
  }
}

function streamVariant(variant) {
  return async (req, res, next) => {
    try {
      const photo = await loadPhoto(req.params.id);
      const album = await loadReadablePhotoAlbum(req, photo);

      const stream = await storageService.readPhoto(variant === 'thumbnail' ? photo.thumbnailPath : photo.originalPath);
      if (!stream) throw new HttpError(404, 'NOT_FOUND', 'Fichier photo introuvable');

      // A photo id always maps to the same pixels. Public albums may be cached by
      // Vercel's CDN (one function call serves every visitor); anything else stays
      // in the viewer's browser only, briefly, so revoked access does not linger.
      res.type('image/jpeg').set('Cache-Control', isOpenToEveryone(album)
        ? 'public, max-age=3600, s-maxage=3600'
        : 'private, max-age=3600');
      if (variant === 'file' && req.query.download === '1') {
        res.attachment(photo.originalName || `photo-${photo.id}.jpg`);
      }
      await pipeline(stream, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      next(error);
    }
  };
}

/**
 * Random photos for the home page wall, plus totals: from every public album,
 * or only from the albums chosen in the site settings (and their sub-albums).
 */
async function showcase(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 32, 1), 80);
    const { showcase: source } = await settingsRepository.getSiteSettings();
    let albumIds = null;
    if (source.mode === 'albums') {
      const links = await albumRepository.albumLinks();
      const ids = new Set();
      for (const id of source.albumIds.filter((albumId) => links.has(albumId))) {
        ids.add(id);
        for (const childId of await albumRepository.listDescendantIds(id, links)) ids.add(childId);
      }
      albumIds = [...ids];
    }
    const [photos, totals] = await Promise.all([
      photoRepository.listPublicShowcase(limit, albumIds),
      photoRepository.publicTotals(albumIds),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { photos, totalPhotos: totals.photos, totalAlbums: totals.albums } });
  } catch (error) {
    next(error);
  }
}

async function deletePhoto(req, res, next) {
  try {
    const photo = await loadPhoto(req.params.id);
    await storageService.deletePhotoFiles(photo);
    await photoRepository.deletePhoto(photo.id);
    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_DELETE', objectType: 'photo', objectId: String(photo.id), metadata: { name: photo.originalName }, ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Moves a photo from one album to another: it leaves `fromAlbumId` (by default
 * the album holding its files) and appears at the end of the target. Its files
 * follow when they were in the album it leaves.
 */
async function movePhoto(req, res, next) {
  try {
    const payload = photoMoveSchema.parse(req.body);
    const photo = await loadPhoto(payload.photoId);
    const targetAlbum = await loadAlbum(payload.targetAlbumId).catch(() => {
      throw new HttpError(404, 'NOT_FOUND', 'Album cible introuvable');
    });
    const fromAlbumId = payload.fromAlbumId ?? photo.albumId;
    const memberships = await photoRepository.listPhotoAlbumIds(photo.id);
    if (!memberships.includes(fromAlbumId)) throw new HttpError(400, 'NOT_IN_ALBUM', 'Cette photo n’est pas dans cet album');
    if (targetAlbum.id !== fromAlbumId) {
      await photoRepository.addToAlbum(photo.id, targetAlbum.id);
      await photoRepository.removeFromAlbum(photo.id, fromAlbumId);
      if (photo.albumId === fromAlbumId) await rehomePhoto(photo, targetAlbum.id);
      await addAuditLog({ actorId: req.user.id, action: 'PHOTO_MOVE', objectType: 'photo', objectId: String(photo.id), metadata: { from: fromAlbumId, to: targetAlbum.id }, ipAddress: req.ip });
    }
    const moved = await photoRepository.getPhotoById(photo.id);
    return res.json({ success: true, data: publicPhoto({ ...moved, albumIds: await photoRepository.listPhotoAlbumIds(photo.id) }) });
  } catch (error) {
    return next(error);
  }
}

/** Shows a photo in more albums, without duplicating its file. */
async function addToAlbums(req, res, next) {
  try {
    const photo = await loadPhoto(req.params.id);
    const { albumIds } = photoAlbumsSchema.parse(req.body);
    for (const id of albumIds) {
      if (!(await albumRepository.getAlbumById(id))) throw new HttpError(400, 'INVALID_ALBUM', 'Un des albums choisis n’existe plus');
    }
    for (const id of albumIds) await photoRepository.addToAlbum(photo.id, id);
    const now = await photoRepository.listPhotoAlbumIds(photo.id);
    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_COPY', objectType: 'photo', objectId: String(photo.id), metadata: { name: photo.originalName, albums: albumIds }, ipAddress: req.ip });
    res.json({ success: true, data: { albumIds: now } });
  } catch (error) {
    next(error);
  }
}

/** Takes a photo out of one album; it stays in the others. Its last album cannot be left: delete it instead. */
async function removeFromAlbum(req, res, next) {
  try {
    const album = await loadAlbum(req.params.id);
    const photo = await loadPhoto(req.params.photoId);
    const memberships = await photoRepository.listPhotoAlbumIds(photo.id);
    if (!memberships.includes(album.id)) throw new HttpError(404, 'NOT_FOUND', 'Cette photo n’est pas dans cet album');
    if (memberships.length === 1) {
      throw new HttpError(400, 'LAST_ALBUM', 'Cette photo n’est dans aucun autre album : supprimez-la plutôt');
    }
    await photoRepository.removeFromAlbum(photo.id, album.id);
    const remaining = memberships.filter((id) => id !== album.id);
    if (photo.albumId === album.id) await rehomePhoto(photo, remaining[0]);
    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_UNLINK', objectType: 'photo', objectId: String(photo.id), metadata: { name: photo.originalName, album: album.name }, ipAddress: req.ip });
    res.json({ success: true, data: { albumIds: remaining } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  upload,
  uploadAlbumPhotos,
  getPhoto,
  showcase,
  streamThumbnail: streamVariant('thumbnail'),
  streamOriginal: streamVariant('file'),
  deletePhoto,
  movePhoto,
  addToAlbums,
  removeFromAlbum,
};
