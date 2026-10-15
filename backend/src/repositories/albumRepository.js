const { query } = require('../config/db');
const { writeOrder } = require('./orderRepository');

// Own photos only; the cover is the first one in the album's order (a sub-album's
// cover is used when the album holds none, see utils/albumTree).
const albumColumns = `a.id, a.name, a.description, a.visibility, a.sort_order AS "sortOrder",
  a.password_hash AS "passwordHash", a.created_at AS "createdAt", a.updated_at AS "updatedAt",
  a.collection_id AS "collectionId", c.name AS "collectionName", a.parent_id AS "parentId",
  CAST((SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = a.id) AS INTEGER) AS "photosCount",
  (SELECT ap.photo_id FROM album_photos ap WHERE ap.album_id = a.id ORDER BY ap.sort_order, ap.photo_id LIMIT 1) AS "coverPhotoId"`;

/** Collection by collection in their order (albums without collection last), then each album's place among its siblings. */
async function listAlbums() {
  const { rows } = await query(`SELECT ${albumColumns}
    FROM albums a LEFT JOIN collections c ON c.id = a.collection_id
    ORDER BY CASE WHEN c.id IS NULL THEN 1 ELSE 0 END, c.sort_order, c.id, a.sort_order, a.id`);
  return rows;
}

async function getAlbumById(id) {
  const { rows } = await query(`SELECT ${albumColumns}
    FROM albums a LEFT JOIN collections c ON c.id = a.collection_id WHERE a.id = $1`, [id]);
  return rows[0] || null;
}

/** id → { id, name, parentId, collectionId } for every album: enough to walk the tree. */
async function albumLinks() {
  const { rows } = await query('SELECT id, name, parent_id AS "parentId", collection_id AS "collectionId" FROM albums');
  return new Map(rows.map((row) => [row.id, row]));
}

/** Names of the parents, from the top: they are part of the folder of the photos. */
async function getAncestors(albumId, links) {
  const map = links || await albumLinks();
  const chain = [];
  const seen = new Set([albumId]);
  let parentId = map.get(albumId)?.parentId;
  while (parentId && !seen.has(parentId) && map.has(parentId)) {
    seen.add(parentId);
    chain.unshift({ id: parentId, name: map.get(parentId).name });
    parentId = map.get(parentId).parentId;
  }
  return chain;
}

/** The album plus what storage needs to build its folder: Pictures/<collection>/<parents…>/<album>. */
async function getAlbumLocation(id) {
  const album = await getAlbumById(id);
  if (!album) return null;
  return { ...album, ancestorNames: (await getAncestors(album.id)).map((a) => a.name) };
}

/** All sub-albums below an album, parents before children. */
async function listDescendantIds(albumId, links) {
  const map = links || await albumLinks();
  const result = [];
  const walk = (id) => {
    for (const row of map.values()) {
      if (row.parentId === id && !result.includes(row.id)) {
        result.push(row.id);
        walk(row.id);
      }
    }
  };
  walk(albumId);
  return result;
}

/** Ids of the albums sharing a place: the sub-albums of a parent, or the top-level albums of a collection. */
async function listSiblingIds({ parentId = null, collectionId = null }) {
  let rows;
  if (parentId) ({ rows } = await query('SELECT id FROM albums WHERE parent_id = $1 ORDER BY sort_order, id', [parentId]));
  else if (collectionId) ({ rows } = await query('SELECT id FROM albums WHERE parent_id IS NULL AND collection_id = $1 ORDER BY sort_order, id', [collectionId]));
  else ({ rows } = await query('SELECT id FROM albums WHERE parent_id IS NULL AND collection_id IS NULL ORDER BY sort_order, id'));
  return rows.map((row) => row.id);
}

async function nextAlbumOrder(place) {
  const ids = await listSiblingIds(place);
  if (!ids.length) return 0;
  const { rows } = await query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next" FROM albums
    WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})`, ids);
  return Number(rows[0].next);
}

/** New albums go last among their siblings. */
async function createAlbum({ name, description, visibility, passwordHash, collectionId, parentId }) {
  const sortOrder = await nextAlbumOrder({ parentId, collectionId });
  const { rows } = await query(`INSERT INTO albums (name, description, visibility, password_hash, collection_id, parent_id, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
  [name, description || null, visibility, passwordHash || null, collectionId || null, parentId || null, sortOrder]);
  return getAlbumById(rows[0].id);
}

/**
 * An album that changes place (other parent or collection) goes last there, and
 * its whole sub-tree follows it into the collection.
 */
async function updateAlbum(id, { name, description, visibility, passwordHash, collectionId, parentId }) {
  const current = await getAlbumById(id);
  const moved = (current.collectionId ?? null) !== (collectionId ?? null) || (current.parentId ?? null) !== (parentId ?? null);
  const sortOrder = moved ? await nextAlbumOrder({ parentId, collectionId }) : current.sortOrder;
  await query(`UPDATE albums SET name = $1, description = $2, visibility = $3, password_hash = $4,
    collection_id = $5, parent_id = $6, sort_order = $7, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $8`,
  [name, description || null, visibility, passwordHash || null, collectionId || null, parentId || null, sortOrder, id]);
  if ((current.collectionId ?? null) !== (collectionId ?? null)) {
    for (const childId of await listDescendantIds(id)) {
      await query('UPDATE albums SET collection_id = $1 WHERE id = $2', [collectionId || null, childId]);
    }
  }
  return getAlbumById(id);
}

