const unwrap = (value) => value?.default ?? value;
const { Router } = require('express');
const { listPermissions } = unwrap(require('../controllers/userController'));
const { requireAuth, requirePermission } = unwrap(require('../middlewares/auth'));
const { PERMISSIONS } = unwrap(require('../constants/permissions'));

const router = Router();

router.get('/', requireAuth, requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), listPermissions);

module.exports = router;

