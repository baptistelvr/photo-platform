const unwrap = (value) => value?.default ?? value;
const rateLimit = require('express-rate-limit');
const userRepository = unwrap(require('../repositories/userRepository'));
const { verifyPassword, hashPassword } = unwrap(require('../utils/password'));
const { loginSchema, changePasswordSchema } = unwrap(require('../utils/schemas'));
const { HttpError } = unwrap(require('../utils/httpError'));
const { addAuditLog } = unwrap(require('../repositories/auditRepository'));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives de connexion' },
});

async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await userRepository.findByEmail(email);
    if (!user || user.status !== 'active') {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides');
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Identifiants invalides');
    }

    req.session.userId = user.id;
    await userRepository.setLastLogin(user.id);

    await addAuditLog({
      actorId: user.id,
      action: 'AUTH_LOGIN',
      objectType: 'user',
      objectId: String(user.id),
      metadata: { email: user.email },
      ipAddress: req.ip,
    });

    const responseUser = await userRepository.findById(user.id);
    responseUser.permissions = await userRepository.getPermissions(user.id);
    return res.json({ success: true, data: responseUser });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  const actorId = req.session?.userId || null;
  req.session.destroy(async (error) => {
    if (error) return next(error);
    res.clearCookie('photo.sid');
    if (actorId) {
      try { await addAuditLog({ actorId, action: 'AUTH_LOGOUT', objectType: 'user', objectId: String(actorId), ipAddress: req.ip }); }
      catch (auditError) { return next(auditError); }
    }
    return res.json({ success: true });
  });
}

async function me(req, res) {
  const user = await userRepository.findById(req.user.id);
  user.permissions = await userRepository.getPermissions(user.id);
  res.json({ success: true, data: user });
}

async function changePassword(req, res, next) {
  try {
    const payload = changePasswordSchema.parse(req.body);
    const authUser = await userRepository.findAuthById(req.user.id);
    const validCurrent = await verifyPassword(payload.currentPassword, authUser.password_hash);
    if (!validCurrent) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Mot de passe actuel invalide');
    }

    const newHash = await hashPassword(payload.newPassword);
    await userRepository.updatePassword(req.user.id, newHash);
    await addAuditLog({ actorId: req.user.id, action: 'AUTH_CHANGE_PASSWORD', objectType: 'user', objectId: String(req.user.id), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  logout,
  me,
  changePassword,
  loginLimiter,
};

