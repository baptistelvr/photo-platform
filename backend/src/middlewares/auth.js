const userRepository = require('../repositories/userRepository');
const { hasPermission } = require('../services/accessService');

async function loadUser(req, _res, next) {
  try {
    req.user = null;
    const userId = req.session?.userId;
    if (!userId) return next();
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') return next();
    user.permissions = await userRepository.getPermissions(user.id);
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentification requise' });
  }
  return next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentification requise' });
    }
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Permission insuffisante' });
    }
    return next();
  };
}

module.exports = { loadUser, requireAuth, requirePermission };
