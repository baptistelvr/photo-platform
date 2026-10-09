// Shapes sent to clients. Storage paths and password hashes never leave the server.

function publicAlbum(album, extra = {}) {
  if (!album) return null;
  return {
    id: album.id,
    name: album.name,
    description: album.description || '',
    visibility: album.visibility,
    hasPassword: Boolean(album.passwordHash),
    coverPhotoId: album.coverPhotoId ?? null,
    photosCount: Number(album.photosCount ?? 0),
    collectionId: album.collectionId ?? null,
    collectionName: album.collectionName ?? null,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    ...extra,
  };
}

/**
 * A collection as seen by one viewer: counts and cover only include albums they
 * may open. `visibleAlbums` come in the collection's order, so the cover is the
 * one of its first album (the first non-empty one).
 */
function publicCollection(collection, visibleAlbums = []) {
  const cover = visibleAlbums.find((album) => album.coverPhotoId);
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description || '',
    featured: Boolean(Number(collection.featured)),
    albumsCount: visibleAlbums.length,
    photosCount: visibleAlbums.reduce((sum, album) => sum + Number(album.photosCount ?? 0), 0),
    coverPhotoId: cover ? cover.coverPhotoId : null,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

function publicPhoto(photo) {
  if (!photo) return null;
  return {
    id: photo.id,
    albumId: photo.albumId,
    originalName: photo.originalName,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
  };
}

module.exports = { publicAlbum, publicCollection, publicPhoto };
