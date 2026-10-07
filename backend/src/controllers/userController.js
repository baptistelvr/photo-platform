const albumRepository = require('../repositories/albumRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const photoRepository = require('../repositories/photoRepository');
const userRepository = require('../repositories/userRepository');
const { hasPermission, isMainAdmin } = require('../services/accessService');
const { PERMISSIONS } = require('../constants/permissions');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { hashPassword } = require('../utils/password');
const { userSchema, resetPasswordSchema } = require('../utils/schemas');

// Only the main administrator may create, promote or modify another main administrator,
// and only holders of MANAGE_PERMISSIONS may change permissions.
function assertCanManage(actor, { target, payload }) {
  if (target && isMainAdmin(target) && !isMainAdmin(actor)) {
    throw new HttpError(403, 'FORBIDDEN', 'Seul l’administrateur principal peut modifier ce compte');
  }
  if (payload?.role === 'main_admin' && !isMainAdmin(actor)) {
    throw new HttpError(403, 'FORBIDDEN', 'Seul l’administrateur principal peut attribuer ce rôle');
  }
  if (payload?.permissions && !hasPermission(actor, PERMISSIONS.MANAGE_PERMISSIONS)) {
    throw new HttpError(403, 'FORBIDDEN', 'La gestion des permissions nécessite MANAGE_PERMISSIONS');
  }
}

async function loadUser(id) {
  const user = await userRepository.findById(parseId(id, 'Utilisateur'));
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable');
  return user;
}

async function withDetails(user) {
  return {
    ...user,
    permissions: await userRepository.getPermissions(user.id),
    accessibleAlbumIds: await albumRepository.listAccessibleAlbumIds(user.id),
  };
}

async function listUsers(_req, res, next) {
  try {
    const [users, permissions, access] = await Promise.all([
      userRepository.listUsers(),
      userRepository.listPermissionsByUser(),
      albumRepository.listAccessByUser(),
    ]);
    res.json({
      success: true,
      data: users.map((user) => ({
        ...user,
        permissions: permissions.get(user.id) || [],
        accessibleAlbumIds: access.get(user.id) || [],
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const payload = userSchema.parse(req.body);
    assertCanManage(req.user, { payload });
    if (!payload.password) throw new HttpError(400, 'VALIDATION_ERROR', 'Mot de passe requis');
    if (await userRepository.findByEmail(payload.email)) throw new HttpError(409, 'EMAIL_CONFLICT', 'Cet email est déjà utilisé');

    const user = await userRepository.createUser({
      name: payload.name,
      email: payload.email,
      passwordHash: await hashPassword(payload.password),
      role: payload.role,
      status: payload.status,
    });
    await userRepository.setPermissions(user.id, payload.permissions || []);
    if (payload.accessibleAlbumIds) await albumRepository.setUserAlbumAccess(user.id, payload.accessibleAlbumIds);

    await addAuditLog({ actorId: req.user.id, action: 'USER_CREATE', objectType: 'user', objectId: String(user.id), metadata: { email: user.email }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: await withDetails(user) });
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const target = await loadUser(req.params.id);
    const payload = userSchema.partial().parse(req.body);
    assertCanManage(req.user, { target, payload });

    if (target.id === req.user.id && (payload.status === 'disabled' || (payload.role && payload.role !== target.role))) {
      throw new HttpError(400, 'INVALID_OPERATION', 'Vous ne pouvez pas désactiver votre compte ni changer votre propre rôle');
    }
    if (payload.email && payload.email.toLowerCase() !== target.email) {
      const existing = await userRepository.findByEmail(payload.email);
      if (existing && existing.id !== target.id) throw new HttpError(409, 'EMAIL_CONFLICT', 'Cet email est déjà utilisé');
    }

    const updated = await userRepository.updateUser(target.id, payload);
    if (payload.permissions) await userRepository.setPermissions(target.id, payload.permissions);
    if (payload.accessibleAlbumIds) await albumRepository.setUserAlbumAccess(target.id, payload.accessibleAlbumIds);
    if (payload.password) await userRepository.updatePassword(target.id, await hashPassword(payload.password));

    await addAuditLog({ actorId: req.user.id, action: 'USER_UPDATE', objectType: 'user', objectId: String(target.id), metadata: { email: updated.email }, ipAddress: req.ip });
    res.json({ success: true, data: await withDetails(updated) });
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const target = await loadUser(req.params.id);
    if (req.user.id === target.id) throw new HttpError(400, 'INVALID_OPERATION', 'Vous ne pouvez pas supprimer votre propre compte');
    assertCanManage(req.user, { target });

    // Photos keep an uploader reference; hand them over to the admin removing the account.
    await photoRepository.reassignUploader(target.id, req.user.id);
    await userRepository.deleteUser(target.id);
    await addAuditLog({ actorId: req.user.id, action: 'USER_DELETE', objectType: 'user', objectId: String(target.id), metadata: { email: target.email }, ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const target = await loadUser(req.params.id);
    assertCanManage(req.user, { target });
    const payload = resetPasswordSchema.parse(req.body);
    await userRepository.updatePassword(target.id, await hashPassword(payload.password));
    await addAuditLog({ actorId: req.user.id, action: 'USER_RESET_PASSWORD', objectType: 'user', objectId: String(target.id), ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function listPermissions(_req, res, next) {
  try {
    res.json({ success: true, data: await userRepository.listPermissions() });
  } catch (error) {
    next(error);
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword, listPermissions };
