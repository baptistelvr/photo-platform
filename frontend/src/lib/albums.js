/** "Collection › Parent › Album", or just the album name when it has neither. */
export function albumLabel(album) {
  return [album.collectionName, ...(album.ancestors || []).map((a) => a.name), album.name].filter(Boolean).join(' › ');
}

/** Album name indented by its depth, for <option> lists (the API lists parents before their sub-albums). */
export function albumOptionLabel(album) {
  return `${'\u2003'.repeat(album.depth || 0)}${album.depth ? '↳ ' : ''}${album.name}`;
}

/**
 * Albums grouped by collection. The API already returns them in the chosen
 * order (collections, then albums, each followed by its sub-albums), which is
 * kept as is; albums without collection come last.
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
