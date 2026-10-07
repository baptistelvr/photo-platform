const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const albumController = unwrap(require('../controllers/albumController'));
const { requireAuth, requirePermission } = unwrap(require('../middlewares/auth'));
const { PERMISSIONS } = unwrap(require('../constants/permissions'));

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
router.post('/move', requireAuth, requirePermission(PERMISSIONS.MOVE_PHOTOS), albumController.movePhoto);

module.exports = router;

