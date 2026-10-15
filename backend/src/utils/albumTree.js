/**
 * Arranges albums (given in sibling order) as a tree and returns them depth
 * first: each parent is followed by its sub-albums. Every album gets its depth,
 * its parents (from the top), its sub-albums, and the cover it shows: its own
 * first photo or, when it holds none, the cover of its first sub-album that has one.
 * Albums whose parent is not in the list (not visible to this viewer) act as roots,
 * so no name of an album the viewer cannot open ever shows up.
 */
function arrangeAlbums(albums) {
  const nodes = new Map(albums.map((album) => [album.id, { ...album, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const ordered = [];
  const visit = (node, ancestors) => {
    node.depth = ancestors.length;
    node.ancestors = ancestors;
    ordered.push(node);
    for (const child of node.children) visit(child, [...ancestors, { id: node.id, name: node.name }]);
    node.displayCoverPhotoId = node.coverPhotoId ?? node.children.map((child) => child.displayCoverPhotoId).find(Boolean) ?? null;
    node.totalPhotosCount = Number(node.photosCount ?? 0) + node.children.reduce((sum, child) => sum + child.totalPhotosCount, 0);
  };
  for (const root of roots) visit(root, []);
  return ordered;
}

module.exports = { arrangeAlbums };
