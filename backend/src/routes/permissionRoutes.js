const { Router } = require('express');
const { listPermissions } = require('../controllers/userController');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { PERMISSIONS } = require('../constants/permissions');

const router = Router();

router.get('/', requireAuth, requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), listPermissions);

module.exports = router;

