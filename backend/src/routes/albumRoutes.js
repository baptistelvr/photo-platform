const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const albumController = require('../controllers/albumController');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { PERMISSIONS } = require('../constants/permissions');

const router = Router();
const albumLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(albumLimiter);

router.get('/', albumController.listAlbums);
router.post('/', requireAuth, requirePermission(PERMISSIONS.CREATE_ALBUMS), albumController.createAlbum);
router.get('/:id', albumController.getAlbum);
router.put('/:id', requireAuth, requirePermission(PERMISSIONS.EDIT_ALBUMS), albumController.updateAlbum);
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.DELETE_ALBUMS), albumController.deleteAlbum);
router.get('/:id/photos', albumController.listAlbumPhotos);
router.post(
  '/:id/photos',
  requireAuth,
  requirePermission(PERMISSIONS.UPLOAD_PHOTOS),
  albumController.upload.array('photos', 20),
  albumController.uploadAlbumPhotos
);

module.exports = router;

