const userRepository = require('../repositories/userRepository');
const albumRepository = require('../repositories/albumRepository');
const { userSchema, resetPasswordSchema } = require('../utils/schemas');
const { hashPassword } = require('../utils/password');
const { HttpError } = require('../utils/httpError');
const { addAuditLog } = require('../repositories/auditRepository');

async function listUsers(_req, res) {
  const users = await userRepository.listUsers();
  const data = await Promise.all(users.map(async (user) => ({ ...user, permissions: await userRepository.getPermissions(user.id) })));
  res.json({ success: true, data });
}

async function createUser(req, res, next) {
  try {
    const payload = userSchema.parse(req.body);
    if (!payload.password) throw new HttpError(400, 'VALIDATION_ERROR', 'Mot de passe requis');
    if (await userRepository.findByEmail(payload.email)) throw new HttpError(409, 'EMAIL_CONFLICT', 'Email déjà utilisé');

    const user = await userRepository.createUser({
      name: payload.name, email: payload.email, passwordHash: await hashPassword(payload.password),
      role: payload.role, status: payload.status,
    });
    await userRepository.setPermissions(user.id, payload.permissions || []);
    if (payload.accessibleAlbumIds) {
      for (const albumId of payload.accessibleAlbumIds) {
        const current = await albumRepository.getAlbumAccessUserIds(albumId);
        await albumRepository.setAlbumAccess(albumId, [...new Set([...current, user.id])]);
      }
    }
    await addAuditLog({ actorId: req.user.id, action: 'USER_CREATE', objectType: 'user', objectId: String(user.id), ipAddress: req.ip });
    res.status(201).json({ success: true, data: { ...user, permissions: await userRepository.getPermissions(user.id) } });
  } catch (error) { next(error); }
}

async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const payload = userSchema.partial().parse(req.body);
    if (!await userRepository.findById(userId)) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');
    const updated = await userRepository.updateUser(userId, payload);
    if (payload.permissions) await userRepository.setPermissions(userId, payload.permissions);
    if (payload.accessibleAlbumIds) {
      const albums = (await albumRepository.listAlbums()).filter((album) => album.visibility === 'protected');
      for (const album of albums) {
        const current = (await albumRepository.getAlbumAccessUserIds(album.id)).filter((id) => id !== userId);
        const shouldAccess = payload.accessibleAlbumIds.includes(album.id);
        await albumRepository.setAlbumAccess(album.id, shouldAccess ? [...current, userId] : current);
      }
    }
    await addAuditLog({ actorId: req.user.id, action: 'USER_UPDATE', objectType: 'user', objectId: String(userId), ipAddress: req.ip });
    res.json({ success: true, data: { ...updated, permissions: await userRepository.getPermissions(userId) } });
  } catch (error) { next(error); }
}

async function deleteUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) throw new HttpError(400, 'INVALID_OPERATION', 'Suppression de votre compte impossible');
    if (!await userRepository.findById(userId)) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');
    await userRepository.deleteUser(userId);
    await addAuditLog({ actorId: req.user.id, action: 'USER_DELETE', objectType: 'user', objectId: String(userId), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) { next(error); }
}

async function resetPassword(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const payload = resetPasswordSchema.parse(req.body);
    if (!await userRepository.findById(userId)) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');
    await userRepository.updatePassword(userId, await hashPassword(payload.password));
    await addAuditLog({ actorId: req.user.id, action: 'USER_RESET_PASSWORD', objectType: 'user', objectId: String(userId), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) { next(error); }
}

async function listPermissions(_req, res) {
  res.json({ success: true, data: await userRepository.listPermissions() });
}

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword, listPermissions };
