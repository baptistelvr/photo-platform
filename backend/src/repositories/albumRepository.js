const { query } = require('../config/db');
const { writeOrder } = require('./orderRepository');

// The cover is the first photo in the album's order.
const albumColumns = `a.id, a.name, a.description, a.visibility, a.sort_order AS "sortOrder",
  a.password_hash AS "passwordHash", a.created_at AS "createdAt", a.updated_at AS "updatedAt",
  a.collection_id AS "collectionId", c.name AS "collectionName",
  CAST((SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS INTEGER) AS "photosCount",
  (SELECT p.id FROM photos p WHERE p.album_id = a.id ORDER BY p.sort_order, p.id LIMIT 1) AS "coverPhotoId"`;

/** Collection by collection in their order (albums without collection last), then each album's place. */
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

/** Next free place at the end of a collection (or of the albums without collection). */
async function nextAlbumOrder(collectionId) {
  const { rows } = collectionId
    ? await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next" FROM albums WHERE collection_id = $1', [collectionId])
    : await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next" FROM albums WHERE collection_id IS NULL');
  return Number(rows[0].next);
}

async function createAlbum({ name, description, visibility, passwordHash, collectionId }) {
  const { rows } = await query(`INSERT INTO albums (name, description, visibility, password_hash, collection_id, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [name, description || null, visibility, passwordHash || null, collectionId || null, await nextAlbumOrder(collectionId)]);
  return getAlbumById(rows[0].id);
}

/** An album moved to another collection goes at the end of it. */
async function updateAlbum(id, { name, description, visibility, passwordHash, collectionId }) {
  const current = await getAlbumById(id);
  const sortOrder = (current.collectionId ?? null) === (collectionId ?? null) ? current.sortOrder : await nextAlbumOrder(collectionId);
  await query(`UPDATE albums SET name = $1, description = $2, visibility = $3, password_hash = $4,
    collection_id = $5, sort_order = $6, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT) WHERE id = $7`,
  [name, description || null, visibility, passwordHash || null, collectionId || null, sortOrder, id]);
  return getAlbumById(id);
}

async function listAlbumIdsInCollection(collectionId) {
  const { rows } = collectionId
    ? await query('SELECT id FROM albums WHERE collection_id = $1 ORDER BY sort_order, id', [collectionId])
    : await query('SELECT id FROM albums WHERE collection_id IS NULL ORDER BY sort_order, id');
  return rows.map((row) => row.id);
}

async function reorderAlbums(ids, run) {
  await writeOrder('albums', ids, run);
}

async function deleteAlbum(id) {
  return query('DELETE FROM albums WHERE id = $1', [id]);
}

async function listAlbumPhotos(albumId) {
  const { rows } = await query(`SELECT id, album_id AS "albumId", filename, original_name AS "originalName", size,
    mime_type AS "mimeType", width, height, original_path AS "originalPath", thumbnail_path AS "thumbnailPath",
    created_at AS "createdAt" FROM photos WHERE album_id = $1 ORDER BY sort_order, id`, [albumId]);
  return rows;
}

/** Photos of several albums at once, each album in its own order (same as listAlbumPhotos). */
async function listPhotosOfAlbums(albumIds) {
  const photos = [];
  for (let i = 0; i < albumIds.length; i += 500) {
    const ids = albumIds.slice(i, i + 500);
    const { rows } = await query(`SELECT id, album_id AS "albumId", original_name AS "originalName", size, width, height,
      created_at AS "createdAt" FROM photos WHERE album_id IN (${ids.map((_, n) => `$${n + 1}`).join(', ')})
      ORDER BY sort_order, id`, ids);
    photos.push(...rows);
  }
  return photos;
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
  createAlbum,
  updateAlbum,
  listAlbumIdsInCollection,
  reorderAlbums,
  deleteAlbum,
  listAlbumPhotos,
  listPhotosOfAlbums,
  getAlbumAccessUserIds,
  setAlbumAccess,
  setUserAlbumAccess,
  listAccessByUser,
  listAccessibleAlbumIds,
  userHasAlbumAccess,
};
