/** "Collection › Album", or just the album name when it has no collection. */
export function albumLabel(album) {
  return album.collectionName ? `${album.collectionName} › ${album.name}` : album.name;
}

/**
 * Albums grouped by collection. The API already returns them in the chosen
 * order (collections, then albums within each), which is kept as is; albums
 * without collection come last.
 */
export function groupAlbumsByCollection(albums = []) {
  const groups = new Map();
  for (const album of albums) {
    const key = album.collectionId ?? 'none';
    if (!groups.has(key)) groups.set(key, { key, label: album.collectionName || 'Sans collection', collectionId: album.collectionId ?? null, albums: [] });
    groups.get(key).albums.push(album);
  }
  return [...groups.values()].sort((a, b) => (a.collectionId === null) - (b.collectionId === null));
}
