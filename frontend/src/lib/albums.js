const byName = (a, b) => a.localeCompare(b, 'fr', { numeric: true });

/** "Collection › Album", or just the album name when it has no collection. */
export function albumLabel(album) {
  return album.collectionName ? `${album.collectionName} › ${album.name}` : album.name;
}

/** Albums grouped by collection name (alphabetical), albums without collection last. */
export function groupAlbumsByCollection(albums = []) {
  const groups = new Map();
  for (const album of albums) {
    const key = album.collectionId ?? 'none';
    if (!groups.has(key)) groups.set(key, { key, label: album.collectionName || 'Sans collection', collectionId: album.collectionId ?? null, albums: [] });
    groups.get(key).albums.push(album);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, albums: group.albums.sort((a, b) => byName(a.name, b.name)) }))
    .sort((a, b) => (a.collectionId === null) - (b.collectionId === null) || byName(a.label, b.label));
}
