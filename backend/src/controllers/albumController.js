const db = require('../config/db');
const albumRepository = require('../repositories/albumRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const collectionRepository = require('../repositories/collectionRepository');
const photoRepository = require('../repositories/photoRepository');
const { hasPermission, resolveAlbumAccess } = require('../services/accessService');
const { destroyAlbums, relocateAlbumPhotos, visibleAlbumTree } = require('../services/albumService');
const { PERMISSIONS } = require('../constants/permissions');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { hashPassword } = require('../utils/password');
const { mergeOrder } = require('../utils/order');
const { albumOrderSchema, albumSchema, orderSchema } = require('../utils/schemas');
const { publicAlbum, publicPhoto } = require('../utils/serializers');

const accessErrors = {
  password_required: [403, 'ALBUM_PASSWORD_REQUIRED', 'Cet album est protégé par un mot de passe'],
  invalid_password: [403, 'INVALID_ALBUM_PASSWORD', 'Mot de passe incorrect'],
  denied: [403, 'ALBUM_FORBIDDEN', 'Vous n’avez pas accès à cet album'],
  collection_password_required: [403, 'COLLECTION_PASSWORD_REQUIRED', 'Cette collection est protégée par un mot de passe'],
  invalid_collection_password: [403, 'INVALID_COLLECTION_PASSWORD', 'Mot de passe incorrect'],
};

async function assertCollectionExists(collectionId) {
  if (!collectionId) return;
  if (!(await collectionRepository.getCollectionById(collectionId))) {
    throw new HttpError(400, 'INVALID_COLLECTION', 'Collection introuvable');
  }
}

async function loadAlbum(id) {
  const album = await albumRepository.getAlbumById(parseId(id, 'Album'));
  if (!album) throw new HttpError(404, 'NOT_FOUND', 'Album introuvable');
  return album;
}

/** Loads an album and throws unless the request may read it. */
async function loadReadableAlbum(req, id) {
  const album = await loadAlbum(id);
  const access = await resolveAlbumAccess(req, album);
  if (access !== 'granted') {
    const [status, code, message] = accessErrors[access];
    throw new HttpError(status, code, message);
  }
  return album;
}

/** Every album the viewer may open, parents followed by their sub-albums. */
async function listAlbums(req, res, next) {
  try {
    const albums = await visibleAlbumTree(req);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: albums.map((album) => publicAlbum(album)) });
  } catch (error) {
    next(error);
  }
}

async function getAlbum(req, res, next) {
  try {
    const album = await loadReadableAlbum(req, req.params.id);
    // Its visible sub-albums and parents come from the viewer's tree.
    const node = (await visibleAlbumTree(req)).find((item) => item.id === album.id) || { ...album, children: [] };
    const extra = {
      subAlbums: node.children.map((child) => publicAlbum(child)),
      ...(hasPermission(req.user, PERMISSIONS.EDIT_ALBUMS)
        ? { accessUserIds: await albumRepository.getAlbumAccessUserIds(album.id) }
        : {}),
    };
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: publicAlbum(node, extra) });
  } catch (error) {
    next(error);
  }
}

async function listAlbumPhotos(req, res, next) {
  try {
    const album = await loadReadableAlbum(req, req.params.id);
    const photos = await albumRepository.listAlbumPhotos(album.id);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: photos.map(publicPhoto) });
  } catch (error) {
    next(error);
  }
}

/** A sub-album lives in its parent's collection. */
async function loadParent(parentId) {
  const parent = await albumRepository.getAlbumById(parentId);
  if (!parent) throw new HttpError(400, 'INVALID_PARENT', 'Album parent introuvable');
  return parent;
}

async function createAlbum(req, res, next) {
  try {
    const payload = albumSchema.parse(req.body);
    let { collectionId } = payload;
    if (payload.parentId) collectionId = (await loadParent(payload.parentId)).collectionId;
    else await assertCollectionExists(collectionId);
    const passwordHash = payload.visibility === 'protected' && payload.password ? await hashPassword(payload.password) : null;
    const album = await albumRepository.createAlbum({
      name: payload.name,
      description: payload.description,
      visibility: payload.visibility,
      passwordHash,
      collectionId,
      parentId: payload.parentId || null,
    });

    if (payload.accessUserIds?.length) await albumRepository.setAlbumAccess(album.id, payload.accessUserIds);

    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_CREATE', objectType: 'album', objectId: String(album.id), metadata: { name: album.name }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: publicAlbum(album) });
  } catch (error) {
    next(error);
  }
}

