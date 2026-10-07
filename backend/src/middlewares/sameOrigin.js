const env = require('../config/env');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for cookie-authenticated requests: state-changing requests
 * must come from the site itself (or the configured FRONTEND_URL).
 *
 * `req.host` honours X-Forwarded-Host behind a trusted proxy, which matters on
 * Vercel where the request reaches the function through the platform router.
 */
function sameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const source = originOf(req.get('origin')) || originOf(req.get('referer'));
  if (!source && env.NODE_ENV === 'test') return next();

  const allowed = new Set([`${req.protocol}://${req.host}`]);
  if (env.FRONTEND_URL) allowed.add(originOf(env.FRONTEND_URL));

  if (source && allowed.has(source)) return next();
  return res.status(403).json({ success: false, error: 'FORBIDDEN_ORIGIN', message: 'Origine de la requête non autorisée' });
}

module.exports = { sameOrigin };
