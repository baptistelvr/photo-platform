const unwrap = (value) => { let current = value; for (let depth = 0; depth < 4 && current && current.default; depth += 1) current = current.default; return current; };
const { hasPermission } = unwrap(require('../services/accessService'));

function requireAuth(req, res, next) {
  if (!req.session?.userId || !req.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Authentification requise' });
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Permission insuffisante' });
    }
    next();
  };
}

module.exports = { requireAuth, requirePermission };