/** Every album of a collection, sub-albums included. */
async function listAlbumIdsInCollection(collectionId) {
  const { rows } = await query('SELECT id FROM albums WHERE collection_id = $1 ORDER BY sort_order, id', [collectionId]);
  return rows.map((row) => row.id);
}

async function reorderAlbums(ids, run) {
  await writeOrder('albums', ids, run);
}

async function deleteAlbum(id) {
  return query('DELETE FROM albums WHERE id = $1', [id]);
}

const photoColumns = `p.id, p.album_id AS "homeAlbumId", p.filename, p.original_name AS "originalName", p.size,
  p.mime_type AS "mimeType", p.width, p.height, p.original_path AS "originalPath", p.thumbnail_path AS "thumbnailPath",
  p.created_at AS "createdAt"`;

/**
 * The photos shown in an album, in its order, each with the ids of every album
 * it appears in. `albumId` is the album asked for (where the photo is seen).
 */
async function listAlbumPhotos(albumId) {
  const { rows } = await query(`SELECT ${photoColumns}, ap.album_id AS "albumId"
    FROM album_photos ap JOIN photos p ON p.id = ap.photo_id
    WHERE ap.album_id = $1 ORDER BY ap.sort_order, p.id`, [albumId]);
  if (!rows.length) return rows;
  const { rows: links } = await query(`SELECT photo_id AS "photoId", album_id AS "albumId" FROM album_photos
    WHERE photo_id IN (SELECT photo_id FROM album_photos WHERE album_id = $1) ORDER BY album_id`, [albumId]);
  const albumsOf = new Map();
  for (const link of links) {
    if (!albumsOf.has(link.photoId)) albumsOf.set(link.photoId, []);
    albumsOf.get(link.photoId).push(link.albumId);
  }
  return rows.map((row) => ({ ...row, albumIds: albumsOf.get(row.id) || [albumId] }));
}

/** Photos whose files are in this album's folder. */
async function listHomePhotos(albumId) {
  const { rows } = await query(`SELECT ${photoColumns}, p.album_id AS "albumId" FROM photos p WHERE p.album_id = $1`, [albumId]);
  return rows;
}

/** Photos of several albums at once, each album in its own order (same as listAlbumPhotos). */
async function listPhotosOfAlbums(albumIds) {
  const photos = [];
  for (let i = 0; i < albumIds.length; i += 500) {
    const ids = albumIds.slice(i, i + 500);
    const { rows } = await query(`SELECT p.id, ap.album_id AS "albumId", p.original_name AS "originalName", p.size,
      p.width, p.height, p.created_at AS "createdAt"
      FROM album_photos ap JOIN photos p ON p.id = ap.photo_id
      WHERE ap.album_id IN (${ids.map((_, n) => `$${n + 1}`).join(', ')})
      ORDER BY ap.sort_order, p.id`, ids);
    photos.push(...rows);
  }
  return photos;
}

/** Albums a photo appears in, with what access checks need. */
async function listAlbumsOfPhoto(photoId) {
  const { rows } = await query(`SELECT a.id, a.name, a.visibility, a.password_hash AS "passwordHash",
    a.collection_id AS "collectionId" FROM album_photos ap JOIN albums a ON a.id = ap.album_id
    WHERE ap.photo_id = $1 ORDER BY a.id`, [photoId]);
  return rows;
}

async function getAlbumAccessUserIds(albumId) {
  const { rows } = await query('SELECT user_id AS "userId" FROM album_access WHERE album_id = $1', [albumId]);
  return rows.map((row) => row.userId);
}

async function setAlbumAccess(albumId, userIds) {
  await query('DELETE FROM album_access WHERE album_id = $1', [albumId]);
  for (const userId of new Set(userIds)) {
    await query('INSERT INTO album_access (album_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [albumId, userId]);
  }
}

async function setUserAlbumAccess(userId, albumIds) {
  await query('DELETE FROM album_access WHERE user_id = $1', [userId]);
  for (const albumId of new Set(albumIds)) {
    await query(
      'INSERT INTO album_access (album_id, user_id) SELECT id, $2 FROM albums WHERE id = $1 ON CONFLICT DO NOTHING',
      [albumId, userId],
    );
  }
}

async function listAccessByUser() {
  const { rows } = await query('SELECT user_id AS "userId", album_id AS "albumId" FROM album_access');
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, []);
    map.get(row.userId).push(row.albumId);
  }
  return map;
}

async function listAccessibleAlbumIds(userId) {
  const { rows } = await query('SELECT album_id AS "albumId" FROM album_access WHERE user_id = $1', [userId]);
  return rows.map((row) => row.albumId);
}

async function userHasAlbumAccess(albumId, userId) {
  const { rows } = await query('SELECT 1 FROM album_access WHERE album_id = $1 AND user_id = $2', [albumId, userId]);
  return rows.length > 0;
}

module.exports = {
  listAlbums,
  getAlbumById,
  albumLinks,
  getAncestors,
  getAlbumLocation,
  listDescendantIds,
  listSiblingIds,
  createAlbum,
  updateAlbum,
  listAlbumIdsInCollection,
  reorderAlbums,
  deleteAlbum,
  listAlbumPhotos,
  listHomePhotos,
  listPhotosOfAlbums,
  listAlbumsOfPhoto,
  getAlbumAccessUserIds,
  setAlbumAccess,
  setUserAlbumAccess,
  listAccessByUser,
  listAccessibleAlbumIds,
  userHasAlbumAccess,
};
