const unwrap = (value) => value?.default ?? value;
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const authController = unwrap(require('../controllers/authController'));
const { requireAuth } = unwrap(require('../middlewares/auth'));

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', authController.loginLimiter, authController.login);
router.post('/logout', authLimiter, requireAuth, authController.logout);
router.get('/me', authLimiter, requireAuth, authController.me);
router.post('/change-password', authLimiter, requireAuth, authController.changePassword);

module.exports = router;

