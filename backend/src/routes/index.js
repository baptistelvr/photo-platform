const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { Router } = require('express');
const authRoutes = unwrap(require('./authRoutes'));
const albumRoutes = unwrap(require('./albumRoutes'));
const photoRoutes = unwrap(require('./photoRoutes'));
const userRoutes = unwrap(require('./userRoutes'));
const adminRoutes = unwrap(require('./adminRoutes'));
const permissionRoutes = unwrap(require('./permissionRoutes'));

const router = Router();

router.use('/auth', authRoutes);
router.use('/albums', albumRoutes);
router.use('/photos', photoRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/permissions', permissionRoutes);

module.exports = router;

