// Shapes sent to clients. Storage paths and password hashes never leave the server.

function publicAlbum(album, extra = {}) {
  if (!album) return null;
  return {
    id: album.id,
    name: album.name,
    description: album.description || '',
    visibility: album.visibility,
    hasPassword: Boolean(album.passwordHash),
    // An album without photos of its own shows the cover of its first sub-album.
    coverPhotoId: album.displayCoverPhotoId ?? album.coverPhotoId ?? null,
    photosCount: Number(album.photosCount ?? 0),
    collectionId: album.collectionId ?? null,
    collectionName: album.collectionName ?? null,
    parentId: album.parentId ?? null,
    depth: album.depth ?? 0,
    ancestors: album.ancestors ?? [],
    subAlbumsCount: album.children?.length ?? 0,
    totalPhotosCount: album.totalPhotosCount ?? Number(album.photosCount ?? 0),
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    ...extra,
  };
}

/**
 * A collection as seen by one viewer: counts and cover only include albums they
 * may open. `visibleAlbums` (sub-albums included, arranged by utils/albumTree)
 * come in the collection's order, so the cover is the one of its first album.
 */
function publicCollection(collection, visibleAlbums = []) {
  const top = visibleAlbums.filter((album) => !album.depth);
  const cover = top.find((album) => album.displayCoverPhotoId ?? album.coverPhotoId);
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description || '',
    featured: Boolean(Number(collection.featured)),
    visibility: collection.visibility || 'public',
    hasPassword: Boolean(collection.passwordHash),
    albumsCount: top.length,
    photosCount: visibleAlbums.reduce((sum, album) => sum + Number(album.photosCount ?? 0), 0),
    coverPhotoId: cover ? (cover.displayCoverPhotoId ?? cover.coverPhotoId) : null,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

function publicPhoto(photo) {
  if (!photo) return null;
  return {
    id: photo.id,
    albumId: photo.albumId,
    ...(photo.albumIds ? { albumIds: photo.albumIds } : {}),
    originalName: photo.originalName,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
  };
}

module.exports = { publicAlbum, publicCollection, publicPhoto };