async function updateAlbum(req, res, next) {
  try {
    const current = await loadAlbum(req.params.id);
    const payload = albumSchema.parse(req.body);

    let passwordHash = current.passwordHash;
    if (payload.visibility === 'public' || payload.removePassword) passwordHash = null;
    else if (payload.password) passwordHash = await hashPassword(payload.password);

    // The cover is the first photo: choosing one moves it to the front.
    if (payload.coverPhotoId) {
      const ids = (await albumRepository.listAlbumPhotos(current.id)).map((photo) => photo.id);
      if (!ids.includes(payload.coverPhotoId)) throw new HttpError(400, 'INVALID_COVER', 'La couverture doit être une photo de cet album');
      await db.transaction((run) => photoRepository.reorderPhotos(current.id, mergeOrder([payload.coverPhotoId], ids), run));
    }

    // undefined keeps the current place, null takes the album out of its parent (or collection).
    const parentId = payload.parentId === undefined ? current.parentId : payload.parentId;
    let collectionId;
    if (parentId) {
      if (parentId === current.id || (await albumRepository.listDescendantIds(current.id)).includes(parentId)) {
        throw new HttpError(400, 'INVALID_PARENT', 'Un album ne peut pas être rangé dans lui-même ni dans un de ses sous-albums');
      }
      collectionId = (await loadParent(parentId)).collectionId;
    } else {
      collectionId = payload.collectionId === undefined ? current.collectionId : payload.collectionId;
      if (collectionId !== current.collectionId) await assertCollectionExists(collectionId);
    }

    let updated = await albumRepository.updateAlbum(current.id, {
      name: payload.name,
      description: payload.description,
      visibility: payload.visibility,
      passwordHash,
      collectionId,
      parentId: parentId || null,
    });

    if (current.name !== updated.name || current.collectionId !== updated.collectionId || current.parentId !== updated.parentId) {
      await relocateAlbumPhotos(current.id);
      updated = await albumRepository.getAlbumById(current.id);
    }

    if (payload.accessUserIds) await albumRepository.setAlbumAccess(current.id, payload.accessUserIds);

    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_UPDATE', objectType: 'album', objectId: String(current.id), metadata: { name: updated.name }, ipAddress: req.ip });
    res.json({
      success: true,
      data: publicAlbum(updated, { accessUserIds: await albumRepository.getAlbumAccessUserIds(current.id) }),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * New order of albums sharing a place: the sub-albums of `parentId`, or else the
 * top-level albums of a collection (or those without collection).
 */
async function reorderAlbums(req, res, next) {
  try {
    const payload = albumOrderSchema.parse(req.body);
    if (payload.parentId) await loadParent(payload.parentId);
    else await assertCollectionExists(payload.collectionId);
    const siblings = await albumRepository.listSiblingIds({ parentId: payload.parentId, collectionId: payload.collectionId });
    const ids = mergeOrder(payload.ids, siblings);
    await db.transaction((run) => albumRepository.reorderAlbums(ids, run));
    res.json({ success: true, data: { ids } });
  } catch (error) {
    next(error);
  }
}

/** New order of an album's photos. The first one becomes the cover. */
async function reorderPhotos(req, res, next) {
  try {
    const album = await loadAlbum(req.params.id);
    const payload = orderSchema.parse(req.body);
    const ids = mergeOrder(payload.ids, (await albumRepository.listAlbumPhotos(album.id)).map((photo) => photo.id));
    await db.transaction((run) => photoRepository.reorderPhotos(album.id, ids, run));
    res.json({ success: true, data: { ids, coverPhotoId: ids[0] ?? null } });
  } catch (error) {
    next(error);
  }
}

async function deleteAlbum(req, res, next) {
  try {
    const album = await loadAlbum(req.params.id);
    const photos = await destroyAlbums([album.id]);
    await addAuditLog({ actorId: req.user.id, action: 'ALBUM_DELETE', objectType: 'album', objectId: String(album.id), metadata: { name: album.name, photos }, ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  accessErrors,
  loadAlbum,
  loadReadableAlbum,
  listAlbums,
  getAlbum,
  listAlbumPhotos,
  createAlbum,
  updateAlbum,
  reorderAlbums,
  reorderPhotos,
  deleteAlbum,
};
