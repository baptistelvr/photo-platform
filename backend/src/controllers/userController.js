const userRepository = require('../repositories/userRepository');
const albumRepository = require('../repositories/albumRepository');
const { userSchema, resetPasswordSchema } = require('../utils/schemas');
const { hashPassword } = require('../utils/password');
const { HttpError } = require('../utils/httpError');
const { addAuditLog } = require('../repositories/auditRepository');

function listUsers(req, res) {
  const users = userRepository.listUsers().map((user) => ({
    ...user,
    permissions: userRepository.getPermissions(user.id),
  }));
  res.json({ success: true, data: users });
}

async function createUser(req, res, next) {
  try {
    const payload = userSchema.parse(req.body);
    if (!payload.password) throw new HttpError(400, 'VALIDATION_ERROR', 'Mot de passe requis');

    if (userRepository.findByEmail(payload.email)) {
      throw new HttpError(409, 'EMAIL_CONFLICT', 'Email déjà utilisé');
    }

    const user = userRepository.createUser({
      name: payload.name,
      email: payload.email,
      passwordHash: await hashPassword(payload.password),
      role: payload.role,
      status: payload.status,
    });

    userRepository.setPermissions(user.id, payload.permissions || []);

    if (payload.accessibleAlbumIds) {
      for (const albumId of payload.accessibleAlbumIds) {
        const current = albumRepository.getAlbumAccessUserIds(albumId);
        albumRepository.setAlbumAccess(albumId, [...new Set([...current, user.id])]);
      }
    }

    addAuditLog({ actorId: req.user.id, action: 'USER_CREATE', objectType: 'user', objectId: String(user.id), ipAddress: req.ip });
    res.status(201).json({ success: true, data: { ...user, permissions: userRepository.getPermissions(user.id) } });
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const payload = userSchema.partial().parse(req.body);

    const existing = userRepository.findById(userId);
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');

    const updated = userRepository.updateUser(userId, payload);
    if (payload.permissions) {
      userRepository.setPermissions(userId, payload.permissions);
    }

    if (payload.accessibleAlbumIds) {
      for (const album of albumRepository.listAlbums().filter((item) => item.visibility === 'protected')) {
        const current = albumRepository.getAlbumAccessUserIds(album.id).filter((id) => id !== userId);
        const shouldAccess = payload.accessibleAlbumIds.includes(album.id);
        albumRepository.setAlbumAccess(album.id, shouldAccess ? [...current, userId] : current);
      }
    }

    addAuditLog({ actorId: req.user.id, action: 'USER_UPDATE', objectType: 'user', objectId: String(userId), ipAddress: req.ip });
    res.json({ success: true, data: { ...updated, permissions: userRepository.getPermissions(userId) } });
  } catch (error) {
    next(error);
  }
}

function deleteUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) throw new HttpError(400, 'INVALID_OPERATION', 'Suppression de votre compte impossible');
    const existing = userRepository.findById(userId);
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');

    userRepository.deleteUser(userId);
    addAuditLog({ actorId: req.user.id, action: 'USER_DELETE', objectType: 'user', objectId: String(userId), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const payload = resetPasswordSchema.parse(req.body);
    const existing = userRepository.findById(userId);
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');

    const hash = await hashPassword(payload.password);
    userRepository.updatePassword(userId, hash);
    addAuditLog({ actorId: req.user.id, action: 'USER_RESET_PASSWORD', objectType: 'user', objectId: String(userId), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

function listPermissions(_req, res) {
  res.json({ success: true, data: userRepository.listPermissions() });
}

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword, listPermissions };
