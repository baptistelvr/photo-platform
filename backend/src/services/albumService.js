const albumRepository = require('../repositories/albumRepository');
const photoRepository = require('../repositories/photoRepository');
const { arrangeAlbums } = require('../utils/albumTree');
const { filterVisibleAlbums } = require('./accessService');
const storageService = require('./storageService');

/** The albums this viewer may open, as a tree read depth first (see utils/albumTree). */
async function visibleAlbumTree(req) {
  return arrangeAlbums(await filterVisibleAlbums(req, await albumRepository.listAlbums()));
}

/**
 * Files live under Pictures/<collection>/<parents…>/<album>/…; after a rename or
 * a change of place, move the files of the album and of its sub-albums (a few at a time).
 */
async function relocateAlbumPhotos(albumId) {
  const links = await albumRepository.albumLinks();
  for (const id of [albumId, ...(await albumRepository.listDescendantIds(albumId, links))]) {
    const location = await albumRepository.getAlbumLocation(id);
    const photos = await albumRepository.listHomePhotos(id);
    for (let i = 0; i < photos.length; i += 8) {
      await Promise.all(photos.slice(i, i + 8).map(async (photo) => {
        const paths = await storageService.movePhotoFiles(photo, location);
        if (paths.originalPath !== photo.originalPath) await photoRepository.updatePaths(photo.id, paths);
      }));
    }
  }
}

/** Moves a photo's files into another album's folder, which becomes its home. */
async function rehomePhoto(photo, albumId) {
  const location = await albumRepository.getAlbumLocation(albumId);
  const paths = await storageService.movePhotoFiles(photo, location);
  await photoRepository.setHomeAlbum(photo.id, albumId, paths);
}

/**
 * Deletes albums together with their sub-albums. A photo also shown in an album
 * that stays is kept (its files move there); the others are deleted with their
 * files. Returns the number of photos deleted.
 */
async function destroyAlbums(albumIds) {
  const links = await albumRepository.albumLinks();
  const doomed = new Set();
  for (const id of albumIds) {
    doomed.add(id);
    for (const childId of await albumRepository.listDescendantIds(id, links)) doomed.add(childId);
  }

  let deleted = 0;
  for (const id of doomed) {
    for (const photo of await albumRepository.listHomePhotos(id)) {
      const keep = (await photoRepository.listPhotoAlbumIds(photo.id)).find((albumId) => !doomed.has(albumId));
      if (keep) {
        await rehomePhoto(photo, keep);
      } else {
        await storageService.deletePhotoFiles(photo);
        await photoRepository.deletePhoto(photo.id);
        deleted += 1;
      }
    }
  }
  // Parents were added before their children: delete from the bottom up.
  for (const id of [...doomed].reverse()) await albumRepository.deleteAlbum(id);
  return deleted;
}

module.exports = { visibleAlbumTree, relocateAlbumPhotos, rehomePhoto, destroyAlbums };
