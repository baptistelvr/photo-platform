const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { HttpError } = unwrap(require('../utils/httpError'));
const { photoMoveSchema } = unwrap(require('../utils/schemas'));
const albumRepository = unwrap(require('../repositories/albumRepository'));
const photoRepository = unwrap(require('../repositories/photoRepository'));
const { addAuditLog } = unwrap(require('../repositories/auditRepository'));
const storageService = unwrap(require('../services/storageService'));

async function movePhotoController(req, res, next) {
  try {
    const payload = photoMoveSchema.parse(req.body);
    const photo = await photoRepository.getPhotoById(payload.photoId);
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable');

    const targetAlbum = await albumRepository.getAlbumById(payload.targetAlbumId);
    if (!targetAlbum) throw new HttpError(404, 'NOT_FOUND', 'Album cible introuvable');

    const movedPaths = await storageService.movePhotoFiles(photo, targetAlbum);
    const movedPhoto = await photoRepository.movePhoto(photo.id, targetAlbum.id, movedPaths);
    await addAuditLog({
      actorId: req.user.id,
      action: 'PHOTO_MOVE',
      objectType: 'photo',
      objectId: String(photo.id),
      metadata: { from: photo.albumId, to: payload.targetAlbumId },
      ipAddress: req.ip,
    });
    return res.json({ success: true, data: movedPhoto });
  } catch (error) {
    return next(error);
  }
}

module.exports = movePhotoController;
