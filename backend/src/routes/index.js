const unwrap = (value) => value?.default ?? value;
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

