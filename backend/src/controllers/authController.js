const rateLimit = require('express-rate-limit');
const userRepository = require('../repositories/userRepository');
const { verifyPassword, hashPassword } = require('../utils/password');
const { loginSchema, changePasswordSchema } = require('../utils/schemas');
const { HttpError } = require('../utils/httpError');
const { addAuditLog } = require('../repositories/auditRepository');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives de connexion, réessayez dans quelques minutes' },
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function sessionUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user) return null;
  user.permissions = await userRepository.getPermissions(user.id);
  return user;
}

async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await userRepository.findByEmail(email);
    const validPassword = user ? await verifyPassword(password, user.password_hash) : false;
    if (!user || !validPassword || user.status !== 'active') {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect');
    }

    // Keep albums unlocked before signing in, but issue a fresh session id.
    const unlockedAlbums = req.session.unlockedAlbums;
    await regenerateSession(req);
    req.session.userId = user.id;
    if (unlockedAlbums) req.session.unlockedAlbums = unlockedAlbums;
    await saveSession(req);

    await userRepository.setLastLogin(user.id);
    await addAuditLog({
      actorId: user.id,
      action: 'AUTH_LOGIN',
      objectType: 'user',
      objectId: String(user.id),
      ipAddress: req.ip,
    });

    return res.json({ success: true, data: await sessionUser(user.id) });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  const actorId = req.user?.id || null;
  req.session.destroy(async (error) => {
    if (error) return next(error);
    res.clearCookie('photo.sid', { path: '/' });
    if (actorId) {
      await addAuditLog({ actorId, action: 'AUTH_LOGOUT', objectType: 'user', objectId: String(actorId), ipAddress: req.ip })
        .catch(() => {});
    }
    return res.json({ success: true });
  });
}

// Returns the signed-in user, or null for visitors (no 401 noise on every page load).
async function me(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: req.user ? await sessionUser(req.user.id) : null });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const payload = changePasswordSchema.parse(req.body);
    const authUser = await userRepository.findAuthById(req.user.id);
    if (!(await verifyPassword(payload.currentPassword, authUser.password_hash))) {
      throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Mot de passe actuel incorrect');
    }

    await userRepository.updatePassword(req.user.id, await hashPassword(payload.newPassword));
    await addAuditLog({ actorId: req.user.id, action: 'AUTH_CHANGE_PASSWORD', objectType: 'user', objectId: String(req.user.id), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = { login, logout, me, changePassword, loginLimiter };
