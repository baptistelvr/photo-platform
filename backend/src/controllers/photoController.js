const multer = require('multer');
const { pipeline } = require('node:stream/promises');
const env = require('../config/env');
const { addAuditLog } = require('../repositories/auditRepository');
const photoRepository = require('../repositories/photoRepository');
const { normalizeJpeg } = require('../services/imageService');
const storageService = require('../services/storageService');
const { validateJpegUpload } = require('../utils/fileValidation');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { photoMoveSchema } = require('../utils/schemas');
const { publicPhoto } = require('../utils/serializers');
const { loadAlbum, loadReadableAlbum } = require('./albumController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES, files: env.MAX_FILES_PER_UPLOAD },
});

async function loadPhoto(id) {
  const photo = await photoRepository.getPhotoById(parseId(id, 'Photo'));
  if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');
  return photo;
}

async function uploadAlbumPhotos(req, res, next) {
  try {
    const album = await loadReadableAlbum(req, req.params.id);
    const files = req.files || [];
    if (!files.length) throw new HttpError(400, 'MISSING_FILE', 'Aucun fichier envoyé');

    // Validate and decode everything first so a bad file never leaves a partial upload behind.
    files.forEach(validateJpegUpload);
    const prepared = [];
    for (const file of files) prepared.push({ file, image: await normalizeJpeg(file.buffer) });

    const uploaded = [];
    for (const { file, image } of prepared) {
      const stored = await storageService.storePhotoBuffers(album, image.normalized, image.thumbnail);
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
      uploaded.push(publicPhoto(photo));
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
    await loadReadableAlbum(req, photo.albumId);
    res.json({ success: true, data: publicPhoto(photo) });
  } catch (error) {
    next(error);
  }
}

function streamVariant(variant) {
  return async (req, res, next) => {
    try {
      const photo = await loadPhoto(req.params.id);
      const album = await loadReadableAlbum(req, photo.albumId);

      const stream = await storageService.readPhoto(variant === 'thumbnail' ? photo.thumbnailPath : photo.originalPath);
      if (!stream) throw new HttpError(404, 'NOT_FOUND', 'Fichier photo introuvable');

      // A photo id always maps to the same pixels. Public albums may be cached by
      // Vercel's CDN (one function call serves every visitor); anything else stays
      // in the viewer's browser only, briefly, so revoked access does not linger.
      res.type('image/jpeg').set('Cache-Control', album.visibility === 'public'
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

/** Random photos from public albums, plus totals, for the home page. */
async function showcase(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 32, 1), 80);
    const [photos, totals] = await Promise.all([
      photoRepository.listPublicShowcase(limit),
      photoRepository.publicTotals(),
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

async function movePhoto(req, res, next) {
  try {
    const payload = photoMoveSchema.parse(req.body);
    const photo = await loadPhoto(payload.photoId);
    const targetAlbum = await loadAlbum(payload.targetAlbumId).catch(() => {
      throw new HttpError(404, 'NOT_FOUND', 'Album cible introuvable');
    });
    if (targetAlbum.id === photo.albumId) {
      return res.json({ success: true, data: publicPhoto(photo) });
    }

    const paths = await storageService.movePhotoFiles(photo, targetAlbum);
    const moved = await photoRepository.movePhoto(photo.id, targetAlbum.id, paths);

    await addAuditLog({ actorId: req.user.id, action: 'PHOTO_MOVE', objectType: 'photo', objectId: String(photo.id), metadata: { from: photo.albumId, to: targetAlbum.id }, ipAddress: req.ip });
    return res.json({ success: true, data: publicPhoto(moved) });
  } catch (error) {
    return next(error);
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
};
