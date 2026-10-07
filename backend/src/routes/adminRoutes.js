const { Router } = require('express');
const { getLogs } = require('../controllers/adminController');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const { PERMISSIONS } = require('../constants/permissions');

const router = Router();

router.get('/logs', requireAuth, requirePermission(PERMISSIONS.MANAGE_PERMISSIONS), getLogs);

module.exports = router;

