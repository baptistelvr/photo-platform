const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { PERMISSIONS } = require('../constants/permissions');
const authController = require('../controllers/authController');
const albumController = require('../controllers/albumController');
const photoController = require('../controllers/photoController');
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');
const collectionController = require('../controllers/collectionController');

const router = Router();

// Anonymous traffic only. Image requests are excluded (a gallery loads dozens of
// thumbnails) and so are signed-in accounts, whose folder imports send one request
// per photo. Login attempts keep their own, stricter limiter.
router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => Boolean(req.user) || (req.method === 'GET' && /^\/photos\/\d+\/(thumbnail|file)$/.test(req.path)),
  message: { success: false, error: 'TOO_MANY_REQUESTS', message: 'Trop de requêtes, réessayez dans quelques minutes' },
}));

// Auth
router.post('/auth/login', authController.loginLimiter, authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.me);
router.post('/auth/change-password', requireAuth, authController.changePassword);

// Collections (first level) group albums (second level)
router.get('/collections', collectionController.listCollections);
router.post('/collections', requirePermission(PERMISSIONS.CREATE_ALBUMS), collectionController.createCollection);
// Declared before /collections/:id so that "order" is not taken for an id.
router.put('/collections/order', requirePermission(PERMISSIONS.EDIT_ALBUMS), collectionController.reorderCollections);
router.get('/collections/:id', collectionController.getCollection);
router.get('/collections/:id/photos', collectionController.listCollectionPhotos);
router.put('/collections/:id', requirePermission(PERMISSIONS.EDIT_ALBUMS), collectionController.updateCollection);
router.delete('/collections/:id', requirePermission(PERMISSIONS.DELETE_ALBUMS), collectionController.deleteCollection);

// Albums
router.get('/albums', albumController.listAlbums);
router.post('/albums', requirePermission(PERMISSIONS.CREATE_ALBUMS), albumController.createAlbum);
router.put('/albums/order', requirePermission(PERMISSIONS.EDIT_ALBUMS), albumController.reorderAlbums);
router.get('/albums/:id', albumController.getAlbum);
router.put('/albums/:id', requirePermission(PERMISSIONS.EDIT_ALBUMS), albumController.updateAlbum);
router.delete('/albums/:id', requirePermission(PERMISSIONS.DELETE_ALBUMS), albumController.deleteAlbum);
router.get('/albums/:id/photos', albumController.listAlbumPhotos);
router.put('/albums/:id/photos/order', requirePermission(PERMISSIONS.EDIT_ALBUMS), albumController.reorderPhotos);
router.post(
  '/albums/:id/photos',
  requirePermission(PERMISSIONS.UPLOAD_PHOTOS),
  photoController.upload.array('photos'),
  photoController.uploadAlbumPhotos,
);

// Photos
router.post('/photos/move', requirePermission(PERMISSIONS.MOVE_PHOTOS), photoController.movePhoto);
router.get('/photos/showcase', photoController.showcase);
router.get('/photos/:id', photoController.getPhoto);
router.get('/photos/:id/thumbnail', photoController.streamThumbnail);
router.get('/photos/:id/file', photoController.streamOriginal);
router.delete('/photos/:id', requirePermission(PERMISSIONS.DELETE_PHOTOS), photoController.deletePhoto);

// Users & permissions
router.get('/users', requirePermission(PERMISSIONS.MANAGE_USERS), userController.listUsers);
router.post('/users', requirePermission(PERMISSIONS.MANAGE_USERS), userController.createUser);
router.put('/users/:id', requirePermission(PERMISSIONS.MANAGE_USERS), userController.updateUser);
router.delete('/users/:id', requirePermission(PERMISSIONS.MANAGE_USERS), userController.deleteUser);
router.post('/users/:id/reset-password', requirePermission(PERMISSIONS.MANAGE_USERS), userController.resetPassword);
router.get('/permissions', requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), userController.listPermissions);

// Administration
router.get('/admin/logs', requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), adminController.getLogs);
router.get('/admin/storage', requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), adminController.getStorage);
router.post('/admin/storage/prune', requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), adminController.pruneStorage);

module.exports = router;
