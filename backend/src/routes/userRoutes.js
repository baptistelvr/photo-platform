const unwrap = (value) => value?.default ?? value;
const { Router } = require('express');
const userController = unwrap(require('../controllers/userController'));
const { requireAuth, requirePermission } = unwrap(require('../middlewares/auth'));
const { PERMISSIONS } = unwrap(require('../constants/permissions'));

const router = Router();

router.use(requireAuth);
router.get('/', requirePermission(PERMISSIONS.MANAGE_USERS), userController.listUsers);
router.post('/', requirePermission(PERMISSIONS.MANAGE_USERS), userController.createUser);
router.put('/:id', requirePermission(PERMISSIONS.MANAGE_USERS), userController.updateUser);
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_USERS), userController.deleteUser);
router.post('/:id/reset-password', requirePermission(PERMISSIONS.MANAGE_USERS), userController.resetPassword);

module.exports = router;

