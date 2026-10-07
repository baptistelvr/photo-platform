const unwrap = (value) => value?.default ?? value;
const { Router } = require('express');
const { getLogs } = unwrap(require('../controllers/adminController'));
const { requireAuth, requirePermission } = unwrap(require('../middlewares/auth'));
const { PERMISSIONS } = unwrap(require('../constants/permissions'));

const router = Router();

router.get('/logs', requireAuth, requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), getLogs);

module.exports = router;

