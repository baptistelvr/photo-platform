const albumRepository = require('../repositories/albumRepository');
const { addAuditLog } = require('../repositories/auditRepository');
const collectionRepository = require('../repositories/collectionRepository');
const { hasPermission, filterVisibleAlbums } = require('../services/accessService');
const { PERMISSIONS } = require('../constants/permissions');
const { HttpError } = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { collectionSchema } = require('../utils/schemas');
const { publicAlbum, publicCollection } = require('../utils/serializers');
const { destroyAlbum, relocateAlbumPhotos } = require('./albumController');

const MANAGE = [PERMISSIONS.CREATE_ALBUMS, PERMISSIONS.EDIT_ALBUMS, PERMISSIONS.DELETE_ALBUMS];
const canManage = (user) => MANAGE.some((permission) => hasPermission(user, permission));
const byName = (a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

async function visibleAlbumsByCollection(req) {
  const albums = await filterVisibleAlbums(req, await albumRepository.listAlbums());
  const byCollection = new Map();
  for (const album of albums) {
    if (!album.collectionId) continue;
    if (!byCollection.has(album.collectionId)) byCollection.set(album.collectionId, []);
    byCollection.get(album.collectionId).push(album);
  }
  return byCollection;
}

async function loadCollection(id) {
  const collection = await collectionRepository.getCollectionById(parseId(id, 'Collection'));
  if (!collection) throw new HttpError(404, 'NOT_FOUND', 'Collection introuvable');
  return collection;
}

/**
 * Collections that hold at least one album the viewer may open. Album managers
 * also see empty collections, so they can fill them.
 */
async function listCollections(req, res, next) {
  try {
    const [collections, byCollection] = await Promise.all([
      collectionRepository.listCollections(),
      visibleAlbumsByCollection(req),
    ]);
    const manager = canManage(req.user);
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: collections
        .filter((collection) => manager || byCollection.has(collection.id))
        .map((collection) => publicCollection(collection, byCollection.get(collection.id))),
    });
  } catch (error) {
    next(error);
  }
}

async function getCollection(req, res, next) {
  try {
    const collection = await loadCollection(req.params.id);
    const albums = (await visibleAlbumsByCollection(req)).get(collection.id) || [];
    // Same answer as a missing collection: do not reveal ones the viewer cannot see.
    if (!albums.length && !canManage(req.user)) throw new HttpError(404, 'NOT_FOUND', 'Collection introuvable');
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        ...publicCollection(collection, albums),
        // Albums usually mirror sub-folders: listed by name, like a file browser.
        albums: [...albums].sort((a, b) => byName(a.name, b.name)).map((album) => publicAlbum(album)),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function createCollection(req, res, next) {
  try {
    const payload = collectionSchema.parse(req.body);
    const collection = await collectionRepository.createCollection(payload);
    await addAuditLog({ actorId: req.user.id, action: 'COLLECTION_CREATE', objectType: 'collection', objectId: String(collection.id), metadata: { name: collection.name }, ipAddress: req.ip });
    res.status(201).json({ success: true, data: publicCollection(collection) });
  } catch (error) {
    next(error);
  }
}

async function updateCollection(req, res, next) {
  try {
    const current = await loadCollection(req.params.id);
    const payload = collectionSchema.parse(req.body);
    const updated = await collectionRepository.updateCollection(current.id, payload);

    // The collection name is part of every photo path inside it.
    if (updated.name !== current.name) {
      for (const albumId of await albumRepository.listAlbumIdsInCollection(current.id)) {
        await relocateAlbumPhotos(albumId);
      }
    }

    await addAuditLog({ actorId: req.user.id, action: 'COLLECTION_UPDATE', objectType: 'collection', objectId: String(current.id), metadata: { name: updated.name }, ipAddress: req.ip });
    const albums = (await visibleAlbumsByCollection(req)).get(current.id) || [];
    res.json({ success: true, data: publicCollection(updated, albums) });
  } catch (error) {
    next(error);
  }
}

/** Deletes the collection together with its albums and their photos. */
async function deleteCollection(req, res, next) {
  try {
    const collection = await loadCollection(req.params.id);
    let photos = 0;
    const albumIds = await albumRepository.listAlbumIdsInCollection(collection.id);
    for (const albumId of albumIds) {
      photos += await destroyAlbum(await albumRepository.getAlbumById(albumId));
    }
    await collectionRepository.deleteCollection(collection.id);
    await addAuditLog({ actorId: req.user.id, action: 'COLLECTION_DELETE', objectType: 'collection', objectId: String(collection.id), metadata: { name: collection.name, albums: albumIds.length, photos }, ipAddress: req.ip });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = { listCollections, getCollection, createCollection, updateCollection, deleteCollection };
