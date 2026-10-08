const { addAuditLog, listAuditLogs } = require('../repositories/auditRepository');
const photoRepository = require('../repositories/photoRepository');
const storageService = require('../services/storageService');
const { storagePruneSchema } = require('../utils/schemas');

async function getLogs(_req, res, next) {
  try {
    res.json({ success: true, data: await listAuditLogs() });
  } catch (error) {
    next(error);
  }
}

/** Photos whose original or thumbnail is not in the current storage (e.g. after switching provider). */
async function findMissingPhotos() {
  const [keys, photos] = await Promise.all([storageService.listStoredKeys(), photoRepository.listAllPaths()]);
  const missing = photos.filter((photo) => !keys.has(photo.originalPath) || !keys.has(photo.thumbnailPath));
  return { photos, missing, files: keys.size };
}

async function getStorage(_req, res, next) {
  try {
    const { photos, missing, files } = await findMissingPhotos();
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: { ...storageService.describe(), photos: photos.length, files, missing: missing.length },
    });
  } catch (error) {
    next(error);
  }
}

/** Forgets photos whose files are gone, so a folder re-import uploads them again. */
async function pruneStorage(req, res, next) {
  try {
    const { deleteEmptyAlbums } = storagePruneSchema.parse(req.body || {});
    const { missing } = await findMissingPhotos();
    await photoRepository.deletePhotoRows(missing.map((photo) => photo.id));
    const removedAlbums = deleteEmptyAlbums ? await photoRepository.deleteEmptyAlbums() : 0;
    await addAuditLog({ actorId: req.user.id, action: 'STORAGE_PRUNE', objectType: 'storage', metadata: { photos: missing.length, albums: removedAlbums }, ipAddress: req.ip });
    res.json({ success: true, data: { removedPhotos: missing.length, removedAlbums } });
  } catch (error) {
    next(error);
  }
}

module.exports = { getLogs, getStorage, pruneStorage };
