const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const albumController = require('../controllers/albumController');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { PERMISSIONS } = require('../constants/permissions');
const { HttpError } = require('../utils/httpError');
const { photoMoveSchema } = require('../utils/schemas');
const albumRepository = require('../repositories/albumRepository');
const photoRepository = require('../repositories/photoRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const storageService = require('../services/storageService');
const { hasPermission } = require('../services/accessService');

const router = Router();
const photoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(photoLimiter);

router.get('/:id', albumController.getPhoto);
router.get('/:id/file', (req, res, next) => {
  req.params.variant = 'file';
  return albumController.streamPhoto(req, res, next);
});
router.get('/:id/thumbnail', (req, res, next) => {
  req.params.variant = 'thumbnail';
  return albumController.streamPhoto(req, res, next);
});
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.DELETE_PHOTOS), albumController.deletePhoto);
router.post('/move', async (req, res, next) => {
  try {
    if (!req.session?.userId || !req.user) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentification requise' });
    }
    if (!hasPermission(req.user, PERMISSIONS.MOVE_PHOTOS)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Permission insuffisante' });
    }

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
});

module.exports = router;

