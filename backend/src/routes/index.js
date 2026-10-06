const { Router } = require('express');
const authRoutes = require('./authRoutes');
const albumRoutes = require('./albumRoutes');
const photoRoutes = require('./photoRoutes');
const userRoutes = require('./userRoutes');
const adminRoutes = require('./adminRoutes');
const permissionRoutes = require('./permissionRoutes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/albums', albumRoutes);
router.use('/photos', photoRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/permissions', permissionRoutes);

module.exports = router;
