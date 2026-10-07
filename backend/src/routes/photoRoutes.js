const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const albumController = unwrap(require('../controllers/albumController'));
const { requireAuth, requirePermission } = unwrap(require('../middlewares/auth'));
const { PERMISSIONS } = unwrap(require('../constants/permissions'));
const { HttpError } = unwrap(require('../utils/httpError'));
const { photoMoveSchema } = unwrap(require('../utils/schemas'));
const albumRepository = unwrap(require('../repositories/albumRepository'));
const photoRepository = unwrap(require('../repositories/photoRepository'));
const { addAuditLog } = unwrap(require('../repositories/auditRepository'));
const storageService = unwrap(require('../services/storageService'));
const { hasPermission } = unwrap(require('../services/accessService'));

const router = Router();
const routeChecks = {
  getPhoto: albumController.getPhoto,
  streamPhoto: albumController.streamPhoto,
  deletePhoto: albumController.deletePhoto,
  requireAuth,
  deletePermission: requirePermission(PERMISSIONS.DELETE_PHOTOS),
};
for (const [name, handler] of Object.entries(routeChecks)) {
  if (typeof handler !== 'function') {
    throw new TypeError(`Photo route handler ${name} is ${typeof handler}`);
  }
}
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

