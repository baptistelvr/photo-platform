const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { Router } = require('express');
const { listPermissions } = unwrap(require('../controllers/userController'));
const { requireAuth, requirePermission } = unwrap(require('../middlewares/auth'));
const { PERMISSIONS } = unwrap(require('../constants/permissions'));

const router = Router();

router.get('/', requireAuth, requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), listPermissions);

module.exports = router;

