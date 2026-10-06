const { Router } = require('express');
const albumController = require('../controllers/albumController');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { PERMISSIONS } = require('../constants/permissions');

const router = Router();

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
router.post('/move', requireAuth, requirePermission(PERMISSIONS.MOVE_PHOTOS), albumController.movePhoto);

module.exports = router;
