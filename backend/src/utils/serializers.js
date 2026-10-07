// Shapes sent to clients. Storage paths and password hashes never leave the server.

function publicAlbum(album, extra = {}) {
  if (!album) return null;
  return {
    id: album.id,
    name: album.name,
    description: album.description || '',
    visibility: album.visibility,
    hasPassword: Boolean(album.passwordHash),
    coverPhotoId: album.coverPhotoId ?? album.latestPhotoId ?? null,
    customCoverPhotoId: album.coverPhotoId ?? null,
    photosCount: Number(album.photosCount ?? 0),
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    ...extra,
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

module.exports = { publicAlbum, publicPhoto };
